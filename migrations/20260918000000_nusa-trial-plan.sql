-- Add a Rp1.000 trial plan for sandbox payment testing.
INSERT INTO public.nusa_plan_versions(
  id, name, monthly_price, outlet_limit, member_limit, ai_limit, illustrative_price
)
VALUES(
  'trial-v1', 'Trial', 1000, 1, 2, 200, false
)
ON CONFLICT (id) DO UPDATE SET
  monthly_price = EXCLUDED.monthly_price,
  illustrative_price = EXCLUDED.illustrative_price;