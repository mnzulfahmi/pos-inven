ALTER TABLE public.nusa_invoices
  ADD COLUMN provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN provider_invoice_id text,
  ADD COLUMN provider_transaction_id text,
  ADD COLUMN payment_url text,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN paid_at timestamptz;

ALTER TABLE public.nusa_invoices
  DROP CONSTRAINT IF EXISTS nusa_invoices_status_check,
  ADD CONSTRAINT nusa_invoices_status_check
    CHECK(status IN ('awaiting_proof','awaiting_payment','pending','approved','rejected','scheduled')),
  ADD CONSTRAINT nusa_invoices_provider_check
    CHECK(provider IN ('manual','mayar')),
  ADD CONSTRAINT nusa_invoices_payment_url_check
    CHECK(payment_url IS NULL OR payment_url LIKE 'https://%');

CREATE UNIQUE INDEX nusa_invoice_provider_id
  ON public.nusa_invoices(provider,provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX nusa_invoice_provider_transaction
  ON public.nusa_invoices(provider,provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE FUNCTION public.nusa_billing_prepare(t uuid,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.nusa_invoices; plan public.nusa_plan_versions;
BEGIN
  PERFORM public.nusa_assert(public.nusa_role(t)='owner','OWNER_REQUIRED');
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
  SELECT * INTO inv FROM public.nusa_invoices
    WHERE tenant_id=t AND id=(p->>'invoiceId')::uuid FOR UPDATE;
  PERFORM public.nusa_assert(inv.id IS NOT NULL AND inv.status IN ('awaiting_proof','awaiting_payment'),'INVOICE_CHANGED');
  IF inv.provider='manual' THEN
    UPDATE public.nusa_invoices SET provider='mayar',status='awaiting_payment',reason=''
      WHERE id=inv.id RETURNING * INTO inv;
  END IF;
  PERFORM public.nusa_assert(inv.provider='mayar','INVOICE_PROVIDER_MISMATCH');
  SELECT * INTO plan FROM public.nusa_plan_versions WHERE id=inv.plan_id;
  RETURN to_jsonb(inv)||jsonb_build_object('planName',plan.name);
END $$;

CREATE FUNCTION public.nusa_billing_bind(t uuid,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.nusa_invoices;
BEGIN
  PERFORM public.nusa_assert(public.nusa_role(t)='owner','OWNER_REQUIRED');
  PERFORM public.nusa_assert(
    length(p->>'providerInvoiceId') BETWEEN 1 AND 200 AND
    length(p->>'providerTransactionId') BETWEEN 1 AND 200 AND
    length(p->>'paymentUrl') BETWEEN 10 AND 2000 AND
    p->>'paymentUrl' LIKE 'https://%',
    'INVALID_PAYMENT_REFERENCE'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
  SELECT * INTO inv FROM public.nusa_invoices
    WHERE tenant_id=t AND id=(p->>'invoiceId')::uuid FOR UPDATE;
  PERFORM public.nusa_assert(inv.id IS NOT NULL AND inv.provider='mayar' AND inv.status='awaiting_payment','INVOICE_CHANGED');
  PERFORM public.nusa_assert(inv.provider_invoice_id IS NULL OR (
    inv.provider_invoice_id=p->>'providerInvoiceId' AND
    inv.provider_transaction_id=p->>'providerTransactionId'
  ),'PAYMENT_REFERENCE_CHANGED');
  UPDATE public.nusa_invoices SET
    provider_invoice_id=p->>'providerInvoiceId',
    provider_transaction_id=p->>'providerTransactionId',
    payment_url=p->>'paymentUrl',
    expires_at=nullif(p->>'expiresAt','')::timestamptz
    WHERE id=inv.id RETURNING * INTO inv;
  RETURN to_jsonb(inv);
END $$;

CREATE FUNCTION public.nusa_mayar_lookup(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.nusa_invoices;
BEGIN
  SELECT * INTO inv FROM public.nusa_invoices WHERE provider='mayar' AND (
    (nullif(p->>'invoiceId','') IS NOT NULL AND id=(p->>'invoiceId')::uuid) OR
    (nullif(p->>'providerInvoiceId','') IS NOT NULL AND provider_invoice_id=p->>'providerInvoiceId') OR
    (nullif(p->>'providerTransactionId','') IS NOT NULL AND provider_transaction_id=p->>'providerTransactionId')
  ) ORDER BY created_at DESC LIMIT 1;
  IF inv.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id',inv.id,'tenantId',inv.tenant_id,'planId',inv.plan_id,'amount',inv.amount,
    'status',inv.status,'providerInvoiceId',inv.provider_invoice_id,
    'providerTransactionId',inv.provider_transaction_id
  );
END $$;

CREATE FUNCTION public.nusa_mayar_complete(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.nusa_invoices; sub public.nusa_subscriptions; plan public.nusa_plan_versions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended((p->>'invoiceId'),0));
  SELECT * INTO inv FROM public.nusa_invoices
    WHERE id=(p->>'invoiceId')::uuid AND provider='mayar' FOR UPDATE;
  PERFORM public.nusa_assert(inv.id IS NOT NULL,'INVOICE_NOT_FOUND');
  PERFORM public.nusa_assert(inv.status IN ('awaiting_payment','approved','scheduled'),'INVOICE_CHANGED');
  PERFORM public.nusa_assert(inv.amount=(p->>'amount')::bigint,'PAYMENT_AMOUNT_MISMATCH');
  PERFORM public.nusa_assert(
    inv.provider_invoice_id=p->>'providerInvoiceId' AND
    inv.provider_transaction_id=p->>'providerTransactionId',
    'PAYMENT_REFERENCE_MISMATCH'
  );
  IF inv.status IN ('approved','scheduled') THEN RETURN to_jsonb(inv); END IF;

  SELECT * INTO plan FROM public.nusa_plan_versions WHERE id=inv.plan_id;
  PERFORM public.nusa_assert(
    (SELECT count(*) FROM public.nusa_outlets WHERE tenant_id=inv.tenant_id AND active)<=plan.outlet_limit AND
    (SELECT count(*) FROM public.nusa_memberships WHERE tenant_id=inv.tenant_id AND active)<=plan.member_limit,
    'PLAN_CAPACITY_EXCEEDED'
  );
  SELECT * INTO sub FROM public.nusa_subscriptions WHERE tenant_id=inv.tenant_id FOR UPDATE;
  IF sub.status='active' AND sub.period_end>now() AND
    (SELECT monthly_price FROM public.nusa_plan_versions WHERE id=sub.plan_id)>plan.monthly_price THEN
    PERFORM public.nusa_assert(sub.pending_invoice_id IS NULL OR sub.pending_invoice_id=inv.id,'DOWNGRADE_ALREADY_SCHEDULED');
    UPDATE public.nusa_subscriptions SET pending_plan_id=plan.id,pending_invoice_id=inv.id
      WHERE tenant_id=inv.tenant_id;
    UPDATE public.nusa_invoices SET status='scheduled',paid_at=now(),verified_at=now(),
      reason='Pembayaran Mayar diterima',period_start=sub.period_end,period_end=sub.period_end+interval '1 month'
      WHERE id=inv.id RETURNING * INTO inv;
  ELSE
    UPDATE public.nusa_subscriptions SET status='active',plan_id=plan.id,period_start=now(),
      period_end=now()+interval '1 month',grace_end=now()+interval '1 month 3 days',version=version+1
      WHERE tenant_id=inv.tenant_id;
    UPDATE public.nusa_invoices SET status='approved',paid_at=now(),verified_at=now(),
      reason='Pembayaran Mayar diterima',period_start=now(),period_end=now()+interval '1 month'
      WHERE id=inv.id RETURNING * INTO inv;
  END IF;
  INSERT INTO public.nusa_audit(tenant_id,action,entity_id,reason)
    VALUES(inv.tenant_id,'mayar_payment_received',inv.id,p->>'providerTransactionId');
  RETURN to_jsonb(inv);
END $$;

REVOKE ALL ON FUNCTION public.nusa_billing_prepare(uuid,jsonb),public.nusa_billing_bind(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_billing_prepare(uuid,jsonb),public.nusa_billing_bind(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.nusa_mayar_lookup(jsonb),public.nusa_mayar_complete(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nusa_mayar_lookup(jsonb),public.nusa_mayar_complete(jsonb) TO project_admin;
