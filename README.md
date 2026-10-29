# AccessFlow AI

React + Vite front end on a Supabase (Postgres + Auth) back end.
Employee onboarding and access management where **AI recommends and people decide**.

## Setup (10 minutes)

1. **Create a Supabase project** at supabase.com.
2. **Run the database script**: Dashboard > SQL Editor > paste all of `supabase/schema.sql` > Run (once, on a fresh project).
3. **Disable public sign-ups**: Authentication > Settings > turn off "Allow new users to sign up". Create the HR, Manager, and IT administrator accounts through Supabase Auth as an administrator, then assign each user's role in `public.profiles`. Do not expose a service-role key in the front end.
4. **Add keys**: copy `.env.example` to `.env` and fill in Project URL and publishable key (Project Settings > API).
5. Install and run:
   ```bash
   npm install
   npm run dev
   ```
6. **Provision user accounts administratively** for HR staff, Manager, and IT administrator. HR adds employee records from the Employee registration page after signing in.

## Try the full flow

| Step | Sign in as | Page |
|---|---|---|
| 1 Register an employee (pick the manager) e.g. title "HR Coordinator" | HR | Employee registration |
| 2 Generate the recommendation, then submit | HR | AI role recommendation |
| 3 Approve, return or reject | Manager | Approval workflow |
| 4 Review the PowerShell preview, run it (creates the AD DS account) | IT | AD DS integration |
| 5 Assign the approved group | IT | Group assignment |
| 6 Confirm or revoke permissions | IT | Access review |
| 7 Record a departure, then approve the disable request | HR, then IT | Offboarding |

Every step is written to **Audit log**. IT can edit the recommendation keywords under **Recommendation rules**.

## How it is built

- Tables: `profiles, departments, access_groups, role_rules, employees, recommendations, access_requests, ad_accounts, account_groups, audit_log`.
- All state changes are Postgres functions (`recommend_access, submit_request, decide_request, provision_account, assign_groups, review_access, start_offboarding, decide_offboarding`) that check the caller's role, so the rules hold even if someone calls the API directly.
- Row Level Security: everyone signed in can read; only HR can register employees; only IT can edit rules; the rest is function-only.
- Security rule enforced in the database: administrative groups (`Domain_Admins`, `Server_Admins`) are never recommended, provisioned or assigned. No account exists before the manager and IT have both decided.
- The "AI" is a weighted keyword scorer over `role_rules` with reasons and confidence. To use an LLM, call it from a Supabase Edge Function and write the result into `recommendations` (keep `recommendation_only = true`).
- The AD DS account and PowerShell are simulated in the database. The script that would run is stored on each request. To go live, have a Windows service poll `access_requests` and execute the stored script.

## Production notes

- Public sign-up is not available in the app. Keep it disabled in Supabase and provision accounts and roles administratively.
- Deploy the front end to Vercel/Netlify with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
