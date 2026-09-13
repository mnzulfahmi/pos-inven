CREATE FUNCTION public.nusa_assert(ok boolean, code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',code USING ERRCODE='P0001'; END IF; END $$;

CREATE FUNCTION public.nusa_writable(t uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.nusa_subscriptions; BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t),'FORBIDDEN');
 PERFORM public.nusa_assert((SELECT status='active' FROM public.nusa_tenants WHERE id=t),'TENANT_SUSPENDED');
 SELECT * INTO s FROM public.nusa_subscriptions WHERE tenant_id=t FOR UPDATE;
 PERFORM public.nusa_assert(s.status='pending' OR now()<CASE WHEN s.status='trial' THEN s.period_end ELSE coalesce(s.grace_end,s.period_end) END,'SUBSCRIPTION_EXPIRED');
END $$;

CREATE FUNCTION public.nusa_check_quantity(t uuid,v uuid,q numeric,allow_zero boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p int; BEGIN
 SELECT quantity_precision INTO p FROM public.nusa_variants WHERE tenant_id=t AND id=v;
 PERFORM public.nusa_assert(p IS NOT NULL,'PRODUCT_NOT_FOUND');
 PERFORM public.nusa_assert(q IS NOT NULL AND q>=CASE WHEN allow_zero THEN 0 ELSE 0.001 END AND q<=1000000 AND q=round(q,p),'INVALID_QUANTITY');
END $$;

CREATE FUNCTION public.nusa_move(t uuid,o uuid,v uuid,q numeric,c numeric,d uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.nusa_balances; val numeric; newval numeric; newcost numeric; minqty numeric; BEGIN
 IF q=0 THEN RETURN; END IF;
 INSERT INTO public.nusa_balances(tenant_id,outlet_id,variant_id) VALUES(t,o,v) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.nusa_balances WHERE outlet_id=o AND variant_id=v FOR UPDATE;
 PERFORM public.nusa_assert(b.tenant_id=t AND b.quantity+q>=0,'STOCK_CONFLICT');
 IF q<0 THEN c:=b.unit_cost; END IF;
 PERFORM public.nusa_assert(c IS NOT NULL AND c>=0,'UNIT_COST_REQUIRED');
 val:=round(q*c,6); newval:=CASE WHEN b.quantity+q=0 THEN 0 ELSE greatest(0,b.value+val) END;
 -- The final issue takes the remaining carrying value, avoiding rounding drift.
 IF b.quantity+q=0 THEN val:=-b.value; END IF;
 newcost:=CASE WHEN b.quantity+q>0 THEN round(newval/(b.quantity+q),6) ELSE c END;
 UPDATE public.nusa_balances SET quantity=b.quantity+q,unit_cost=newcost,value=newval,version=version+1 WHERE outlet_id=o AND variant_id=v;
 INSERT INTO public.nusa_stock_movements(tenant_id,outlet_id,document_id,variant_id,delta,unit_cost,value_delta,balance_after)
 VALUES(t,o,d,v,q,c,val,b.quantity+q);
 SELECT minimum INTO minqty FROM public.nusa_reorder_rules WHERE outlet_id=o AND variant_id=v;
 IF minqty IS NOT NULL AND b.quantity+q<=minqty THEN
  INSERT INTO public.nusa_notifications(tenant_id,outlet_id,variant_id,title) VALUES(t,o,v,'Stok mencapai batas minimum') ON CONFLICT DO NOTHING;
 ELSE UPDATE public.nusa_notifications SET resolved_at=now() WHERE outlet_id=o AND variant_id=v AND resolved_at IS NULL; END IF;
END $$;

CREATE FUNCTION public.nusa_cash_expected(s uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$ SELECT opening_cash+coalesce((SELECT sum(amount) FROM public.nusa_cash_movements WHERE shift_id=s),0) FROM public.nusa_shifts WHERE id=s $$;

CREATE FUNCTION public.nusa_quote(t uuid,o uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE lines jsonb; sub bigint; disc bigint:=coalesce((p->>'discount')::bigint,0); rate numeric; tx bigint; result jsonb; sh public.nusa_shifts; BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t,o) AND public.nusa_role(t) IN ('owner','manager','cashier'),'FORBIDDEN');
 PERFORM public.nusa_assert(jsonb_typeof(p->'items')='array' AND jsonb_array_length(p->'items') BETWEEN 1 AND 100,'INVALID_ITEMS');
 PERFORM public.nusa_assert((SELECT count(*)=count(DISTINCT x->>'productId') FROM jsonb_array_elements(p->'items') x),'DUPLICATE_ITEM');
 SELECT * INTO sh FROM public.nusa_shifts WHERE id=(p->>'shiftId')::uuid AND tenant_id=t AND outlet_id=o AND closed_at IS NULL;
 PERFORM public.nusa_assert(sh.id IS NOT NULL AND (sh.opened_by=auth.uid() OR public.nusa_role(t) IN ('owner','manager')),'SHIFT_CLOSED');
 SELECT tax_rate INTO rate FROM public.nusa_tenants WHERE id=t;
 PERFORM public.nusa_check_quantity(t,(x->>'productId')::uuid,(x->>'quantity')::numeric) FROM jsonb_array_elements(p->'items') x;
 SELECT jsonb_agg(jsonb_build_object('productId',v.id,'name',pr.name,'sku',v.sku,'quantity',(x->>'quantity')::numeric,'price',v.price,'subtotal',round(v.price*(x->>'quantity')::numeric),'version',v.version,'stock',coalesce(b.quantity,0)) ORDER BY v.id)
 INTO lines FROM jsonb_array_elements(p->'items') x JOIN public.nusa_variants v ON v.id=(x->>'productId')::uuid AND v.tenant_id=t AND v.active
 JOIN public.nusa_products pr ON pr.id=v.product_id AND pr.active
 LEFT JOIN public.nusa_balances b ON b.outlet_id=o AND b.variant_id=v.id;
 PERFORM public.nusa_assert(jsonb_array_length(lines)=jsonb_array_length(p->'items'),'PRODUCT_NOT_FOUND');
 SELECT sum((x->>'subtotal')::bigint) INTO sub FROM jsonb_array_elements(lines) x;
 PERFORM public.nusa_assert(sub<=1000000000 AND disc BETWEEN 0 AND sub,'INVALID_DISCOUNT');
 IF public.nusa_role(t)='cashier' THEN
  PERFORM public.nusa_assert(disc<=floor(sub*(SELECT discount_limit FROM public.nusa_tenants WHERE id=t)/100),'DISCOUNT_APPROVAL_REQUIRED');
 END IF;
 tx:=round((sub-disc)*rate/100);
 -- Largest remainder allocations, tied by variant UUID; amounts stay immutable for refunds.
 WITH raw AS(SELECT x,(x->>'subtotal')::numeric w,x->>'productId' id FROM jsonb_array_elements(lines) x),
 d0 AS(SELECT *,CASE WHEN sub=0 THEN 0 ELSE disc*w/sub END exact FROM raw),
 d1 AS(SELECT *,floor(exact) base,row_number() OVER(ORDER BY exact-floor(exact) DESC,id) rn FROM d0),
 d2 AS(SELECT *,base+CASE WHEN rn<=disc-sum(base) OVER() THEN 1 ELSE 0 END da FROM d1),
 t0 AS(SELECT *,w-da net,CASE WHEN sub=disc THEN 0 ELSE tx*(w-da)/(sub-disc) END texact FROM d2),
 t1 AS(SELECT *,floor(texact) tb,row_number() OVER(ORDER BY texact-floor(texact) DESC,id) trn FROM t0)
 SELECT jsonb_agg(x||jsonb_build_object('discount',da,'net',net,'tax',tb+CASE WHEN trn<=tx-sumtax THEN 1 ELSE 0 END) ORDER BY id) INTO lines
 FROM(SELECT *,sum(tb) OVER() sumtax FROM t1) a;
 result:=jsonb_build_object('items',lines,'subtotal',sub,'discount',disc,'tax',tx,'total',sub-disc+tx,'outletId',o,'shiftId',sh.id,'taxRate',rate);
 RETURN result||jsonb_build_object('hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'),'expiresAt',now()+interval '5 minutes');
END $$;

CREATE FUNCTION public.nusa_onboard(p jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t uuid; o uuid; r uuid; existing public.nusa_onboarding_requests; h text:=md5(p::text); u record; BEGIN
 PERFORM public.nusa_assert(public.nusa_verified(),'EMAIL_VERIFICATION_REQUIRED');
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO existing FROM public.nusa_onboarding_requests WHERE user_id=auth.uid() AND key=k;
 IF FOUND THEN PERFORM public.nusa_assert(existing.request_hash=h,'IDEMPOTENCY_CONFLICT');RETURN jsonb_build_object('tenantId',existing.tenant_id); END IF;
 PERFORM public.nusa_assert(length(trim(p->>'name')) BETWEEN 1 AND 160 AND length(trim(p->>'outletName')) BETWEEN 1 AND 160,'INVALID_PROFILE');
 SELECT id,email,profile INTO u FROM auth.users WHERE id=auth.uid();
 INSERT INTO public.nusa_tenants(name,address,owner_id) VALUES(trim(p->>'name'),coalesce(p->>'address',''),auth.uid()) RETURNING id INTO t;
 INSERT INTO public.nusa_memberships(tenant_id,user_id,email,name,role) VALUES(t,auth.uid(),u.email,coalesce(u.profile->>'name','Pemilik'),'owner');
 INSERT INTO public.nusa_outlets(tenant_id,name,code,address) VALUES(t,trim(p->>'outletName'),'OUT-001',coalesce(p->>'address','')) RETURNING id INTO o;
 INSERT INTO public.nusa_registers(tenant_id,outlet_id,name) VALUES(t,o,coalesce(nullif(trim(p->>'registerName'),''),'Kasir 01')) RETURNING id INTO r;
 INSERT INTO public.nusa_subscriptions(tenant_id,plan_id,status) VALUES(t,'pro-v1','pending');
 INSERT INTO public.nusa_onboarding_requests VALUES(auth.uid(),k,t,h);
 INSERT INTO public.nusa_audit(tenant_id,actor_id,action,entity_id,request_id) VALUES(t,auth.uid(),'onboarding_started',t,k);
 RETURN jsonb_build_object('tenantId',t,'outletId',o,'registerId',r);
END $$;

CREATE FUNCTION public.nusa_command(t uuid,op text,p jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
#variable_conflict use_variable
DECLARE role_name text; o uuid:=nullif(p->>'outletId','')::uuid; actor uuid:=auth.uid();
 id uuid; parent uuid; doc uuid; v uuid; cat uuid; sh public.nusa_shifts; po public.nusa_purchase_orders;
 inv public.nusa_invoices; sub public.nusa_subscriptions; plan public.nusa_plan_versions;
 item record; rec record; b public.nusa_balances; x jsonb; quote jsonb; result jsonb:='{}';
 prior public.nusa_idempotency; qty numeric; cost numeric; amount bigint; total bigint:=0; nettotal bigint:=0; taxtotal bigint:=0;
 already numeric; already_net bigint; already_tax bigint; qnet bigint; qtax bigint; reqhash text:=md5(p::text);
 token text; mem public.nusa_memberships; sale public.nusa_sales; ref public.nusa_refunds; cnt public.nusa_stock_counts;
BEGIN
 PERFORM public.nusa_assert(k IS NOT NULL AND jsonb_typeof(p)='object' AND octet_length(p::text)<=262144,'INVALID_REQUEST');
 PERFORM public.nusa_assert(public.nusa_verified(),'EMAIL_VERIFICATION_REQUIRED');
 -- Also serializes membership revocation, plan changes, and quota reservations.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 role_name:=public.nusa_role(t);
 IF op IN ('verify-invoice','tenant-status') THEN PERFORM public.nusa_assert(public.nusa_operator(),'OPERATOR_REQUIRED');
 ELSE PERFORM public.nusa_assert(public.nusa_access(t,o),'FORBIDDEN'); END IF;
 SELECT * INTO prior FROM public.nusa_idempotency WHERE tenant_id=t AND operation=op AND key=k;
 IF FOUND THEN PERFORM public.nusa_assert(prior.actor_id=actor AND prior.request_hash=reqhash,'IDEMPOTENCY_CONFLICT');RETURN prior.response; END IF;
 IF op NOT IN ('verify-invoice','tenant-status','request-invoice','attach-proof') THEN PERFORM public.nusa_writable(t); END IF;
 IF o IS NOT NULL THEN PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM public.nusa_outlets WHERE tenant_id=t AND nusa_outlets.id=o AND active),'OUTLET_INACTIVE'); END IF;

 CASE op
 WHEN 'finish-onboarding' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');
  UPDATE public.nusa_subscriptions SET status='trial',period_start=now(),period_end=now()+interval '14 days',version=version+1 WHERE tenant_id=t AND status='pending';
  UPDATE public.nusa_tenants SET onboarded=true WHERE nusa_tenants.id=t;
 WHEN 'settings' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');
  UPDATE public.nusa_tenants SET name=trim(p->>'name'),address=coalesce(p->>'address',''),tax_rate=(p->>'tax')::numeric,
   discount_limit=(p->>'discount')::numeric,receipt_footer=coalesce(p->>'receipt',''),version=version+1 WHERE nusa_tenants.id=t;
 WHEN 'save-outlet' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED'); id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  SELECT pv.* INTO plan FROM public.nusa_plan_versions pv JOIN public.nusa_subscriptions s ON s.plan_id=pv.id WHERE s.tenant_id=t;
  IF coalesce((p->>'active')::boolean,true) AND NOT EXISTS(SELECT 1 FROM public.nusa_outlets WHERE tenant_id=t AND nusa_outlets.id=id AND active) THEN
   PERFORM public.nusa_assert((SELECT count(*) FROM public.nusa_outlets WHERE tenant_id=t AND active)<plan.outlet_limit,'PLAN_OUTLET_LIMIT');
  END IF;
  IF p->>'active'='false' THEN
   PERFORM public.nusa_assert(NOT EXISTS(SELECT 1 FROM public.nusa_shifts WHERE outlet_id=id AND closed_at IS NULL) AND NOT EXISTS(SELECT 1 FROM public.nusa_purchase_orders WHERE outlet_id=id AND status IN ('draft','approved','partial')),'OUTLET_BUSY');
  END IF;
  INSERT INTO public.nusa_outlets(id,tenant_id,name,code,address,active) VALUES(id,t,p->>'name',coalesce(p->>'code',id::text),coalesce(p->>'address',''),coalesce((p->>'active')::boolean,true))
  ON CONFLICT ON CONSTRAINT nusa_outlets_pkey DO UPDATE SET name=excluded.name,address=excluded.address,active=excluded.active WHERE nusa_outlets.tenant_id=t;
  PERFORM public.nusa_assert(FOUND,'FORBIDDEN'); result:=jsonb_build_object('id',id);
 WHEN 'save-register' THEN
  PERFORM public.nusa_assert(role_name='owner' AND o IS NOT NULL,'OWNER_REQUIRED'); id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  PERFORM public.nusa_assert(NOT EXISTS(SELECT 1 FROM public.nusa_shifts WHERE register_id=id AND closed_at IS NULL),'SHIFT_OPEN');
  INSERT INTO public.nusa_registers(id,tenant_id,outlet_id,name,active) VALUES(id,t,o,p->>'name',coalesce((p->>'active')::boolean,true))
  ON CONFLICT ON CONSTRAINT nusa_registers_pkey DO UPDATE SET name=excluded.name,active=excluded.active WHERE nusa_registers.tenant_id=t AND nusa_registers.outlet_id=o;
  PERFORM public.nusa_assert(FOUND,'FORBIDDEN');result:=jsonb_build_object('id',id);
 WHEN 'save-product','import-products' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');
  PERFORM public.nusa_assert(op='save-product' OR (jsonb_typeof(p->'products')='array' AND jsonb_array_length(p->'products') BETWEEN 1 AND 100),'IMPORT_BATCH_LIMIT');
  FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN op='save-product' THEN jsonb_build_array(p) ELSE p->'products' END) LOOP
   id:=coalesce(nullif(x->>'id','')::uuid,gen_random_uuid()); parent:=NULL;
   SELECT product_id INTO parent FROM public.nusa_variants WHERE tenant_id=t AND nusa_variants.id=id;
   IF op='import-products' THEN PERFORM public.nusa_assert(parent IS NULL,'IMPORT_DUPLICATE'); END IF;
   INSERT INTO public.nusa_categories(tenant_id,name) VALUES(t,coalesce(nullif(trim(x->>'category'),''),'Lainnya')) ON CONFLICT DO NOTHING;
   SELECT c.id INTO cat FROM public.nusa_categories c WHERE c.tenant_id=t AND lower(c.name)=lower(coalesce(nullif(trim(x->>'category'),''),'Lainnya'));
   IF parent IS NULL THEN INSERT INTO public.nusa_products(tenant_id,name,category_id,active) VALUES(t,trim(x->>'name'),cat,NOT coalesce((x->>'archived')::boolean,false)) RETURNING nusa_products.id INTO parent;
   ELSE UPDATE public.nusa_products SET name=trim(x->>'name'),category_id=cat,active=NOT coalesce((x->>'archived')::boolean,false) WHERE tenant_id=t AND nusa_products.id=parent; END IF;
   INSERT INTO public.nusa_variants(id,tenant_id,product_id,name,sku,barcode,price,initial_cost,active,unit,quantity_precision)
   VALUES(id,t,parent,coalesce(nullif(x->>'variant',''),'Default'),trim(x->>'sku'),nullif(trim(x->>'barcode'),''),(x->>'price')::bigint,(x->>'cost')::numeric,NOT coalesce((x->>'archived')::boolean,false),coalesce(x->>'unit','unit'),coalesce((x->>'precision')::int,0))
   ON CONFLICT ON CONSTRAINT nusa_variants_pkey DO UPDATE SET name=excluded.name,sku=excluded.sku,barcode=excluded.barcode,price=excluded.price,initial_cost=excluded.initial_cost,active=excluded.active,version=nusa_variants.version+1 WHERE nusa_variants.tenant_id=t;
   PERFORM public.nusa_assert(FOUND,'FORBIDDEN');
   IF o IS NOT NULL THEN
    INSERT INTO public.nusa_balances(tenant_id,outlet_id,variant_id) VALUES(t,o,id) ON CONFLICT DO NOTHING;
    INSERT INTO public.nusa_reorder_rules(tenant_id,outlet_id,variant_id,minimum,safety,lead_days,review_days)
    VALUES(t,o,id,coalesce((x->>'minimum')::numeric,0),coalesce((x->>'safety')::numeric,0),coalesce((x->>'lead')::int,3),coalesce((x->>'review')::int,7))
    ON CONFLICT(outlet_id,variant_id) DO UPDATE SET minimum=excluded.minimum,safety=excluded.safety,lead_days=excluded.lead_days,review_days=excluded.review_days;
   END IF;
  END LOOP;result:=jsonb_build_object('id',id);
 WHEN 'save-customer' THEN
  PERFORM public.nusa_assert(role_name IN ('owner','manager','cashier'),'FORBIDDEN');id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  INSERT INTO public.nusa_customers(id,tenant_id,name,phone,email,note) VALUES(id,t,trim(p->>'name'),coalesce(p->>'phone',''),coalesce(p->>'email',''),coalesce(p->>'note',''))
  ON CONFLICT ON CONSTRAINT nusa_customers_pkey DO UPDATE SET name=excluded.name,phone=excluded.phone,email=excluded.email,note=excluded.note WHERE nusa_customers.tenant_id=t;
  PERFORM public.nusa_assert(FOUND,'FORBIDDEN');result:=jsonb_build_object('id',id);
 WHEN 'save-supplier' THEN
  PERFORM public.nusa_assert(role_name IN ('owner','manager','inventory'),'FORBIDDEN');id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  INSERT INTO public.nusa_suppliers(id,tenant_id,name,phone,address) VALUES(id,t,trim(p->>'name'),coalesce(p->>'phone',''),coalesce(p->>'address',''))
  ON CONFLICT ON CONSTRAINT nusa_suppliers_pkey DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address WHERE nusa_suppliers.tenant_id=t;
  PERFORM public.nusa_assert(FOUND,'FORBIDDEN');result:=jsonb_build_object('id',id);
 WHEN 'open-shift' THEN
  PERFORM public.nusa_assert(role_name IN ('owner','manager','cashier'),'FORBIDDEN');
  PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM public.nusa_registers WHERE tenant_id=t AND outlet_id=o AND nusa_registers.id=(p->>'registerId')::uuid AND active),'REGISTER_INACTIVE');
  INSERT INTO public.nusa_shifts(tenant_id,outlet_id,register_id,opened_by,opening_cash) VALUES(t,o,(p->>'registerId')::uuid,actor,(p->>'amount')::bigint) RETURNING nusa_shifts.id INTO id;
  result:=jsonb_build_object('id',id);
 WHEN 'close-shift','cash-movement','expense' THEN
  PERFORM public.nusa_assert(role_name IN ('owner','manager','cashier'),'FORBIDDEN');
  IF op<>'expense' OR p->>'method'='Tunai' THEN
   SELECT * INTO sh FROM public.nusa_shifts WHERE tenant_id=t AND outlet_id=o AND nusa_shifts.id=(p->>'shiftId')::uuid AND closed_at IS NULL FOR UPDATE;
   PERFORM public.nusa_assert(sh.id IS NOT NULL AND (sh.opened_by=actor OR role_name IN ('owner','manager')),'SHIFT_CLOSED');
  END IF;
  amount:=(p->>'amount')::bigint;
  IF op='close-shift' THEN
   total:=public.nusa_cash_expected(sh.id);PERFORM public.nusa_assert(amount=total OR length(trim(p->>'reason'))>0,'DISCREPANCY_REASON_REQUIRED');
   UPDATE public.nusa_shifts SET closed_at=now(),closed_by=actor,counted_cash=amount,expected_cash=total,difference=amount-total,reason=coalesce(p->>'reason','') WHERE nusa_shifts.id=sh.id;
  ELSIF op='cash-movement' THEN
   PERFORM public.nusa_assert(amount<>0 AND length(trim(p->>'reason'))>0 AND public.nusa_cash_expected(sh.id)+amount>=0,'INVALID_CASH_MOVEMENT');
   INSERT INTO public.nusa_cash_movements(tenant_id,shift_id,amount,kind,reason,actor_id) VALUES(t,sh.id,amount,'manual',p->>'reason',actor);
  ELSE
   PERFORM public.nusa_assert(role_name IN ('owner','manager'),'FORBIDDEN');
   INSERT INTO public.nusa_expenses(tenant_id,outlet_id,shift_id,category,amount,method,note,created_by)
   VALUES(t,o,sh.id,p->>'category',amount,p->>'method',p->>'note',actor) RETURNING nusa_expenses.id INTO id;
   IF p->>'method'='Tunai' THEN
    PERFORM public.nusa_assert(public.nusa_cash_expected(sh.id)>=amount,'INSUFFICIENT_CASH');
    INSERT INTO public.nusa_cash_movements(tenant_id,shift_id,amount,kind,expense_id,reason,actor_id) VALUES(t,sh.id,-amount,'expense',id,p->>'note',actor);
   END IF;
  END IF;
 WHEN 'checkout' THEN
  PERFORM public.nusa_assert((SELECT status<>'pending' FROM public.nusa_subscriptions WHERE tenant_id=t),'ONBOARDING_REQUIRED');
  quote:=public.nusa_quote(t,o,p);
  PERFORM public.nusa_assert(p->>'quoteHash'=quote->>'hash' AND (p->>'quoteExpires')::timestamptz>now(),'QUOTE_CHANGED');
  PERFORM public.nusa_assert(p->>'method'='Tunai' OR p->>'manualConfirmed'='true','PAYMENT_CONFIRMATION_REQUIRED');
  amount:=(quote->>'total')::bigint; id:=gen_random_uuid();
  INSERT INTO public.nusa_sales(id,tenant_id,outlet_id,shift_id,customer_id,cashier_id,number,subtotal,discount,tax,total,quote_hash)
  VALUES(id,t,o,(p->>'shiftId')::uuid,nullif(p->>'customerId','')::uuid,actor,'TRX-'||to_char(now(),'YYMMDD')||'-'||upper(substr(id::text,1,8)),(quote->>'subtotal')::bigint,(quote->>'discount')::bigint,(quote->>'tax')::bigint,amount,quote->>'hash');
  INSERT INTO public.nusa_inventory_documents(tenant_id,outlet_id,sale_id,actor_id,reason) VALUES(t,o,id,actor,'Penjualan') RETURNING nusa_inventory_documents.id INTO doc;
  FOR x IN SELECT value FROM jsonb_array_elements(quote->'items') LOOP
   v:=(x->>'productId')::uuid;qty:=(x->>'quantity')::numeric;SELECT * INTO b FROM public.nusa_balances WHERE outlet_id=o AND variant_id=v FOR UPDATE;
   PERFORM public.nusa_assert(b.quantity>=qty,'STOCK_CONFLICT');
   INSERT INTO public.nusa_sale_items(tenant_id,sale_id,variant_id,name,sku,quantity,price,discount,net,tax,unit_cost,cogs)
   VALUES(t,id,v,x->>'name',x->>'sku',qty,(x->>'price')::bigint,(x->>'discount')::bigint,(x->>'net')::bigint,(x->>'tax')::bigint,b.unit_cost,round(qty*b.unit_cost,6));
   PERFORM public.nusa_move(t,o,v,-qty,b.unit_cost,doc);
  END LOOP;
  INSERT INTO public.nusa_payments(tenant_id,sale_id,method,amount,tendered,change,confirmed_by,external_reference)
  VALUES(t,id,p->>'method',amount,CASE WHEN p->>'method'='Tunai' THEN (p->>'cash')::bigint ELSE amount END,CASE WHEN p->>'method'='Tunai' THEN (p->>'cash')::bigint-amount ELSE 0 END,actor,coalesce(p->>'reference','')) RETURNING nusa_payments.id INTO parent;
  IF p->>'method'='Tunai' THEN INSERT INTO public.nusa_cash_movements(tenant_id,shift_id,amount,kind,payment_id,reason,actor_id) VALUES(t,(p->>'shiftId')::uuid,amount,'sale',parent,'Penjualan',actor); END IF;
  result:=jsonb_build_object('id',id,'total',amount);
 WHEN 'create-purchase' THEN
  PERFORM public.nusa_assert(role_name IN ('owner','manager','inventory') AND o IS NOT NULL,'FORBIDDEN');
  PERFORM public.nusa_assert(jsonb_typeof(p->'lines')='array' AND jsonb_array_length(p->'lines') BETWEEN 1 AND 100,'INVALID_ITEMS');
  INSERT INTO public.nusa_purchase_orders(tenant_id,outlet_id,supplier_id,created_by) VALUES(t,o,(p->>'supplierId')::uuid,actor) RETURNING nusa_purchase_orders.id INTO id;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
   v:=(x->>'productId')::uuid;qty:=(x->>'quantity')::numeric;PERFORM public.nusa_check_quantity(t,v,qty);
   INSERT INTO public.nusa_purchase_items(tenant_id,purchase_id,variant_id,quantity,cost) VALUES(t,id,v,qty,(x->>'cost')::numeric);
  END LOOP;result:=jsonb_build_object('id',id);
 WHEN 'approve-purchase','cancel-purchase','receive-purchase' THEN
  SELECT * INTO po FROM public.nusa_purchase_orders WHERE tenant_id=t AND nusa_purchase_orders.id=(p->>'id')::uuid FOR UPDATE;
  o:=po.outlet_id;PERFORM public.nusa_assert(po.id IS NOT NULL AND public.nusa_access(t,o) AND role_name IN ('owner','manager','inventory'),'FORBIDDEN');
  PERFORM public.nusa_assert(po.version=(p->>'version')::bigint,'PO_CHANGED');id:=po.id;
  IF op='approve-purchase' THEN
   PERFORM public.nusa_assert(role_name IN ('owner','manager') AND po.status='draft','APPROVAL_REQUIRED');
   UPDATE public.nusa_purchase_orders SET status='approved',approved_by=actor,version=version+1 WHERE nusa_purchase_orders.id=po.id;
  ELSIF op='cancel-purchase' THEN
   PERFORM public.nusa_assert(role_name IN ('owner','manager') AND po.status IN ('draft','approved','partial') AND length(trim(p->>'reason'))>0,'INVALID_CANCELLATION');
   UPDATE public.nusa_purchase_orders SET status='cancelled',reason=p->>'reason',version=version+1 WHERE nusa_purchase_orders.id=po.id;
  ELSE
   PERFORM public.nusa_assert(po.status IN ('approved','partial'),'PO_NOT_APPROVED');
   PERFORM public.nusa_assert(jsonb_typeof(p->'lines')='array' AND jsonb_array_length(p->'lines') BETWEEN 1 AND 100,'INVALID_ITEMS');
   INSERT INTO public.nusa_receipts(tenant_id,outlet_id,purchase_id,received_by) VALUES(t,o,po.id,actor) RETURNING nusa_receipts.id INTO id;
   INSERT INTO public.nusa_inventory_documents(tenant_id,outlet_id,receipt_id,actor_id,reason) VALUES(t,o,id,actor,'Penerimaan pembelian') RETURNING nusa_inventory_documents.id INTO doc;
   FOR x IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
    SELECT * INTO item FROM public.nusa_purchase_items WHERE purchase_id=po.id AND nusa_purchase_items.id=(x->>'itemId')::uuid;
    qty:=(x->>'quantity')::numeric;PERFORM public.nusa_assert(item.id IS NOT NULL,'INVALID_ITEM');PERFORM public.nusa_check_quantity(t,item.variant_id,qty);
    SELECT coalesce(sum(quantity),0) INTO already FROM public.nusa_receipt_items WHERE purchase_item_id=item.id;
    PERFORM public.nusa_assert(qty+already<=item.quantity,'OVER_RECEIPT');
    INSERT INTO public.nusa_receipt_items(tenant_id,receipt_id,purchase_id,purchase_item_id,quantity,cost) VALUES(t,id,po.id,item.id,qty,(x->>'cost')::numeric);
    PERFORM public.nusa_move(t,o,item.variant_id,qty,(x->>'cost')::numeric,doc);
   END LOOP;
   UPDATE public.nusa_purchase_orders SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM public.nusa_purchase_items pi WHERE pi.purchase_id=po.id AND pi.quantity>(SELECT coalesce(sum(ri.quantity),0) FROM public.nusa_receipt_items ri WHERE ri.purchase_item_id=pi.id)) THEN 'received' ELSE 'partial' END,version=version+1 WHERE nusa_purchase_orders.id=po.id;
  END IF;result:=jsonb_build_object('id',id);
 WHEN 'create-count' THEN
  PERFORM public.nusa_assert(role_name IN ('owner','manager','inventory') AND o IS NOT NULL,'FORBIDDEN');
  PERFORM public.nusa_assert(jsonb_typeof(p->'lines')='array' AND jsonb_array_length(p->'lines') BETWEEN 1 AND 100,'INVALID_ITEMS');
  INSERT INTO public.nusa_stock_counts(tenant_id,outlet_id,counted_by,reason) VALUES(t,o,actor,trim(p->>'reason')) RETURNING nusa_stock_counts.id INTO id;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
   v:=(x->>'productId')::uuid;PERFORM public.nusa_check_quantity(t,v,(x->>'physical')::numeric,true);
   INSERT INTO public.nusa_balances(tenant_id,outlet_id,variant_id) VALUES(t,o,v) ON CONFLICT DO NOTHING;
   SELECT * INTO b FROM public.nusa_balances WHERE outlet_id=o AND variant_id=v;
   PERFORM public.nusa_assert(b.version=(x->>'version')::bigint,'RECOUNT_REQUIRED');
   INSERT INTO public.nusa_count_items(tenant_id,count_id,variant_id,expected,physical,version,cost) VALUES(t,id,v,b.quantity,(x->>'physical')::numeric,b.version,coalesce((x->>'cost')::numeric,nullif(b.unit_cost,0),(SELECT initial_cost FROM public.nusa_variants WHERE nusa_variants.id=v)));
  END LOOP;result:=jsonb_build_object('id',id);
 WHEN 'approve-count' THEN
  SELECT * INTO cnt FROM public.nusa_stock_counts WHERE tenant_id=t AND nusa_stock_counts.id=(p->>'id')::uuid FOR UPDATE;o:=cnt.outlet_id;
  PERFORM public.nusa_assert(cnt.id IS NOT NULL AND public.nusa_access(t,o) AND role_name IN ('owner','manager'),'APPROVAL_REQUIRED');
  PERFORM public.nusa_assert(cnt.status='pending','ALREADY_POSTED');id:=cnt.id;
  INSERT INTO public.nusa_inventory_documents(tenant_id,outlet_id,count_id,actor_id,reason) VALUES(t,o,id,actor,cnt.reason) RETURNING nusa_inventory_documents.id INTO doc;
  FOR item IN SELECT * FROM public.nusa_count_items WHERE count_id=id ORDER BY variant_id LOOP
   SELECT * INTO b FROM public.nusa_balances WHERE outlet_id=o AND variant_id=item.variant_id FOR UPDATE;
   PERFORM public.nusa_assert(b.version=item.version,'RECOUNT_REQUIRED');
   IF item.physical>b.quantity THEN PERFORM public.nusa_assert(item.cost>0,'UNIT_COST_REQUIRED'); END IF;
   PERFORM public.nusa_move(t,o,item.variant_id,item.physical-b.quantity,item.cost,doc);
  END LOOP;
  UPDATE public.nusa_stock_counts SET status='posted',approved_by=actor,posted_at=now() WHERE nusa_stock_counts.id=id;result:=jsonb_build_object('id',id);
 WHEN 'request-refund' THEN
  SELECT * INTO sale FROM public.nusa_sales WHERE tenant_id=t AND nusa_sales.id=(p->>'saleId')::uuid;o:=sale.outlet_id;
  PERFORM public.nusa_assert(sale.id IS NOT NULL AND public.nusa_access(t,o) AND (role_name IN ('owner','manager') OR (role_name='cashier' AND sale.cashier_id=actor)),'FORBIDDEN');
  PERFORM public.nusa_assert(jsonb_typeof(p->'lines')='array' AND jsonb_array_length(p->'lines') BETWEEN 1 AND 100,'INVALID_ITEMS');
  INSERT INTO public.nusa_refunds(tenant_id,outlet_id,sale_id,requested_by,reason,status) VALUES(t,o,sale.id,actor,trim(p->>'reason'),'pending') RETURNING nusa_refunds.id INTO id;
  FOR x IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
   SELECT * INTO item FROM public.nusa_sale_items WHERE sale_id=sale.id AND nusa_sale_items.id=(x->>'itemId')::uuid;
   PERFORM public.nusa_assert(item.id IS NOT NULL,'INVALID_ITEM');qty:=(x->>'quantity')::numeric;
   PERFORM public.nusa_check_quantity(t,item.variant_id,qty);
   SELECT coalesce(sum(ri.quantity),0) INTO already FROM public.nusa_refund_items ri JOIN public.nusa_refunds r ON r.id=ri.refund_id WHERE ri.sale_item_id=item.id AND r.status='posted';
   PERFORM public.nusa_assert(qty+already<=item.quantity,'OVER_REFUND');
   INSERT INTO public.nusa_refund_items(tenant_id,refund_id,sale_id,sale_item_id,quantity,restock) VALUES(t,id,sale.id,item.id,qty,(x->>'restock')::numeric);
  END LOOP;result:=jsonb_build_object('id',id);
 WHEN 'approve-refund' THEN
  SELECT * INTO ref FROM public.nusa_refunds WHERE tenant_id=t AND nusa_refunds.id=(p->>'id')::uuid FOR UPDATE;o:=ref.outlet_id;
  PERFORM public.nusa_assert(ref.id IS NOT NULL AND public.nusa_access(t,o) AND role_name IN ('owner','manager'),'APPROVAL_REQUIRED');
  PERFORM public.nusa_assert(ref.status='pending','ALREADY_POSTED');
  SELECT * INTO sh FROM public.nusa_shifts WHERE tenant_id=t AND outlet_id=o AND nusa_shifts.id=(p->>'shiftId')::uuid AND closed_at IS NULL FOR UPDATE;
  SELECT * INTO rec FROM public.nusa_payments WHERE sale_id=ref.sale_id;
  PERFORM public.nusa_assert(sh.id IS NOT NULL,'SHIFT_CLOSED');
  PERFORM public.nusa_assert(rec.method='Tunai' OR p->>'manualConfirmed'='true','PAYMENT_CONFIRMATION_REQUIRED');
  id:=ref.id;INSERT INTO public.nusa_inventory_documents(tenant_id,outlet_id,refund_id,actor_id,reason) VALUES(t,o,id,actor,ref.reason) RETURNING nusa_inventory_documents.id INTO doc;
  FOR item IN SELECT ri.*,si.quantity sold,si.net original_net,si.tax original_tax,si.unit_cost,si.variant_id FROM public.nusa_refund_items ri JOIN public.nusa_sale_items si ON si.id=ri.sale_item_id WHERE ri.refund_id=id ORDER BY si.variant_id LOOP
   SELECT coalesce(sum(ri.quantity),0),coalesce(sum(ri.net),0),coalesce(sum(ri.tax),0) INTO already,already_net,already_tax FROM public.nusa_refund_items ri JOIN public.nusa_refunds r ON r.id=ri.refund_id WHERE ri.sale_item_id=item.sale_item_id AND r.status='posted';
   PERFORM public.nusa_assert(already+item.quantity<=item.sold,'OVER_REFUND');
   qnet:=round(item.original_net*(already+item.quantity)/item.sold)-already_net;qtax:=round(item.original_tax*(already+item.quantity)/item.sold)-already_tax;
   UPDATE public.nusa_refund_items SET net=qnet,tax=qtax,cogs_reversal=round(item.restock*item.unit_cost,6) WHERE nusa_refund_items.id=item.id;
   nettotal:=nettotal+qnet;taxtotal:=taxtotal+qtax;
   IF item.restock>0 THEN PERFORM public.nusa_move(t,o,item.variant_id,item.restock,item.unit_cost,doc); END IF;
  END LOOP;total:=nettotal+taxtotal;
  IF rec.method='Tunai' THEN
   PERFORM public.nusa_assert(public.nusa_cash_expected(sh.id)>=total,'INSUFFICIENT_CASH');
   INSERT INTO public.nusa_cash_movements(tenant_id,shift_id,amount,kind,refund_id,reason,actor_id) VALUES(t,sh.id,-total,'refund',id,ref.reason,actor);
  END IF;
  UPDATE public.nusa_refunds SET status='posted',approved_by=actor,shift_id=sh.id,net=nettotal,tax=taxtotal,total=nettotal+taxtotal,posted_at=now() WHERE nusa_refunds.id=id;result:=jsonb_build_object('id',id,'total',total);
 WHEN 'request-invoice' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');SELECT * INTO plan FROM public.nusa_plan_versions WHERE nusa_plan_versions.id=p->>'planId';
  PERFORM public.nusa_assert(plan.id IS NOT NULL,'PLAN_NOT_FOUND');
  INSERT INTO public.nusa_invoices(tenant_id,plan_id,amount) VALUES(t,plan.id,plan.monthly_price) RETURNING nusa_invoices.id INTO id;result:=jsonb_build_object('id',id);
 WHEN 'attach-proof' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');
  PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM public.nusa_files WHERE tenant_id=t AND nusa_files.id=(p->>'fileId')::uuid AND purpose='invoice'),'FILE_NOT_FOUND');
  UPDATE public.nusa_invoices SET proof_file_id=(p->>'fileId')::uuid,status='pending',reason='' WHERE tenant_id=t AND nusa_invoices.id=(p->>'id')::uuid AND status IN ('awaiting_proof','rejected');
  PERFORM public.nusa_assert(FOUND,'INVOICE_CHANGED');
 WHEN 'verify-invoice' THEN
  SELECT * INTO inv FROM public.nusa_invoices WHERE tenant_id=t AND nusa_invoices.id=(p->>'id')::uuid FOR UPDATE;
  PERFORM public.nusa_assert(inv.id IS NOT NULL AND inv.status='pending' AND length(trim(p->>'reason'))>0,'INVOICE_CHANGED');
  PERFORM public.nusa_assert(NOT public.nusa_access(t),'OPERATOR_TENANT_SEPARATION');
  IF p->>'decision'='approve' THEN
   SELECT * INTO plan FROM public.nusa_plan_versions WHERE nusa_plan_versions.id=inv.plan_id;
   PERFORM public.nusa_assert((SELECT count(*) FROM public.nusa_outlets WHERE tenant_id=t AND active)<=plan.outlet_limit AND (SELECT count(*) FROM public.nusa_memberships WHERE tenant_id=t AND active)<=plan.member_limit,'PLAN_CAPACITY_EXCEEDED');
   SELECT * INTO sub FROM public.nusa_subscriptions WHERE tenant_id=t FOR UPDATE;
   IF sub.status='active' AND sub.period_end>now() AND (SELECT monthly_price FROM public.nusa_plan_versions WHERE nusa_plan_versions.id=sub.plan_id)>plan.monthly_price THEN
    PERFORM public.nusa_assert(sub.pending_invoice_id IS NULL,'DOWNGRADE_ALREADY_SCHEDULED');
    UPDATE public.nusa_subscriptions SET pending_plan_id=plan.id,pending_invoice_id=inv.id WHERE tenant_id=t;
    UPDATE public.nusa_invoices SET status='scheduled',verified_at=now(),verified_by=actor,reason=p->>'reason',period_start=sub.period_end,period_end=sub.period_end+interval '1 month' WHERE nusa_invoices.id=inv.id;
   ELSE
    UPDATE public.nusa_subscriptions SET status='active',plan_id=plan.id,period_start=now(),period_end=now()+interval '1 month',grace_end=now()+interval '1 month 3 days',version=version+1 WHERE tenant_id=t;
    UPDATE public.nusa_invoices SET status='approved',verified_at=now(),verified_by=actor,reason=p->>'reason',period_start=now(),period_end=now()+interval '1 month' WHERE nusa_invoices.id=inv.id;
   END IF;
  ELSE PERFORM public.nusa_assert(p->>'decision'='reject','INVALID_DECISION');UPDATE public.nusa_invoices SET status='rejected',verified_at=now(),verified_by=actor,reason=p->>'reason' WHERE nusa_invoices.id=inv.id; END IF;
 WHEN 'tenant-status' THEN
  PERFORM public.nusa_assert(length(trim(p->>'reason'))>0,'REASON_REQUIRED');UPDATE public.nusa_tenants SET status=p->>'status',version=version+1 WHERE nusa_tenants.id=t;
 WHEN 'invite-member' THEN
  PERFORM public.nusa_assert(role_name='owner' AND length(p->>'token')>=40 AND jsonb_array_length(p->'outletIds')>0,'OWNER_REQUIRED');
  SELECT pv.* INTO plan FROM public.nusa_plan_versions pv JOIN public.nusa_subscriptions s ON s.plan_id=pv.id WHERE s.tenant_id=t;
  PERFORM public.nusa_assert((SELECT count(*) FROM public.nusa_memberships WHERE tenant_id=t AND active)+(SELECT count(*) FROM public.nusa_invitations WHERE tenant_id=t AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now())<plan.member_limit,'PLAN_MEMBER_LIMIT');
  PERFORM public.nusa_assert(NOT EXISTS(SELECT 1 FROM public.nusa_invitations WHERE tenant_id=t AND email=lower(trim(p->>'email')) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()),'INVITATION_EXISTS');
  INSERT INTO public.nusa_invitations(tenant_id,email,name,role,token_hash,invited_by) VALUES(t,lower(trim(p->>'email')),p->>'name',p->>'role',encode(sha256(convert_to(p->>'token','UTF8')),'hex'),actor) RETURNING nusa_invitations.id INTO id;
  INSERT INTO public.nusa_invitation_outlets SELECT t,id,value::uuid FROM jsonb_array_elements_text(p->'outletIds');result:=jsonb_build_object('id',id);
 WHEN 'manage-member' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');SELECT * INTO mem FROM public.nusa_memberships WHERE tenant_id=t AND nusa_memberships.id=(p->>'id')::uuid FOR UPDATE;
  PERFORM public.nusa_assert(mem.id IS NOT NULL AND mem.role<>'owner','LAST_OWNER');PERFORM public.nusa_assert(mem.version=(p->>'version')::bigint,'MEMBER_CHANGED');
  SELECT pv.* INTO plan FROM public.nusa_plan_versions pv JOIN public.nusa_subscriptions s ON s.plan_id=pv.id WHERE s.tenant_id=t;
  IF p->>'active'='true' AND NOT mem.active THEN PERFORM public.nusa_assert((SELECT count(*) FROM public.nusa_memberships WHERE tenant_id=t AND active)<plan.member_limit,'PLAN_MEMBER_LIMIT'); END IF;
  PERFORM public.nusa_assert(p->>'role' IN ('manager','cashier','inventory'),'INVALID_ROLE');
  UPDATE public.nusa_memberships SET role=p->>'role',active=(p->>'active')::boolean,version=version+1 WHERE nusa_memberships.id=mem.id;
  DELETE FROM public.nusa_member_outlets WHERE membership_id=mem.id;
  INSERT INTO public.nusa_member_outlets SELECT t,mem.id,value::uuid FROM jsonb_array_elements_text(p->'outletIds');
 WHEN 'revoke-invitation' THEN
  PERFORM public.nusa_assert(role_name='owner','OWNER_REQUIRED');UPDATE public.nusa_invitations SET revoked_at=now() WHERE tenant_id=t AND nusa_invitations.id=(p->>'id')::uuid AND accepted_at IS NULL;
 ELSE RAISE EXCEPTION 'UNKNOWN_OPERATION';
 END CASE;
 UPDATE public.nusa_tenants SET version=version+1 WHERE nusa_tenants.id=t;
 INSERT INTO public.nusa_audit(tenant_id,actor_id,outlet_id,action,entity_id,reason,request_id) VALUES(t,actor,o,op,id,coalesce(p->>'reason',''),k);
 INSERT INTO public.nusa_idempotency VALUES(t,op,k,actor,reqhash,result,now());
 RETURN result;
END $$;

-- Internal helpers are not callable by browser/runtime roles.
REVOKE ALL ON FUNCTION public.nusa_assert(boolean,text),public.nusa_writable(uuid),public.nusa_check_quantity(uuid,uuid,numeric,boolean),public.nusa_move(uuid,uuid,uuid,numeric,numeric,uuid),public.nusa_cash_expected(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nusa_quote(uuid,uuid,jsonb),public.nusa_onboard(jsonb,uuid),public.nusa_command(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_quote(uuid,uuid,jsonb),public.nusa_onboard(jsonb,uuid),public.nusa_command(uuid,text,jsonb,uuid) TO authenticated;
