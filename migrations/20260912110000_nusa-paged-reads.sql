-- Bounded, explicitly projected reads. SQL fragments below are fixed server literals.
CREATE FUNCTION public.nusa_list_page(t uuid, kind text, page integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE projection text; source text; predicate text; ordering text; rows jsonb; r text:=public.nusa_role(t);
BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t),'FORBIDDEN');
 PERFORM public.nusa_assert(page BETWEEN 0 AND 10000,'INVALID_PAGE');
 predicate:='a.tenant_id=$1'; ordering:='a.id DESC'; projection:='to_jsonb(a)';
 CASE kind
 WHEN 'products' THEN
  source:='public.nusa_variants a JOIN public.nusa_products p ON p.id=a.product_id LEFT JOIN public.nusa_categories c ON c.id=p.category_id';
  projection:='(to_jsonb(a)-CASE WHEN $3=''cashier'' THEN ''initial_cost'' ELSE '''' END)||jsonb_build_object(''product_name'',p.name,''category'',c.name)';
 WHEN 'balances' THEN
  source:='public.nusa_balances a LEFT JOIN public.nusa_reorder_rules rr USING(outlet_id,variant_id)';
  predicate:=predicate||' AND public.nusa_access($1,a.outlet_id)'; ordering:='a.outlet_id,a.variant_id';
  projection:='(to_jsonb(a)-CASE WHEN $3=''cashier'' THEN ARRAY[''unit_cost'',''value''] ELSE ARRAY[]::text[] END)||jsonb_build_object(''minimum'',coalesce(rr.minimum,0),''safety'',coalesce(rr.safety,0),''lead'',coalesce(rr.lead_days,3),''review'',coalesce(rr.review_days,7))';
 WHEN 'sales' THEN
  source:='public.nusa_sales a'; ordering:='a.posted_at DESC,a.id DESC';
  predicate:=predicate||' AND $3<>''inventory'' AND public.nusa_access($1,a.outlet_id) AND ($3<>''cashier'' OR a.cashier_id=$4)';
  projection:='to_jsonb(a)||jsonb_build_object(''payment'',(SELECT to_jsonb(p) FROM public.nusa_payments p WHERE sale_id=a.id),''lines'',(SELECT jsonb_agg((to_jsonb(i)-CASE WHEN $3=''cashier'' THEN ARRAY[''unit_cost'',''cogs''] ELSE ARRAY[]::text[] END)||jsonb_build_object(''refunded'',(SELECT coalesce(sum(ri.quantity),0) FROM public.nusa_refund_items ri JOIN public.nusa_refunds rf ON rf.id=ri.refund_id WHERE ri.sale_item_id=i.id AND rf.status=''posted''))) FROM public.nusa_sale_items i WHERE sale_id=a.id))';
 WHEN 'shifts' THEN
  source:='public.nusa_shifts a'; ordering:='(a.closed_at IS NULL) DESC,a.opened_at DESC,a.id DESC';
  predicate:=predicate||' AND $3<>''inventory'' AND public.nusa_access($1,a.outlet_id) AND ($3<>''cashier'' OR a.opened_by=$4)';
  projection:='to_jsonb(a)||jsonb_build_object(''expected'',public.nusa_cash_expected(a.id))';
 WHEN 'customers' THEN source:='public.nusa_customers a'; predicate:=predicate||' AND $3<>''inventory''';
 WHEN 'suppliers' THEN source:='public.nusa_suppliers a'; predicate:=predicate||' AND $3<>''cashier''';
 WHEN 'purchases' THEN
  source:='public.nusa_purchase_orders a'; ordering:='a.created_at DESC,a.id DESC';
  predicate:=predicate||' AND $3<>''cashier'' AND public.nusa_access($1,a.outlet_id)';
  projection:='to_jsonb(a)||jsonb_build_object(''lines'',(SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object(''received'',(SELECT coalesce(sum(quantity),0) FROM public.nusa_receipt_items ri WHERE purchase_item_id=i.id))) FROM public.nusa_purchase_items i WHERE purchase_id=a.id))';
 WHEN 'counts' THEN
  source:='public.nusa_stock_counts a'; ordering:='(a.status=''pending'') DESC,a.created_at DESC,a.id DESC';
  predicate:=predicate||' AND $3<>''cashier'' AND public.nusa_access($1,a.outlet_id)';
  projection:='to_jsonb(a)||jsonb_build_object(''lines'',(SELECT jsonb_agg(to_jsonb(i)) FROM public.nusa_count_items i WHERE count_id=a.id))';
 WHEN 'refunds' THEN
  source:='public.nusa_refunds a'; ordering:='(a.status=''pending'') DESC,a.created_at DESC,a.id DESC';
  predicate:=predicate||' AND $3 IN (''owner'',''manager'') AND public.nusa_access($1,a.outlet_id)';
  projection:='to_jsonb(a)||jsonb_build_object(''cost'',(SELECT sum(cogs_reversal) FROM public.nusa_refund_items WHERE refund_id=a.id),''lines'',(SELECT jsonb_agg(to_jsonb(ri)||jsonb_build_object(''name'',si.name)) FROM public.nusa_refund_items ri JOIN public.nusa_sale_items si ON si.id=ri.sale_item_id WHERE refund_id=a.id))';
 WHEN 'expenses' THEN
  source:='public.nusa_expenses a'; ordering:='a.occurred_at DESC,a.id DESC';
  predicate:=predicate||' AND $3 IN (''owner'',''manager'') AND public.nusa_access($1,a.outlet_id)';
 WHEN 'ledger' THEN
  source:='public.nusa_stock_movements a JOIN public.nusa_inventory_documents d ON d.id=a.document_id'; ordering:='a.created_at DESC,a.id DESC';
  predicate:=predicate||' AND $3<>''cashier'' AND public.nusa_access($1,a.outlet_id)';
  projection:='to_jsonb(a)||jsonb_build_object(''reason'',d.reason)';
 WHEN 'invoices' THEN source:='public.nusa_invoices a'; predicate:=predicate||' AND $3=''owner'''; ordering:='a.created_at DESC,a.id DESC';
 WHEN 'audit' THEN source:='public.nusa_audit a'; predicate:=predicate||' AND $3=''owner'''; ordering:='a.created_at DESC,a.id DESC';
 ELSE RAISE EXCEPTION 'INVALID_COLLECTION';
 END CASE;
 EXECUTE format('SELECT coalesce(jsonb_agg(value),''[]''::jsonb) FROM (SELECT %s AS value FROM %s WHERE %s ORDER BY %s LIMIT 101 OFFSET $2) bounded',projection,source,predicate,ordering)
 INTO rows USING t,page*100,r,auth.uid();
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(rows)>100 THEN rows-100 ELSE rows END,'nextPage',CASE WHEN jsonb_array_length(rows)>100 THEN page+1 ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.nusa_list_page(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_list_page(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.nusa_snapshot(t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; pages jsonb:='{}'; name text; batch jsonb; r text:=public.nusa_role(t);
BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t),'FORBIDDEN');
 SELECT jsonb_build_object('tenant',to_jsonb(a),'role',r,'userId',auth.uid(),'asOf',now()) INTO result FROM public.nusa_tenants a WHERE id=t;
 result:=result||jsonb_build_object(
 'outlets',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_outlets a WHERE tenant_id=t AND public.nusa_access(t,id)),
 'registers',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.nusa_registers a WHERE tenant_id=t AND public.nusa_access(t,outlet_id)),
 'subscription',(SELECT to_jsonb(s)||jsonb_build_object('plan',to_jsonb(p)) FROM public.nusa_subscriptions s JOIN public.nusa_plan_versions p ON p.id=s.plan_id WHERE tenant_id=t),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('outlet_ids',(SELECT jsonb_agg(outlet_id) FROM public.nusa_member_outlets WHERE membership_id=a.id))),'[]') FROM public.nusa_memberships a WHERE tenant_id=t AND r='owner'),
 'invitations',(SELECT coalesce(jsonb_agg(to_jsonb(a)-'token_hash'),'[]') FROM public.nusa_invitations a WHERE tenant_id=t AND r='owner' AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()),
 'forecast',public.nusa_forecast(t),
 'membershipId',(SELECT id FROM public.nusa_memberships WHERE tenant_id=t AND user_id=auth.uid() AND active),
 'aiUsed',(SELECT count(*) FROM public.nusa_ai_requests WHERE tenant_id=t AND status<>'failed' AND created_at>=(SELECT period_start FROM public.nusa_subscriptions WHERE tenant_id=t)));
 FOREACH name IN ARRAY ARRAY['products','balances','sales','shifts','customers','suppliers','purchases','counts','refunds','expenses','ledger','invoices','audit'] LOOP
  batch:=public.nusa_list_page(t,name,0); result:=result||jsonb_build_object(name,batch->'items'); pages:=pages||jsonb_build_object(name,batch->'nextPage');
 END LOOP;
 RETURN result||jsonb_build_object('pages',pages);
END $$;

-- Cashiers may ask stock questions; write proposals remain restricted by nusa_proposal.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.nusa_ai_internal(uuid,text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'IN (''owner'',''manager'',''inventory'')','IN (''owner'',''manager'',''inventory'',''cashier'')');
 EXECUTE definition;
END $$;
