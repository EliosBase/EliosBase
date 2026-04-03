# Rollback Procedures

## Frontend (Vercel)

1. Go to [Vercel Dashboard](https://vercel.com) > Project > Deployments
2. Find the last known good deployment
3. Click "..." > **Promote to Production**
4. Verify the site is working at https://eliosbase.net

### Preview Pull Requests

1. Open the PR in Vercel and identify the last known good preview deployment for the branch
2. If needed, redeploy or revert the branch commit that broke the preview
3. Verify the preview at `/api/ready`
4. Re-run `preview-smoke` on the pull request before merging

## Database (Supabase)

Supabase does not support automatic migration rollback.

**For schema changes:**
- Write a reverse migration SQL file and run it via the Supabase SQL editor
- Example: if you added a column, `ALTER TABLE tasks DROP COLUMN IF EXISTS new_column;`

**For data issues:**
- Use Supabase's Point-in-Time Recovery (Pro plan) from the dashboard
- Or restore from a manual backup if available

**Prevention:**
- Always use `IF NOT EXISTS` / `IF EXISTS` in migrations
- Test migrations against a staging Supabase project first

## Smart Contracts

Contracts are **immutable** once deployed. To "rollback":

1. Deploy a new version of the contract
2. Update `NEXT_PUBLIC_ESCROW_ADDRESS` or `NEXT_PUBLIC_VERIFIER_ADDRESS` in Vercel env vars
3. Redeploy the frontend
4. The old contract remains on-chain — any funds locked in it must be recovered via its own functions

## Environment Variables

If a bad env var was deployed:
1. Update the value in Vercel dashboard
2. Trigger a redeploy (or promote a previous deployment)
