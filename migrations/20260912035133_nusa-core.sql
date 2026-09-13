-- Nusa's normalized domain schema. Runtime writes go through authorized RPCs.
CREATE TABLE public.nusa_tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 owner_id uuid NOT NULL REFERENCES auth.users(id), address text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 timezone text NOT NULL DEFAULT 'Asia/Jakarta', currency text NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'),
 tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 100),
 discount_limit numeric(7,4) NOT NULL DEFAULT 0 CHECK(discount_limit BETWEEN 0 AND 100),
 receipt_footer text NOT NULL DEFAULT 'Terima kasih sudah berbelanja.',
 onboarded boolean NOT NULL DEFAULT false, version bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.nusa_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), name text NOT NULL DEFAULT '', email text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','manager','cashier','inventory')),
 active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 0,
 UNIQUE(tenant_id,user_id), UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX nusa_one_owner ON public.nusa_memberships(tenant_id) WHERE role='owner' AND active;
CREATE INDEX nusa_memberships_user ON public.nusa_memberships(user_id,tenant_id) WHERE active;
CREATE TABLE public.nusa_outlets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), code text NOT NULL,
 address text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE public.nusa_member_outlets (
 tenant_id uuid NOT NULL, membership_id uuid NOT NULL, outlet_id uuid NOT NULL,
 PRIMARY KEY(membership_id,outlet_id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES public.nusa_memberships(tenant_id,id),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id)
);
CREATE TABLE public.nusa_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 email text NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('manager','cashier','inventory')),
 token_hash text NOT NULL UNIQUE, invited_by uuid NOT NULL REFERENCES auth.users(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz,
 UNIQUE(tenant_id,id)
);
CREATE TABLE public.nusa_invitation_outlets (
 tenant_id uuid NOT NULL, invitation_id uuid NOT NULL, outlet_id uuid NOT NULL,
 PRIMARY KEY(invitation_id,outlet_id),
 FOREIGN KEY(tenant_id,invitation_id) REFERENCES public.nusa_invitations(tenant_id,id),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id)
);
CREATE TABLE public.nusa_registers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,outlet_id,id), UNIQUE(outlet_id,name)
);
CREATE TABLE public.nusa_plan_versions (
 id text PRIMARY KEY, name text NOT NULL, version int NOT NULL DEFAULT 1,
 monthly_price bigint NOT NULL CHECK(monthly_price>=0), outlet_limit int NOT NULL CHECK(outlet_limit>0),
 member_limit int NOT NULL CHECK(member_limit>0), ai_limit int NOT NULL CHECK(ai_limit>=0),
 illustrative_price boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.nusa_plan_versions(id,name,monthly_price,outlet_limit,member_limit,ai_limit)
 VALUES ('starter-v1','Starter',99000,1,2,200),('pro-v1','Pro',249000,3,5,1000),('business-v1','Business',699000,10,20,5000);
CREATE TABLE public.nusa_subscriptions (
 tenant_id uuid PRIMARY KEY REFERENCES public.nusa_tenants(id), plan_id text NOT NULL REFERENCES public.nusa_plan_versions(id),
 status text NOT NULL CHECK(status IN ('pending','trial','active')), period_start timestamptz NOT NULL DEFAULT now(),
 period_end timestamptz NOT NULL DEFAULT now(), grace_end timestamptz,
 pending_plan_id text REFERENCES public.nusa_plan_versions(id), pending_invoice_id uuid,
 version bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.nusa_platform_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.nusa_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 bucket text NOT NULL CHECK(bucket='nusa-private'), object_key text NOT NULL UNIQUE, url text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','application/pdf','text/csv')),
 size_bytes int NOT NULL CHECK(size_bytes BETWEEN 1 AND 10000000),
 purpose text NOT NULL CHECK(purpose IN ('invoice','expense','import')), outlet_id uuid,
 uploaded_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id)
);
CREATE TABLE public.nusa_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_subscriptions(tenant_id),
 plan_id text NOT NULL REFERENCES public.nusa_plan_versions(id), amount bigint NOT NULL CHECK(amount>=0),
 status text NOT NULL DEFAULT 'awaiting_proof' CHECK(status IN ('awaiting_proof','pending','approved','rejected','scheduled')),
 proof_file_id uuid, verified_by uuid REFERENCES auth.users(id), reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz, period_start timestamptz, period_end timestamptz,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,proof_file_id) REFERENCES public.nusa_files(tenant_id,id)
);
ALTER TABLE public.nusa_subscriptions ADD FOREIGN KEY(tenant_id,pending_invoice_id) REFERENCES public.nusa_invoices(tenant_id,id);
CREATE TABLE public.nusa_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 name text NOT NULL, UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX nusa_category_name ON public.nusa_categories(tenant_id,lower(name));
CREATE TABLE public.nusa_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 category_id uuid, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,category_id) REFERENCES public.nusa_categories(tenant_id,id)
);
CREATE TABLE public.nusa_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product_id uuid NOT NULL,
 name text NOT NULL DEFAULT 'Default', sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 80), barcode text,
 unit text NOT NULL DEFAULT 'unit', quantity_precision int NOT NULL DEFAULT 0 CHECK(quantity_precision BETWEEN 0 AND 3),
 price bigint NOT NULL CHECK(price BETWEEN 0 AND 1000000000), initial_cost numeric(20,6) NOT NULL DEFAULT 0 CHECK(initial_cost>=0),
 active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,product_id) REFERENCES public.nusa_products(tenant_id,id)
);
CREATE UNIQUE INDEX nusa_variant_sku ON public.nusa_variants(tenant_id,lower(sku));
CREATE UNIQUE INDEX nusa_variant_barcode ON public.nusa_variants(tenant_id,barcode) WHERE barcode IS NOT NULL;
CREATE TABLE public.nusa_balances (
 tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, variant_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(quantity>=0), unit_cost numeric(20,6) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 value numeric(24,6) NOT NULL DEFAULT 0 CHECK(value>=0), version bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(outlet_id,variant_id), UNIQUE(tenant_id,outlet_id,variant_id),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id),
 FOREIGN KEY(tenant_id,variant_id) REFERENCES public.nusa_variants(tenant_id,id)
);
CREATE TABLE public.nusa_reorder_rules (
 tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, variant_id uuid NOT NULL,
 minimum numeric(18,3) NOT NULL DEFAULT 0 CHECK(minimum>=0), safety numeric(18,3) NOT NULL DEFAULT 0 CHECK(safety>=0),
 lead_days int NOT NULL DEFAULT 3 CHECK(lead_days BETWEEN 0 AND 365), review_days int NOT NULL DEFAULT 7 CHECK(review_days BETWEEN 1 AND 365),
 PRIMARY KEY(outlet_id,variant_id), FOREIGN KEY(tenant_id,outlet_id,variant_id) REFERENCES public.nusa_balances(tenant_id,outlet_id,variant_id)
);
CREATE TABLE public.nusa_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX nusa_customer_phone ON public.nusa_customers(tenant_id,phone) WHERE phone<>'';
CREATE TABLE public.nusa_suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX nusa_supplier_name ON public.nusa_suppliers(tenant_id,lower(name));
CREATE TABLE public.nusa_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, register_id uuid NOT NULL,
 opened_by uuid NOT NULL REFERENCES auth.users(id), closed_by uuid REFERENCES auth.users(id),
 opening_cash bigint NOT NULL CHECK(opening_cash>=0), counted_cash bigint CHECK(counted_cash>=0),
 expected_cash bigint, difference bigint, reason text NOT NULL DEFAULT '',
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,outlet_id,register_id) REFERENCES public.nusa_registers(tenant_id,outlet_id,id)
);
CREATE UNIQUE INDEX nusa_open_register ON public.nusa_shifts(register_id) WHERE closed_at IS NULL;
CREATE TABLE public.nusa_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, shift_id uuid NOT NULL,
 customer_id uuid, cashier_id uuid NOT NULL REFERENCES auth.users(id), number text NOT NULL,
 subtotal bigint NOT NULL CHECK(subtotal>=0), discount bigint NOT NULL CHECK(discount BETWEEN 0 AND subtotal),
 tax bigint NOT NULL CHECK(tax>=0), total bigint NOT NULL CHECK(total=subtotal-discount+tax),
 quote_hash text NOT NULL, posted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,number),
 FOREIGN KEY(tenant_id,outlet_id,shift_id) REFERENCES public.nusa_shifts(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES public.nusa_customers(tenant_id,id)
);
CREATE INDEX nusa_sales_period ON public.nusa_sales(tenant_id,outlet_id,posted_at DESC,id);
CREATE TABLE public.nusa_sale_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sale_id uuid NOT NULL, variant_id uuid NOT NULL,
 name text NOT NULL, sku text NOT NULL, quantity numeric(18,3) NOT NULL CHECK(quantity>0), price bigint NOT NULL CHECK(price>=0),
 discount bigint NOT NULL CHECK(discount>=0), net bigint NOT NULL CHECK(net>=0), tax bigint NOT NULL CHECK(tax>=0),
 unit_cost numeric(20,6) NOT NULL CHECK(unit_cost>=0), cogs numeric(24,6) NOT NULL CHECK(cogs>=0),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,sale_id,id), UNIQUE(sale_id,variant_id),
 FOREIGN KEY(tenant_id,sale_id) REFERENCES public.nusa_sales(tenant_id,id),
 FOREIGN KEY(tenant_id,variant_id) REFERENCES public.nusa_variants(tenant_id,id)
);
CREATE TABLE public.nusa_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sale_id uuid NOT NULL UNIQUE,
 method text NOT NULL CHECK(method IN ('Tunai','QRIS','Kartu','Transfer')), amount bigint NOT NULL CHECK(amount>=0),
 tendered bigint NOT NULL CHECK(tendered>=amount), change bigint NOT NULL CHECK(change=tendered-amount),
 confirmed_by uuid NOT NULL REFERENCES auth.users(id), external_reference text NOT NULL DEFAULT '',
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,sale_id) REFERENCES public.nusa_sales(tenant_id,id)
);
CREATE TABLE public.nusa_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, sale_id uuid NOT NULL, shift_id uuid,
 requested_by uuid NOT NULL REFERENCES auth.users(id), approved_by uuid REFERENCES auth.users(id),
 reason text NOT NULL CHECK(length(reason)>0), status text NOT NULL CHECK(status IN ('pending','posted','rejected')),
 net bigint NOT NULL DEFAULT 0, tax bigint NOT NULL DEFAULT 0, total bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,sale_id,id),
 FOREIGN KEY(tenant_id,outlet_id,sale_id) REFERENCES public.nusa_sales(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,outlet_id,shift_id) REFERENCES public.nusa_shifts(tenant_id,outlet_id,id)
);
CREATE INDEX nusa_refunds_period ON public.nusa_refunds(tenant_id,outlet_id,posted_at DESC);
CREATE TABLE public.nusa_refund_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, refund_id uuid NOT NULL, sale_id uuid NOT NULL, sale_item_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), restock numeric(18,3) NOT NULL CHECK(restock BETWEEN 0 AND quantity),
 net bigint NOT NULL DEFAULT 0, tax bigint NOT NULL DEFAULT 0, cogs_reversal numeric(24,6) NOT NULL DEFAULT 0,
 UNIQUE(refund_id,sale_item_id),
 FOREIGN KEY(tenant_id,sale_id,refund_id) REFERENCES public.nusa_refunds(tenant_id,sale_id,id),
 FOREIGN KEY(tenant_id,sale_id,sale_item_id) REFERENCES public.nusa_sale_items(tenant_id,sale_id,id)
);
CREATE TABLE public.nusa_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, shift_id uuid,
 category text NOT NULL, amount bigint NOT NULL CHECK(amount>0), method text NOT NULL CHECK(method IN ('Tunai','Transfer')),
 note text NOT NULL CHECK(length(note)>0), proof_file_id uuid, created_by uuid NOT NULL REFERENCES auth.users(id),
 occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id),
 FOREIGN KEY(tenant_id,outlet_id,shift_id) REFERENCES public.nusa_shifts(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,proof_file_id) REFERENCES public.nusa_files(tenant_id,id)
);
CREATE TABLE public.nusa_cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, shift_id uuid NOT NULL,
 amount bigint NOT NULL, kind text NOT NULL CHECK(kind IN ('sale','refund','expense','manual')),
 payment_id uuid, refund_id uuid, expense_id uuid, reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,shift_id) REFERENCES public.nusa_shifts(tenant_id,id),
 FOREIGN KEY(tenant_id,payment_id) REFERENCES public.nusa_payments(tenant_id,id),
 FOREIGN KEY(tenant_id,refund_id) REFERENCES public.nusa_refunds(tenant_id,id),
 FOREIGN KEY(tenant_id,expense_id) REFERENCES public.nusa_expenses(tenant_id,id),
 CHECK((kind='manual' AND num_nonnulls(payment_id,refund_id,expense_id)=0) OR
 (kind='sale' AND payment_id IS NOT NULL AND num_nonnulls(payment_id,refund_id,expense_id)=1) OR
 (kind='refund' AND refund_id IS NOT NULL AND num_nonnulls(payment_id,refund_id,expense_id)=1) OR
 (kind='expense' AND expense_id IS NOT NULL AND num_nonnulls(payment_id,refund_id,expense_id)=1)),
 UNIQUE(payment_id), UNIQUE(refund_id), UNIQUE(expense_id)
);
CREATE INDEX nusa_cash_shift ON public.nusa_cash_movements(shift_id);
CREATE TABLE public.nusa_purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, supplier_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','partial','received','cancelled')),
 created_by uuid NOT NULL REFERENCES auth.users(id), approved_by uuid REFERENCES auth.users(id),
 version bigint NOT NULL DEFAULT 0, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id),
 FOREIGN KEY(tenant_id,supplier_id) REFERENCES public.nusa_suppliers(tenant_id,id)
);
CREATE TABLE public.nusa_purchase_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, purchase_id uuid NOT NULL, variant_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), cost numeric(20,6) NOT NULL CHECK(cost>=0),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,purchase_id,id), UNIQUE(purchase_id,variant_id),
 FOREIGN KEY(tenant_id,purchase_id) REFERENCES public.nusa_purchase_orders(tenant_id,id),
 FOREIGN KEY(tenant_id,variant_id) REFERENCES public.nusa_variants(tenant_id,id)
);
CREATE TABLE public.nusa_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, purchase_id uuid NOT NULL,
 received_by uuid NOT NULL REFERENCES auth.users(id), posted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,purchase_id,id), UNIQUE(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,outlet_id,purchase_id) REFERENCES public.nusa_purchase_orders(tenant_id,outlet_id,id)
);
CREATE TABLE public.nusa_receipt_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, receipt_id uuid NOT NULL, purchase_id uuid NOT NULL, purchase_item_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), cost numeric(20,6) NOT NULL CHECK(cost>=0), UNIQUE(receipt_id,purchase_item_id),
 FOREIGN KEY(tenant_id,purchase_id,receipt_id) REFERENCES public.nusa_receipts(tenant_id,purchase_id,id),
 FOREIGN KEY(tenant_id,purchase_id,purchase_item_id) REFERENCES public.nusa_purchase_items(tenant_id,purchase_id,id)
);
CREATE INDEX nusa_received_item ON public.nusa_receipt_items(purchase_item_id);
CREATE TABLE public.nusa_stock_counts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
 counted_by uuid NOT NULL REFERENCES auth.users(id), approved_by uuid REFERENCES auth.users(id),
 reason text NOT NULL CHECK(length(reason)>0), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,outlet_id,id), FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id)
);
CREATE TABLE public.nusa_count_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, count_id uuid NOT NULL, variant_id uuid NOT NULL,
 expected numeric(18,3) NOT NULL CHECK(expected>=0), physical numeric(18,3) NOT NULL CHECK(physical>=0),
 version bigint NOT NULL, cost numeric(20,6) CHECK(cost>=0), UNIQUE(count_id,variant_id),
 FOREIGN KEY(tenant_id,count_id) REFERENCES public.nusa_stock_counts(tenant_id,id),
 FOREIGN KEY(tenant_id,variant_id) REFERENCES public.nusa_variants(tenant_id,id)
);
CREATE TABLE public.nusa_inventory_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL,
 sale_id uuid, refund_id uuid, receipt_id uuid, count_id uuid,
 actor_id uuid NOT NULL REFERENCES auth.users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(sale_id,refund_id,receipt_id,count_id)=1), UNIQUE(sale_id), UNIQUE(refund_id), UNIQUE(receipt_id), UNIQUE(count_id),
 UNIQUE(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,outlet_id,sale_id) REFERENCES public.nusa_sales(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,refund_id) REFERENCES public.nusa_refunds(tenant_id,id),
 FOREIGN KEY(tenant_id,outlet_id,receipt_id) REFERENCES public.nusa_receipts(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,outlet_id,count_id) REFERENCES public.nusa_stock_counts(tenant_id,outlet_id,id)
);
CREATE TABLE public.nusa_stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, document_id uuid NOT NULL, variant_id uuid NOT NULL,
 delta numeric(18,3) NOT NULL CHECK(delta<>0), unit_cost numeric(20,6) NOT NULL CHECK(unit_cost>=0), value_delta numeric(24,6) NOT NULL,
 balance_after numeric(18,3) NOT NULL CHECK(balance_after>=0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,variant_id), FOREIGN KEY(tenant_id,outlet_id,document_id) REFERENCES public.nusa_inventory_documents(tenant_id,outlet_id,id),
 FOREIGN KEY(tenant_id,variant_id) REFERENCES public.nusa_variants(tenant_id,id)
);
CREATE INDEX nusa_stock_history ON public.nusa_stock_movements(tenant_id,outlet_id,variant_id,created_at DESC);
CREATE TABLE public.nusa_idempotency (
 tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id), operation text NOT NULL, key uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id), request_hash text NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,operation,key)
);
CREATE TABLE public.nusa_onboarding_requests (
 user_id uuid NOT NULL REFERENCES auth.users(id), key uuid NOT NULL, tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 request_hash text NOT NULL, PRIMARY KEY(user_id,key)
);
CREATE TABLE public.nusa_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.nusa_tenants(id),
 actor_id uuid REFERENCES auth.users(id), outlet_id uuid, action text NOT NULL, entity_id uuid, reason text NOT NULL DEFAULT '',
 request_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES public.nusa_outlets(tenant_id,id)
);
CREATE INDEX nusa_audit_time ON public.nusa_audit(tenant_id,created_at DESC);
CREATE TABLE public.nusa_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, outlet_id uuid NOT NULL, variant_id uuid NOT NULL,
 title text NOT NULL, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id,variant_id) REFERENCES public.nusa_balances(tenant_id,outlet_id,variant_id)
);
CREATE UNIQUE INDEX nusa_notification_condition ON public.nusa_notifications(outlet_id,variant_id) WHERE resolved_at IS NULL;

