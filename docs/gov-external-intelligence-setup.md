# External intelligence deployment setup

This connector stores external IOCs separately from Cyber-Sakhi cases. It
never creates, modifies, or inflates `public.cases`.

1. Apply `supabase/migrations/gov_external_intelligence.sql` in staging, then
   production, through the approved Supabase migration process.
2. Obtain and approve an abuse.ch URLhaus Auth-Key. Confirm the organization
   is licensed for its intended use before enabling automated synchronization.
3. Set `URLHAUS_AUTH_KEY` and `CRON_SECRET` only as server-side deployment
   secrets. Do not prefix either with `NEXT_PUBLIC_`.
4. Deploy `vercel.json`. The scheduler calls the internal sync endpoint every
   30 minutes with Vercel's `Authorization: Bearer $CRON_SECRET` convention.
5. Use the Data Sources screen to confirm source health. A fresh-MFA
   `SUPER_ADMIN` can manually run the guarded synchronization endpoint; all
   other roles can only see their permitted, masked read views.

If the migration, key, or authorization is absent, the console must continue
to show the source as unavailable or disabled. Do not substitute sample IOCs,
research data, or inferred cases.
