ALTER TABLE public.nusa_files
  DROP CONSTRAINT IF EXISTS nusa_files_purpose_check;

ALTER TABLE public.nusa_files
  ADD CONSTRAINT nusa_files_purpose_check
  CHECK (purpose IN ('invoice','expense','import','product'));

ALTER TABLE public.nusa_products
  ADD COLUMN image_file_id uuid;

ALTER TABLE public.nusa_products
  ADD CONSTRAINT nusa_products_image_file_fk
  FOREIGN KEY (tenant_id,image_file_id)
  REFERENCES public.nusa_files(tenant_id,id);

CREATE FUNCTION public.nusa_product_images(t uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM public.nusa_assert(public.nusa_access(t),'FORBIDDEN');
  RETURN coalesce((
    SELECT jsonb_object_agg(v.id::text,p.image_file_id)
    FROM public.nusa_variants v
    JOIN public.nusa_products p ON p.id=v.product_id AND p.tenant_id=v.tenant_id
    WHERE v.tenant_id=t AND p.image_file_id IS NOT NULL
  ),'{}'::jsonb);
END $$;

CREATE FUNCTION public.nusa_set_product_image(t uuid,v uuid,f uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE product_id uuid;
BEGIN
  PERFORM public.nusa_assert(public.nusa_role(t)='owner','OWNER_REQUIRED');
  SELECT nusa_variants.product_id INTO product_id
  FROM public.nusa_variants
  WHERE tenant_id=t AND id=v;
  PERFORM public.nusa_assert(product_id IS NOT NULL,'PRODUCT_NOT_FOUND');
  PERFORM public.nusa_assert(
    f IS NULL OR EXISTS(
      SELECT 1 FROM public.nusa_files
      WHERE tenant_id=t AND id=f AND purpose='product'
        AND mime_type IN ('image/png','image/jpeg')
    ),
    'INVALID_PRODUCT_IMAGE'
  );
  UPDATE public.nusa_products
  SET image_file_id=f
  WHERE tenant_id=t AND id=product_id;
  INSERT INTO public.nusa_audit(tenant_id,actor_id,action,entity_id)
  VALUES(t,auth.uid(),CASE WHEN f IS NULL THEN 'product_image_removed' ELSE 'product_image_updated' END,v);
  RETURN jsonb_build_object('id',v,'fileId',f);
END $$;

CREATE OR REPLACE FUNCTION public.nusa_file_lookup(i uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public.nusa_files;
BEGIN
  SELECT * INTO f FROM public.nusa_files WHERE id=i;
  PERFORM public.nusa_assert(
    f.id IS NOT NULL AND (
      public.nusa_operator()
      OR public.nusa_role(f.tenant_id)='owner'
      OR (f.purpose='product' AND public.nusa_access(f.tenant_id))
    ),
    'FORBIDDEN'
  );
  RETURN jsonb_build_object('key',f.object_key,'mime',f.mime_type,'purpose',f.purpose);
END $$;

REVOKE ALL ON FUNCTION public.nusa_product_images(uuid),public.nusa_set_product_image(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nusa_product_images(uuid),public.nusa_set_product_image(uuid,uuid,uuid) TO authenticated;
