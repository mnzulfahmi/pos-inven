-- Fix nusa_mayar_lookup: was declared STABLE which prevents FOR UPDATE locking.
-- Change to VOLATILE so the webhook handler can read the latest committed row
-- and the caller can follow up with nusa_mayar_complete inside the same connection.
-- Also add missing composite index to speed up the three-way OR lookup.

-- Ensure the index on provider_invoice_id / provider_transaction_id includes
-- partial rows so the webhook can find an invoice even when only one of the
-- two provider keys is available.
CREATE INDEX IF NOT EXISTS nusa_invoice_mayar_lookup
  ON public.nusa_invoices(provider, provider_invoice_id, provider_transaction_id)
  WHERE provider = 'mayar';

-- Replace nusa_mayar_lookup with a VOLATILE version.
-- STABLE is forbidden for functions that need to see rows written in the same
-- transaction or that return different results on repeated calls within a single
-- statement.  The webhook handler calls adminRpc which runs each RPC in its own
-- connection, but a STABLE function may still cache reads inside a planner
-- snapshot.  VOLATILE forces a fresh catalog + heap scan every call.
CREATE OR REPLACE FUNCTION public.nusa_mayar_lookup(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inv public.nusa_invoices;
BEGIN
  -- Select the most-recently-created matching invoice.
  -- Precedence: local UUID > providerInvoiceId > providerTransactionId.
  -- The webhook payload from Mayar does not include extraData, so invoiceId
  -- will typically be empty and lookup falls through to providerInvoiceId.
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

-- nusa_mayar_complete already uses an advisory lock keyed on invoiceId and a
-- FOR UPDATE row-level lock, making it safe against concurrent webhook retries.
-- Re-grant to project_admin so the existing grants stay intact.
REVOKE ALL ON FUNCTION public.nusa_mayar_lookup(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nusa_mayar_lookup(jsonb) TO project_admin;
