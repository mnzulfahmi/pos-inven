CREATE TABLE public.nusa_quotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.nusa_tenants,actor_id uuid NOT NULL REFERENCES auth.users,hash text NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE public.nusa_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nusa_quotes FROM anon,authenticated;
ALTER FUNCTION public.nusa_quote(uuid,uuid,jsonb) RENAME TO nusa_calculate_quote;
REVOKE ALL ON FUNCTION public.nusa_calculate_quote(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.nusa_quote(t uuid,o uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE q jsonb; i uuid; BEGIN
 q:=public.nusa_calculate_quote(t,o,p);
 INSERT INTO public.nusa_quotes(tenant_id,actor_id,hash,expires_at) VALUES(t,auth.uid(),q->>'hash',(q->>'expiresAt')::timestamptz) RETURNING id INTO i;
 RETURN q||jsonb_build_object('quoteId',i);
END $$;
-- Guard the existing transactional entry point with an issued, unexpired quotation.
ALTER FUNCTION public.nusa_command(uuid,text,jsonb,uuid) RENAME TO nusa_execute_command;
REVOKE ALL ON FUNCTION public.nusa_execute_command(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.nusa_command(t uuid,op text,p jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o uuid; BEGIN
 PERFORM public.nusa_assert(public.nusa_verified(),'EMAIL_VERIFICATION_REQUIRED');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 IF op IN ('approve-purchase','cancel-purchase','receive-purchase') THEN SELECT outlet_id INTO o FROM public.nusa_purchase_orders WHERE tenant_id=t AND id=(p->>'id')::uuid;
 ELSIF op='approve-count' THEN SELECT outlet_id INTO o FROM public.nusa_stock_counts WHERE tenant_id=t AND id=(p->>'id')::uuid;
 ELSIF op='request-refund' THEN SELECT outlet_id INTO o FROM public.nusa_sales WHERE tenant_id=t AND id=(p->>'saleId')::uuid;
 ELSIF op='approve-refund' THEN SELECT outlet_id INTO o FROM public.nusa_refunds WHERE tenant_id=t AND id=(p->>'id')::uuid;
 ELSE o:=nullif(p->>'outletId','')::uuid; END IF;
 IF op NOT IN ('verify-invoice','tenant-status') THEN PERFORM public.nusa_assert(public.nusa_access(t,o),'FORBIDDEN'); END IF;
 IF op='checkout' AND NOT EXISTS(SELECT 1 FROM public.nusa_idempotency WHERE tenant_id=t AND operation=op AND key=k) THEN
  PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM public.nusa_quotes WHERE id=(p->>'quoteId')::uuid AND tenant_id=t AND actor_id=auth.uid() AND hash=p->>'quoteHash' AND expires_at>now()),'QUOTE_EXPIRED');
 END IF;
 IF op='invite-member' THEN PERFORM public.nusa_assert(p->>'email' ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$','INVALID_EMAIL'); END IF;
 RETURN public.nusa_execute_command(t,op,p,k);
END $$;

CREATE FUNCTION public.nusa_session() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('verified',public.nusa_verified(),'operator',public.nusa_operator(),'userId',auth.uid(),'tenants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'role',m.role,'onboarded',t.onboarded)) FROM public.nusa_memberships m JOIN public.nusa_tenants t ON t.id=m.tenant_id WHERE m.user_id=auth.uid() AND m.active AND public.nusa_verified()),'[]'))
$$;

CREATE FUNCTION public.nusa_snapshot(t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; r text:=public.nusa_role(t); BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t),'FORBIDDEN');
 SELECT jsonb_build_object('tenant',to_jsonb(a),'role',r,'userId',auth.uid(),'asOf',now()) INTO result FROM public.nusa_tenants a WHERE id=t;
 result:=result||jsonb_build_object(
 'outlets',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_outlets a WHERE tenant_id=t AND public.nusa_access(t,id)),
 'registers',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_registers a WHERE tenant_id=t AND public.nusa_access(t,outlet_id)),
 'subscription',(SELECT to_jsonb(s)||jsonb_build_object('plan',to_jsonb(p)) FROM public.nusa_subscriptions s JOIN public.nusa_plan_versions p ON p.id=s.plan_id WHERE tenant_id=t),
 'products',(SELECT coalesce(jsonb_agg((to_jsonb(v)-CASE WHEN r='cashier' THEN 'initial_cost' ELSE '' END)||jsonb_build_object('product_name',p.name,'category',c.name)),'[]') FROM public.nusa_variants v JOIN public.nusa_products p ON p.id=v.product_id LEFT JOIN public.nusa_categories c ON c.id=p.category_id WHERE v.tenant_id=t),
 'balances',(SELECT coalesce(jsonb_agg((to_jsonb(a)-CASE WHEN r='cashier' THEN ARRAY['unit_cost','value'] ELSE ARRAY[]::text[] END)||jsonb_build_object('minimum',coalesce(rr.minimum,0),'safety',coalesce(rr.safety,0),'lead',coalesce(rr.lead_days,3),'review',coalesce(rr.review_days,7))),'[]') FROM public.nusa_balances a LEFT JOIN public.nusa_reorder_rules rr USING(outlet_id,variant_id) WHERE a.tenant_id=t AND public.nusa_access(t,a.outlet_id)),
 'sales',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('payment',(SELECT to_jsonb(p) FROM public.nusa_payments p WHERE sale_id=a.id),'lines',(SELECT jsonb_agg((to_jsonb(i)-CASE WHEN r='cashier' THEN ARRAY['unit_cost','cogs'] ELSE ARRAY[]::text[] END)||jsonb_build_object('refunded',(SELECT coalesce(sum(ri.quantity),0) FROM public.nusa_refund_items ri JOIN public.nusa_refunds rf ON rf.id=ri.refund_id WHERE ri.sale_item_id=i.id AND rf.status='posted'))) FROM public.nusa_sale_items i WHERE sale_id=a.id)) ORDER BY posted_at DESC),'[]') FROM public.nusa_sales a WHERE tenant_id=t AND r<>'inventory' AND public.nusa_access(t,outlet_id) AND (r<>'cashier' OR cashier_id=auth.uid())),
 'shifts',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('expected',public.nusa_cash_expected(id)) ORDER BY opened_at DESC),'[]') FROM public.nusa_shifts a WHERE tenant_id=t AND r<>'inventory' AND public.nusa_access(t,outlet_id) AND (r<>'cashier' OR opened_by=auth.uid())),
 'customers',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_customers a WHERE tenant_id=t AND r<>'inventory'),
 'suppliers',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_suppliers a WHERE tenant_id=t AND r<>'cashier'),
 'purchases',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('received',(SELECT coalesce(sum(quantity),0) FROM public.nusa_receipt_items ri WHERE purchase_item_id=i.id))) FROM public.nusa_purchase_items i WHERE purchase_id=a.id)) ORDER BY created_at DESC),'[]') FROM public.nusa_purchase_orders a WHERE tenant_id=t AND r<>'cashier' AND public.nusa_access(t,outlet_id)),
 'counts',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(i)) FROM public.nusa_count_items i WHERE count_id=a.id))),'[]') FROM public.nusa_stock_counts a WHERE tenant_id=t AND r<>'cashier' AND public.nusa_access(t,outlet_id)),
 'refunds',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('cost',(SELECT sum(cogs_reversal) FROM public.nusa_refund_items WHERE refund_id=a.id))),'[]') FROM public.nusa_refunds a WHERE tenant_id=t AND r IN ('owner','manager') AND public.nusa_access(t,outlet_id)),
 'expenses',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_expenses a WHERE tenant_id=t AND r IN ('owner','manager') AND public.nusa_access(t,outlet_id)),
 'ledger',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('reason',d.reason) ORDER BY a.created_at DESC),'[]') FROM public.nusa_stock_movements a JOIN public.nusa_inventory_documents d ON d.id=a.document_id WHERE a.tenant_id=t AND r<>'cashier' AND public.nusa_access(t,a.outlet_id)),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('outlet_ids',(SELECT jsonb_agg(outlet_id) FROM public.nusa_member_outlets WHERE membership_id=a.id))),'[]') FROM public.nusa_memberships a WHERE tenant_id=t AND r='owner'),
 'invitations',(SELECT coalesce(jsonb_agg(to_jsonb(a)-'token_hash'),'[]') FROM public.nusa_invitations a WHERE tenant_id=t AND r='owner'),
 'invoices',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY created_at DESC),'[]') FROM public.nusa_invoices a WHERE tenant_id=t AND r='owner'),
 'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY created_at DESC),'[]') FROM (SELECT * FROM public.nusa_audit WHERE tenant_id=t AND r='owner' ORDER BY created_at DESC LIMIT 200) a)
 );
 RETURN result;
