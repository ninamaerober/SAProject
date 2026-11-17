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
| 4 Review the PowerShell preview and record simulated account + home-folder provisioning | IT | AD DS integration |
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
- AD DS and home-folder provisioning are simulated in the database. The reviewed PowerShell script creates an AD account and a private `H:` home folder named for the account when run on a trusted Windows worker. The folder inherits no permissions; the employee receives Modify, the configured IT group and `SYSTEM` receive Full Control. The app itself does not connect to or create folders on a Windows server.
- For an existing Supabase project, run `supabase/migrations/20261117013000_add_home_folder_provisioning.sql` once in the Supabase SQL Editor. Fresh projects get the function from `supabase/schema.sql`.
- Before using a trusted Windows worker, set machine-level `ACCESSFLOW_HOME_SHARE_ROOT` to the UNC share root (for example, `\\fileserver\Home`) and `ACCESSFLOW_IT_ADMINS_GROUP` to the actual AD group name. The worker identity needs access to the share and least-privilege rights to create AD accounts and folders. Ensure the share-level ACL permits access; the script applies restrictive NTFS ACLs. The generated AD domain/OU are demo values and must be adapted to your directory before production use.
- The current IT button only records simulated provisioning. Real automation requires a trusted, audited Windows worker to execute the reviewed script; do not run database-provided script text without validating that it is an approved request.

## Production notes

- Public sign-up is not available in the app. Keep it disabled in Supabase and provision accounts and roles administratively.
- The Supabase publishable key is intended for use in the browser; never put a Supabase service-role key in the frontend or its build configuration.
- Configure the deployed app's URL in Supabase Authentication's site URL and redirect URL settings.

## Deploy the front end to Oracle Cloud Infrastructure

The frontend can run as a container on an [OCI Compute](https://www.oracle.com/cloud/compute/) instance. This hosts only the static React app; Supabase remains responsible for authentication and data.

1. Create a Linux Compute instance and install Docker Engine with Docker Compose. You can provision the instance using the [OCI Terraform configuration](./infra/oci/README.md). Configure the instance's network security to allow inbound TCP port `8080` only from trusted addresses for initial testing.
2. Clone this repository on the instance, copy `.env.example` to `.env`, and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the app's Supabase project values.
3. Build and start the container:
   ```bash
   docker compose up -d --build
   ```
4. Open `http://<instance-public-ip>:8080` to verify the app. The Nginx configuration serves client-side routes correctly after page refreshes.

For production, serve the app over HTTPS using an OCI Load Balancer or another TLS-terminating reverse proxy; do not expose the instance's unencrypted port publicly. Restrict direct instance access to the proxy and trusted administration addresses. Update Supabase's authentication URL settings to match the public HTTPS URL.

The Vite variables are embedded in the frontend bundle during the image build, so rebuild the image after changing them. Do not use a Supabase service-role key; browser-visible configuration is public.

Vercel and Netlify are also supported deployment options.
