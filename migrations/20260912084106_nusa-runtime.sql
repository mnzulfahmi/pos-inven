ALTER TABLE public.nusa_ai_requests ADD COLUMN completion_nonce uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN access_scope text NOT NULL DEFAULT '';
CREATE FUNCTION public.nusa_scope(t uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT md5(coalesce(public.nusa_role(t),'')||coalesce((SELECT string_agg(id::text,',' ORDER BY id) FROM public.nusa_outlets WHERE tenant_id=t AND public.nusa_access(t,id)),''))
$$;
REVOKE ALL ON FUNCTION public.nusa_scope(uuid) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.nusa_ai(uuid,text,jsonb) RENAME TO nusa_ai_internal;
REVOKE ALL ON FUNCTION public.nusa_ai_internal(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.nusa_ai(t uuid,op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE existing public.nusa_ai_requests; result jsonb; scope text:=public.nusa_scope(t); BEGIN
 PERFORM public.nusa_assert(public.nusa_access(t),'FORBIDDEN');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 SELECT * INTO existing FROM public.nusa_ai_requests WHERE id=(p->>'id')::uuid;
 IF op IN ('complete','fail') THEN
  PERFORM public.nusa_assert(existing.user_id=auth.uid() AND existing.tenant_id=t AND existing.completion_nonce=(p->>'nonce')::uuid AND existing.access_scope=scope,'FORBIDDEN');
 END IF;
 result:=public.nusa_ai_internal(t,op,p);
 IF op='history' THEN RETURN coalesce((SELECT jsonb_agg(a-'completion_nonce'-'access_scope') FROM jsonb_array_elements(result) a WHERE a->>'access_scope'=scope),'[]'); END IF;
 IF op='reserve' AND existing.id IS NULL THEN
  UPDATE public.nusa_ai_requests SET access_scope=scope WHERE id=(p->>'id')::uuid;
  RETURN result;
 END IF;
 -- A repeated reservation cannot reveal the completion capability of an in-flight request.
 RETURN result-'completion_nonce'-'access_scope';
END $$;
REVOKE ALL ON FUNCTION public.nusa_ai(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_ai(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.nusa_forecast(t uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH inputs AS(SELECT b.outlet_id,b.variant_id,b.quantity,coalesce(rr.minimum,0) minimum,coalesce(rr.safety,0) safety,coalesce(rr.lead_days,3) lead,coalesce(rr.review_days,7) review,
 greatest(1,least(28,current_date-v.created_at::date+1)) days,
 coalesce((SELECT sum(si.quantity) FROM public.nusa_sale_items si JOIN public.nusa_sales s ON s.id=si.sale_id WHERE si.variant_id=b.variant_id AND s.outlet_id=b.outlet_id AND s.posted_at>=now()-interval '28 days'),0) units,
 coalesce((SELECT sum(pi.quantity-(SELECT coalesce(sum(ri.quantity),0) FROM public.nusa_receipt_items ri WHERE ri.purchase_item_id=pi.id)) FROM public.nusa_purchase_items pi JOIN public.nusa_purchase_orders po ON po.id=pi.purchase_id WHERE pi.variant_id=b.variant_id AND po.outlet_id=b.outlet_id AND po.status IN ('approved','partial')),0) incoming
 FROM public.nusa_balances b JOIN public.nusa_variants v ON v.id=b.variant_id LEFT JOIN public.nusa_reorder_rules rr USING(outlet_id,variant_id) WHERE b.tenant_id=t AND public.nusa_access(t,b.outlet_id) AND v.active)
 SELECT coalesce(jsonb_agg(jsonb_build_object('productId',variant_id,'outlet',outlet_id,'daily',units/days,'observedDays',days,'lead',lead,'review',review,'safety',safety,'incoming',incoming,'limited',days<14,'recommended',greatest(0,CASE WHEN days<14 THEN minimum ELSE ceil(units/days*(lead+review)+safety) END-quantity-incoming))),'[]') FROM inputs
$$;
REVOKE ALL ON FUNCTION public.nusa_forecast(uuid) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.nusa_snapshot(uuid) RENAME TO nusa_read_workspace;
REVOKE ALL ON FUNCTION public.nusa_read_workspace(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.nusa_snapshot(t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; BEGIN
 result:=public.nusa_read_workspace(t);
 RETURN result||jsonb_build_object('forecast',public.nusa_forecast(t),'membershipId',(SELECT id FROM public.nusa_memberships WHERE tenant_id=t AND user_id=auth.uid() AND active),'aiUsed',(SELECT count(*) FROM public.nusa_ai_requests WHERE tenant_id=t AND status<>'failed' AND created_at>=(SELECT period_start FROM public.nusa_subscriptions WHERE tenant_id=t)),
 'refunds',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('cost',(SELECT sum(cogs_reversal) FROM public.nusa_refund_items WHERE refund_id=r.id),'lines',(SELECT jsonb_agg(to_jsonb(ri)||jsonb_build_object('name',si.name)) FROM public.nusa_refund_items ri JOIN public.nusa_sale_items si ON si.id=ri.sale_item_id WHERE refund_id=r.id))),'[]') FROM public.nusa_refunds r WHERE tenant_id=t AND public.nusa_role(t) IN ('owner','manager') AND public.nusa_access(t,outlet_id)));
END $$;
REVOKE ALL ON FUNCTION public.nusa_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_snapshot(uuid) TO authenticated;

CREATE TABLE public.nusa_service_keys(name text PRIMARY KEY,hash text NOT NULL);
ALTER TABLE public.nusa_service_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nusa_service_keys FROM anon,authenticated;
CREATE FUNCTION public.nusa_run_maintenance(token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM public.nusa_service_keys WHERE name='maintenance' AND hash=encode(sha256(convert_to(token,'UTF8')),'hex')),'FORBIDDEN');
 PERFORM public.nusa_maintenance();
 UPDATE public.nusa_ai_requests SET status='failed' WHERE status='pending' AND created_at<now()-interval '10 minutes';
 DELETE FROM public.nusa_ai_proposals WHERE created_at<now()-interval '90 days';
 RETURN jsonb_build_object('ok',true,'at',now());
END $$;
REVOKE ALL ON FUNCTION public.nusa_run_maintenance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nusa_run_maintenance(text) TO anon,authenticated;