END $$;

CREATE FUNCTION public.nusa_accept_invite(token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i public.nusa_invitations; m uuid; BEGIN
 PERFORM public.nusa_assert(public.nusa_verified(),'EMAIL_VERIFICATION_REQUIRED');
 SELECT * INTO i FROM public.nusa_invitations WHERE token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(i.tenant_id::text,0));
 SELECT * INTO i FROM public.nusa_invitations WHERE id=i.id FOR UPDATE;
 PERFORM public.nusa_assert(i.id IS NOT NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND i.email=(SELECT lower(email) FROM auth.users WHERE id=auth.uid()),'INVITATION_INVALID');
 IF i.accepted_at IS NOT NULL THEN PERFORM public.nusa_assert(public.nusa_access(i.tenant_id),'INVITATION_USED'); RETURN jsonb_build_object('tenantId',i.tenant_id); END IF;
 PERFORM public.nusa_assert((SELECT count(*) FROM public.nusa_memberships WHERE tenant_id=i.tenant_id AND active)<(SELECT p.member_limit FROM public.nusa_subscriptions s JOIN public.nusa_plan_versions p ON p.id=s.plan_id WHERE s.tenant_id=i.tenant_id),'PLAN_MEMBER_LIMIT');
 INSERT INTO public.nusa_memberships(tenant_id,user_id,name,email,role) VALUES(i.tenant_id,auth.uid(),i.name,i.email,i.role) RETURNING id INTO m;
 INSERT INTO public.nusa_member_outlets SELECT tenant_id,m,outlet_id FROM public.nusa_invitation_outlets WHERE invitation_id=i.id;
 UPDATE public.nusa_invitations SET accepted_at=now() WHERE id=i.id;
 INSERT INTO public.nusa_audit(tenant_id,actor_id,action,entity_id) VALUES(i.tenant_id,auth.uid(),'invite_accepted',m);
 RETURN jsonb_build_object('tenantId',i.tenant_id);