-- Identity helpers never trust role or tenant claims supplied by the browser.
CREATE FUNCTION public.nusa_verified() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_verified AND NOT is_anonymous) $$;
CREATE FUNCTION public.nusa_role(t uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$ SELECT m.role FROM public.nusa_memberships m WHERE m.tenant_id=t AND m.user_id=auth.uid() AND m.active AND public.nusa_verified() $$;
CREATE FUNCTION public.nusa_access(t uuid,o uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.nusa_memberships m WHERE m.tenant_id=t AND m.user_id=auth.uid() AND m.active AND public.nusa_verified() AND (m.role='owner' OR o IS NULL OR EXISTS(SELECT 1 FROM public.nusa_member_outlets mo WHERE mo.membership_id=m.id AND mo.outlet_id=o))) $$;
CREATE FUNCTION public.nusa_operator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$ SELECT public.nusa_verified() AND EXISTS(SELECT 1 FROM public.nusa_platform_admins WHERE user_id=auth.uid() AND active) $$;

-- Deny runtime writes and direct reads by default; expose only safe read surfaces.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'nusa_%' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tablename);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',r.tablename);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.nusa_plan_versions TO anon,authenticated;
CREATE POLICY nusa_public_plans ON public.nusa_plan_versions FOR SELECT TO anon,authenticated USING(true);
GRANT SELECT ON public.nusa_tenants,public.nusa_outlets,public.nusa_registers TO authenticated;
CREATE POLICY nusa_tenant_read ON public.nusa_tenants FOR SELECT TO authenticated USING(public.nusa_access(id));
CREATE POLICY nusa_outlet_read ON public.nusa_outlets FOR SELECT TO authenticated USING(public.nusa_access(tenant_id,id));
CREATE POLICY nusa_register_read ON public.nusa_registers FOR SELECT TO authenticated USING(public.nusa_access(tenant_id,outlet_id));
REVOKE ALL ON FUNCTION public.nusa_verified(),public.nusa_role(uuid),public.nusa_access(uuid,uuid),public.nusa_operator() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_verified(),public.nusa_role(uuid),public.nusa_access(uuid,uuid),public.nusa_operator() TO authenticated;
