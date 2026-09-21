CREATE OR REPLACE FUNCTION public.nusa_ai_input(t uuid,op text,p jsonb,k uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
BEGIN
  PERFORM public.nusa_assert(public.nusa_role(t)='owner','OWNER_REQUIRED');
  PERFORM public.nusa_assert(
    op IN ('save-supplier','save-product','save-customer','save-outlet','save-register'),
    'UNKNOWN_AI_INPUT_OPERATION'
  );
  RETURN public.nusa_command(t,op,p,k);
END $$;

REVOKE ALL ON FUNCTION public.nusa_ai_input(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_ai_input(uuid,text,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.nusa_proposal(t uuid,op text,p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
DECLARE a public.nusa_ai_proposals;
BEGIN
  PERFORM public.nusa_assert(public.nusa_role(t)='owner','OWNER_REQUIRED');
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
  IF op='create' THEN
    PERFORM public.nusa_assert(public.nusa_access(t,(p->'payload'->>'outletId')::uuid),'FORBIDDEN');
    INSERT INTO public.nusa_ai_proposals(tenant_id,actor_id,operation,payload)
    VALUES(t,auth.uid(),p->>'operation',p->'payload') RETURNING * INTO a;
  ELSE
    SELECT * INTO a
    FROM public.nusa_ai_proposals
    WHERE id=(p->>'id')::uuid AND tenant_id=t AND actor_id=auth.uid()
    FOR UPDATE;
    PERFORM public.nusa_assert(
      a.id IS NOT NULL AND public.nusa_access(t,(a.payload->>'outletId')::uuid),
      'FORBIDDEN'
    );
    IF a.result IS NOT NULL THEN RETURN to_jsonb(a); END IF;
    PERFORM public.nusa_assert(a.expires_at>now(),'PROPOSAL_EXPIRED');
    a.result:=public.nusa_command(t,a.operation,a.payload,a.id);
    UPDATE public.nusa_ai_proposals SET result=a.result WHERE id=a.id;
  END IF;
  RETURN to_jsonb(a);
END $$;

REVOKE ALL ON FUNCTION public.nusa_proposal(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_proposal(uuid,text,jsonb) TO authenticated;