END $$;

CREATE FUNCTION public.nusa_operator_snapshot() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN PERFORM public.nusa_assert(public.nusa_operator(),'OPERATOR_REQUIRED');
 RETURN jsonb_build_object('tenants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)),'[]') FROM public.nusa_tenants),'invoices',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM public.nusa_invoices i WHERE status IN ('pending','scheduled')));
END $$;

CREATE FUNCTION public.nusa_file_register(t uuid,p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i uuid; BEGIN
 PERFORM public.nusa_assert(public.nusa_role(t)='owner' AND split_part(p->>'key','/',1)=t::text,'FORBIDDEN');
 PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM storage.objects WHERE bucket='nusa-private' AND key=p->>'key' AND uploaded_by=auth.uid()::text),'FILE_NOT_FOUND');
 INSERT INTO public.nusa_files(tenant_id,bucket,object_key,url,mime,size,purpose,uploaded_by) VALUES(t,'nusa-private',p->>'key',p->>'url',p->>'mime',(p->>'size')::bigint,p->>'purpose',auth.uid()) RETURNING id INTO i;RETURN i;
END $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY nusa_private_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket='nusa-private' AND uploaded_by=auth.uid()::text AND EXISTS(SELECT 1 FROM public.nusa_tenants WHERE id::text=split_part(key,'/',1) AND public.nusa_role(id)='owner'));
CREATE POLICY nusa_private_read ON storage.objects FOR SELECT TO authenticated USING(bucket='nusa-private' AND (EXISTS(SELECT 1 FROM public.nusa_tenants WHERE id::text=split_part(key,'/',1) AND public.nusa_role(id)='owner') OR public.nusa_operator()));
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT ON storage.objects TO authenticated;

