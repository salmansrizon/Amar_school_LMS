-- 0114_sms_packages_public_read.sql
-- Bugfix: school SMS package purchase (#300) runs system-side on the anon
-- cronClient (reconcile-secret authorized for the invoice + wallet RPCs), but
-- purchaseSmsPackage first reads the package from sms_packages with that same
-- anon client. sms_packages only allowed "authenticated reads" (auth.uid() not
-- null), so the anon lookup returned nothing and every purchase failed with
-- "unknown SMS package".
--
-- Allow reading ACTIVE packages from any role. Packages are a sales catalog
-- (name/segments/price) — only sellable rows are exposed; inactive rows stay
-- visible to super-admin only via the existing manage policy.
create policy "anyone reads active sms_packages" on public.sms_packages
  for select using (active);
