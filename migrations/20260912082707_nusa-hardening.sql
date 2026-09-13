CREATE OR REPLACE FUNCTION public.nusa_file_register(t uuid,p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i uuid; BEGIN
 PERFORM public.nusa_assert(public.nusa_role(t)='owner' AND split_part(p->>'key','/',1)=t::text,'FORBIDDEN');
 PERFORM public.nusa_assert(EXISTS(SELECT 1 FROM storage.objects WHERE bucket='nusa-private' AND key=p->>'key' AND uploaded_by=auth.uid()::text),'FILE_NOT_FOUND');
 INSERT INTO public.nusa_files(tenant_id,bucket,object_key,url,mime_type,size_bytes,purpose,uploaded_by) VALUES(t,'nusa-private',p->>'key',p->>'url',p->>'mime',(p->>'size')::int,p->>'purpose',auth.uid()) RETURNING id INTO i;RETURN i;
END $$;
CREATE FUNCTION public.nusa_maintenance() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.nusa_subscriptions; BEGIN
 FOR s IN SELECT * FROM public.nusa_subscriptions WHERE pending_plan_id IS NOT NULL AND period_end<=now() LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(s.tenant_id::text,0));
  IF (SELECT count(*) FROM public.nusa_outlets WHERE tenant_id=s.tenant_id AND active)<=(SELECT outlet_limit FROM public.nusa_plan_versions WHERE id=s.pending_plan_id)
    AND (SELECT count(*) FROM public.nusa_memberships WHERE tenant_id=s.tenant_id AND active)<=(SELECT member_limit FROM public.nusa_plan_versions WHERE id=s.pending_plan_id) THEN
   UPDATE public.nusa_subscriptions SET plan_id=s.pending_plan_id,period_start=s.period_end,period_end=s.period_end+interval '1 month',grace_end=s.period_end+interval '1 month 3 days',pending_plan_id=NULL,pending_invoice_id=NULL,version=version+1 WHERE tenant_id=s.tenant_id;
   UPDATE public.nusa_invoices SET status='approved' WHERE id=s.pending_invoice_id;
   INSERT INTO public.nusa_audit(tenant_id,action,entity_id) VALUES(s.tenant_id,'scheduled_plan_activated',s.pending_invoice_id);
  END IF;
 END LOOP;
 DELETE FROM public.nusa_quotes WHERE expires_at<now()-interval '1 day';
 DELETE FROM public.nusa_ai_requests WHERE created_at<now()-interval '90 days';
END $$;
REVOKE ALL ON FUNCTION public.nusa_maintenance() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.nusa_file_lookup(i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.nusa_files; BEGIN
 SELECT * INTO f FROM public.nusa_files WHERE id=i;
 PERFORM public.nusa_assert(f.id IS NOT NULL AND (public.nusa_role(f.tenant_id)='owner' OR public.nusa_operator()),'FORBIDDEN');
 RETURN jsonb_build_object('key',f.object_key,'mime',f.mime_type);
END $$;
REVOKE ALL ON FUNCTION public.nusa_file_lookup(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_file_lookup(uuid) TO authenticated;

CREATE TABLE public.nusa_ai_proposals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.nusa_tenants,actor_id uuid NOT NULL REFERENCES auth.users,operation text NOT NULL CHECK(operation IN ('create-purchase','create-count')),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',result jsonb);
ALTER TABLE public.nusa_ai_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nusa_ai_proposals FROM anon,authenticated;
CREATE FUNCTION public.nusa_proposal(t uuid,op text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.nusa_ai_proposals; BEGIN
 PERFORM public.nusa_assert(public.nusa_role(t) IN ('owner','manager','inventory'),'FORBIDDEN');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 IF op='create' THEN
  PERFORM public.nusa_assert(public.nusa_access(t,(p->'payload'->>'outletId')::uuid),'FORBIDDEN');
  INSERT INTO public.nusa_ai_proposals(tenant_id,actor_id,operation,payload) VALUES(t,auth.uid(),p->>'operation',p->'payload') RETURNING * INTO a;
 ELSE
  SELECT * INTO a FROM public.nusa_ai_proposals WHERE id=(p->>'id')::uuid AND tenant_id=t AND actor_id=auth.uid() FOR UPDATE;
  PERFORM public.nusa_assert(a.id IS NOT NULL AND public.nusa_access(t,(a.payload->>'outletId')::uuid),'FORBIDDEN');
  IF a.result IS NOT NULL THEN RETURN to_jsonb(a);END IF;
  PERFORM public.nusa_assert(a.expires_at>now(),'PROPOSAL_EXPIRED');
  a.result:=public.nusa_command(t,a.operation,a.payload,a.id);
  UPDATE public.nusa_ai_proposals SET result=a.result WHERE id=a.id;
 END IF;RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.nusa_proposal(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_proposal(uuid,text,jsonb) TO authenticated;