CREATE TABLE public.nusa_ai_requests(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.nusa_tenants,user_id uuid NOT NULL REFERENCES auth.users,conversation_id uuid NOT NULL,outlet_id uuid,period int NOT NULL CHECK(period IN (1,7,30)),question text NOT NULL CHECK(length(question) BETWEEN 1 AND 2000),answer text,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX nusa_ai_quota ON public.nusa_ai_requests(tenant_id,created_at);
ALTER TABLE public.nusa_ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nusa_ai_requests FROM anon,authenticated;
CREATE FUNCTION public.nusa_ai(t uuid,op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE req public.nusa_ai_requests; used int; lim int; start_at timestamptz; BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t,nullif(p->>'outletId','')::uuid) AND public.nusa_role(t) IN ('owner','manager','inventory'),'FORBIDDEN');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 IF op='history' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at) FROM public.nusa_ai_requests a WHERE tenant_id=t AND user_id=auth.uid() AND created_at>now()-interval '90 days' AND (outlet_id IS NULL OR public.nusa_access(t,outlet_id))),'[]'); END IF;
 IF op='reserve' THEN
  PERFORM public.nusa_writable(t);
  SELECT CASE WHEN s.status='trial' THEN 100 ELSE pv.ai_limit END,coalesce(s.period_start,date_trunc('month',now())) INTO lim,start_at FROM public.nusa_subscriptions s JOIN public.nusa_plan_versions pv ON pv.id=s.plan_id WHERE s.tenant_id=t;
  SELECT * INTO req FROM public.nusa_ai_requests WHERE id=(p->>'id')::uuid;
  IF FOUND THEN PERFORM public.nusa_assert(req.tenant_id=t AND req.user_id=auth.uid() AND req.question=p->>'question','IDEMPOTENCY_CONFLICT');RETURN to_jsonb(req);END IF;
  SELECT count(*) INTO used FROM public.nusa_ai_requests WHERE tenant_id=t AND created_at>=start_at AND status<>'failed';
  PERFORM public.nusa_assert(used<lim,'AI_QUOTA_EXCEEDED');
  INSERT INTO public.nusa_ai_requests(id,tenant_id,user_id,conversation_id,outlet_id,period,question) VALUES((p->>'id')::uuid,t,auth.uid(),(p->>'conversationId')::uuid,nullif(p->>'outletId','')::uuid,(p->>'period')::int,p->>'question') RETURNING * INTO req;
 ELSE
  PERFORM public.nusa_assert(op IN ('complete','fail'),'INVALID_OPERATION');
  UPDATE public.nusa_ai_requests SET status=CASE WHEN op='complete' THEN 'completed' ELSE 'failed' END,answer=left(p->>'answer',16000) WHERE id=(p->>'id')::uuid AND tenant_id=t AND user_id=auth.uid() AND status='pending' RETURNING * INTO req;
 END IF;RETURN to_jsonb(req);
END $$;

REVOKE ALL ON FUNCTION public.nusa_quote(uuid,uuid,jsonb),public.nusa_command(uuid,text,jsonb,uuid),public.nusa_session(),public.nusa_snapshot(uuid),public.nusa_accept_invite(text),public.nusa_operator_snapshot(),public.nusa_file_register(uuid,jsonb),public.nusa_ai(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_quote(uuid,uuid,jsonb),public.nusa_command(uuid,text,jsonb,uuid),public.nusa_session(),public.nusa_snapshot(uuid),public.nusa_accept_invite(text),public.nusa_operator_snapshot(),public.nusa_file_register(uuid,jsonb),public.nusa_ai(uuid,text,jsonb) TO authenticated;
