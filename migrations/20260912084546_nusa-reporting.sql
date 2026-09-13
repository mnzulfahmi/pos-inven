CREATE FUNCTION public.nusa_report(t uuid,o uuid,d int) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE last_at timestamptz:=(date_trunc('day',now() AT TIME ZONE 'Asia/Jakarta')+interval '1 day') AT TIME ZONE 'Asia/Jakarta'; first_at timestamptz; r text:=public.nusa_role(t); daily jsonb; cur jsonb; prev jsonb; top_rows jsonb; result jsonb; BEGIN
 PERFORM public.nusa_assert(d BETWEEN 1 AND 90 AND public.nusa_access(t,o) AND r IN ('owner','manager','cashier'),'FORBIDDEN');first_at:=last_at-make_interval(days=>d);
 WITH source AS(
  SELECT (s.posted_at AT TIME ZONE 'Asia/Jakarta')::date date_key,(s.subtotal-s.discount)::numeric revenue,0::numeric refunds,1::bigint count,coalesce((SELECT sum(cogs) FROM public.nusa_sale_items WHERE sale_id=s.id),0) cogs,0::numeric expenses
   FROM public.nusa_sales s WHERE tenant_id=t AND (o IS NULL OR outlet_id=o) AND public.nusa_access(t,outlet_id) AND (r<>'cashier' OR cashier_id=auth.uid()) AND posted_at>=first_at-make_interval(days=>d) AND posted_at<last_at
  UNION ALL SELECT (rf.posted_at AT TIME ZONE 'Asia/Jakarta')::date,0,rf.net,0,-coalesce((SELECT sum(cogs_reversal) FROM public.nusa_refund_items WHERE refund_id=rf.id),0),0 FROM public.nusa_refunds rf WHERE tenant_id=t AND status='posted' AND (o IS NULL OR outlet_id=o) AND public.nusa_access(t,outlet_id) AND r IN ('owner','manager') AND posted_at>=first_at-make_interval(days=>d) AND posted_at<last_at
  UNION ALL SELECT (e.occurred_at AT TIME ZONE 'Asia/Jakarta')::date,0,0,0,0,amount FROM public.nusa_expenses e WHERE tenant_id=t AND (o IS NULL OR outlet_id=o) AND public.nusa_access(t,outlet_id) AND r IN ('owner','manager') AND occurred_at>=first_at-make_interval(days=>d) AND occurred_at<last_at
 ), aggregate AS(SELECT date_key,sum(revenue) revenue,sum(refunds) refunds,sum(count) count,sum(cogs) cogs,sum(expenses) expenses FROM source GROUP BY date_key)
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') INTO daily FROM aggregate a;
 SELECT jsonb_build_object('sales',coalesce(sum((a->>'revenue')::numeric-(a->>'refunds')::numeric),0),'gross',coalesce(sum((a->>'revenue')::numeric),0),'refunds',coalesce(sum((a->>'refunds')::numeric),0),'count',coalesce(sum((a->>'count')::bigint),0),'grossProfit',CASE WHEN r='cashier' THEN NULL ELSE coalesce(sum((a->>'revenue')::numeric-(a->>'refunds')::numeric-(a->>'cogs')::numeric),0) END,'expenses',CASE WHEN r='cashier' THEN NULL ELSE coalesce(sum((a->>'expenses')::numeric),0) END) INTO cur FROM jsonb_array_elements(daily) a WHERE (a->>'date_key')::date>=(first_at AT TIME ZONE 'Asia/Jakarta')::date;
 SELECT jsonb_build_object('sales',coalesce(sum((a->>'revenue')::numeric-(a->>'refunds')::numeric),0),'gross',coalesce(sum((a->>'revenue')::numeric),0),'count',coalesce(sum((a->>'count')::bigint),0)) INTO prev FROM jsonb_array_elements(daily) a WHERE (a->>'date_key')::date<(first_at AT TIME ZONE 'Asia/Jakarta')::date;
 result:=cur||jsonb_build_object('basket',CASE WHEN (cur->>'count')::numeric=0 THEN 0 ELSE (cur->>'gross')::numeric/(cur->>'count')::numeric END,'previousSales',prev->'sales','previousCount',prev->'count',
 'salesGrowth',CASE WHEN (prev->>'sales')::numeric=0 THEN NULL ELSE ((cur->>'sales')::numeric/(prev->>'sales')::numeric-1)*100 END,
 'countGrowth',CASE WHEN (prev->>'count')::numeric=0 THEN NULL ELSE ((cur->>'count')::numeric/(prev->>'count')::numeric-1)*100 END,
 'basketGrowth',CASE WHEN (prev->>'gross')::numeric=0 OR (cur->>'count')::numeric=0 THEN NULL ELSE ((cur->>'gross')::numeric/(cur->>'count')::numeric/((prev->>'gross')::numeric/(prev->>'count')::numeric)-1)*100 END);
 SELECT result||jsonb_build_object('chart',jsonb_agg(jsonb_build_object('date',date_key::date,'label',to_char(date_key,'DD Mon'),'sales',coalesce((a->>'revenue')::numeric-(a->>'refunds')::numeric,0),'count',coalesce((a->>'count')::bigint,0),'refunds',coalesce((a->>'refunds')::numeric,0),'previous',coalesce((b->>'revenue')::numeric-(b->>'refunds')::numeric,0),'previousCount',coalesce((b->>'count')::bigint,0)) ORDER BY date_key)) INTO result
 FROM generate_series((first_at AT TIME ZONE 'Asia/Jakarta')::date,((last_at AT TIME ZONE 'Asia/Jakarta')::date-1),interval '1 day') date_key
 LEFT JOIN jsonb_array_elements(daily) a ON (a->>'date_key')::date=date_key::date LEFT JOIN jsonb_array_elements(daily) b ON (b->>'date_key')::date=date_key::date-d;
 WITH lines AS(
 SELECT si.variant_id,si.quantity units,si.net revenue FROM public.nusa_sale_items si JOIN public.nusa_sales s ON s.id=si.sale_id WHERE s.tenant_id=t AND (o IS NULL OR s.outlet_id=o) AND public.nusa_access(t,s.outlet_id) AND (r<>'cashier' OR s.cashier_id=auth.uid()) AND s.posted_at>=first_at AND s.posted_at<last_at
 UNION ALL SELECT si.variant_id,-ri.quantity,-ri.net FROM public.nusa_refund_items ri JOIN public.nusa_refunds rf ON rf.id=ri.refund_id JOIN public.nusa_sale_items si ON si.id=ri.sale_item_id WHERE rf.tenant_id=t AND rf.status='posted' AND (o IS NULL OR rf.outlet_id=o) AND public.nusa_access(t,rf.outlet_id) AND r IN ('owner','manager') AND rf.posted_at>=first_at AND rf.posted_at<last_at
 ), ranked AS(SELECT variant_id id,sum(units) units,sum(revenue) revenue FROM lines GROUP BY variant_id ORDER BY sum(revenue) DESC LIMIT 50)
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY revenue DESC),'[]') INTO top_rows FROM ranked a;
 RETURN jsonb_build_object('summary',result,'top',top_rows,'asOf',now(),'outlet',o,'days',d);
END $$;
REVOKE ALL ON FUNCTION public.nusa_report(uuid,uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_report(uuid,uuid,int) TO authenticated;
CREATE INDEX nusa_refunds_reporting ON public.nusa_refunds(tenant_id,outlet_id,posted_at) WHERE status='posted';
CREATE INDEX nusa_expenses_reporting ON public.nusa_expenses(tenant_id,outlet_id,occurred_at);
