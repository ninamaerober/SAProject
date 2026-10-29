-- =====================================================================
-- AccessFlow AI  |  Supabase schema, security rules, workflow functions, seed
-- Run ONCE in Supabase Dashboard > SQL Editor (fresh project).
-- Principle: AI recommends. People decide. Every change is audited.
-- All state changes go through role-checked SQL functions (RPC).
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'hr' check (role in ('hr','manager','it_admin')),
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table access_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  department_id uuid references departments(id),
  folder_path text,
  is_admin boolean not null default false      -- administrative groups are locked
);

create table role_rules (                        -- knowledge base behind the AI recommendation
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  group_id uuid not null references access_groups(id) on delete cascade,
  weight int not null default 1 check (weight between 1 and 10),
  reason text not null
);

create sequence emp_seq start 1001;
create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text unique not null default ('EMP-' || nextval('emp_seq')),
  full_name text not null,
  email text not null,
  job_title text not null,
  department_id uuid references departments(id),
  manager_id uuid references profiles(id),
  start_date date,
  workstation text,
  status text not null default 'registered' check (status in
    ('registered','recommended','pending_approval','approved','returned','rejected',
     'account_created','active','offboarding','offboarded')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  department_id uuid references departments(id),
  group_id uuid references access_groups(id),
  folder_path text,
  confidence int,
  reasons text[] not null default '{}',
  recommendation_only boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('onboarding','offboarding')),
  employee_id uuid not null references employees(id) on delete cascade,
  recommendation_id uuid references recommendations(id),
  department_id uuid references departments(id),
  group_id uuid references access_groups(id),
  folder_path text,
  status text not null check (status in
    ('pending_manager','returned','rejected','approved','account_created','completed','pending_it')),
  requested_by uuid,
  requested_by_name text,
  manager_note text,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  reason text,                 -- offboarding reason
  last_day date,               -- offboarding last working day
  script text,                 -- PowerShell that was executed
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table ad_accounts (                       -- simulated AD DS accounts
  id uuid primary key default gen_random_uuid(),
  employee_id uuid unique not null references employees(id) on delete cascade,
  sam_account_name text unique not null,
  upn text not null,
  ou text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table account_groups (                    -- permissions currently / previously held
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references ad_accounts(id) on delete cascade,
  group_id uuid not null references access_groups(id),
  request_id uuid references access_requests(id),
  approved_by_name text,
  approved_at timestamptz,
  granted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_name text,
  revoked_at timestamptz
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create view access_review with (security_invoker = true) as
select ag.id, e.employee_no, e.full_name, a.sam_account_name, a.enabled,
       g.name as group_name, g.folder_path, g.is_admin,
       ag.approved_by_name, ag.approved_at, ag.granted_at,
       ag.reviewed_at, ag.reviewed_by_name, ag.revoked_at
from account_groups ag
join ad_accounts a on a.id = ag.account_id
join employees e on e.id = a.employee_id
join access_groups g on g.id = ag.group_id;

-- ---------- Helpers ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name, email, role)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
          new.email,
          case when new.raw_user_meta_data->>'role' in ('hr','manager','it_admin')
               then new.raw_user_meta_data->>'role' else 'hr' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function require_role(roles text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and role = any(roles)) then
    raise exception 'Not allowed: this action requires role %', array_to_string(roles, ' or ');
  end if;
end $$;

create or replace function write_audit(p_action text, p_entity text, p_entity_id uuid, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_role text;
begin
  select full_name, role into v_name, v_role from profiles where id = auth.uid();
  insert into audit_log(actor_id, actor_name, actor_role, action, entity, entity_id, details)
  values (auth.uid(), coalesce(v_name,'system'), v_role, p_action, p_entity, p_entity_id, coalesce(p_details,'{}'));
end $$;
revoke execute on function write_audit(text,text,uuid,jsonb) from public, anon, authenticated;

create or replace function trg_audit_employee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform write_audit('employee.registered','employee',new.id,
    jsonb_build_object('name',new.full_name,'job_title',new.job_title,'employee_no',new.employee_no));
  return new;
end $$;
create trigger audit_employee_insert after insert on employees
  for each row execute function trg_audit_employee();

create or replace function trg_audit_rule() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform write_audit('rule.created','role_rule',new.id,jsonb_build_object('keyword',new.keyword,'weight',new.weight));
    return new;
  else
    perform write_audit('rule.deleted','role_rule',old.id,jsonb_build_object('keyword',old.keyword));
    return old;
  end if;
end $$;
create trigger audit_rule after insert or delete on role_rules
  for each row execute function trg_audit_rule();

create or replace function ps_quote(p text) returns text language sql immutable as
$$ select '''' || replace(coalesce(p,''), '''', '''''') || '''' $$;

create or replace function next_sam(p_name text) returns text
language plpgsql stable as $$
declare f text; l text; base text; cand text; n int := 1;
begin
  f := regexp_replace(lower(split_part(trim(p_name),' ',1)), '[^a-z]', '', 'g');
  l := regexp_replace(lower(regexp_replace(trim(p_name), '^.*\s', '')), '[^a-z]', '', 'g');
  base := left(left(f,1) || l, 18);
  if base = '' then base := 'user'; end if;
  cand := base;
  while exists (select 1 from ad_accounts where sam_account_name = cand) loop
    n := n + 1; cand := base || n;
  end loop;
  return cand;
end $$;

-- PowerShell the IT administrator sees before anything runs. part: account | groups | disable
create or replace function build_ad_script(p_request uuid, p_part text, p_sam text default null)
returns text language plpgsql stable as $$
declare r access_requests; e employees; d departments; g access_groups; a ad_accounts;
        v_sam text; v_ou text; v_script text; m record;
begin
  select * into r from access_requests where id = p_request;
  if not found then raise exception 'Request not found'; end if;
  select * into e from employees where id = r.employee_id;
  select * into a from ad_accounts where employee_id = e.id;
  v_sam := coalesce(p_sam, a.sam_account_name, next_sam(e.full_name));
  v_script := '# AccessFlow AI - generated script (review before running)' || E'\n' ||
              '# Request ' || r.id || ' | Employee ' || e.employee_no || E'\n' ||
              'Import-Module ActiveDirectory' || E'\n';
  if p_part = 'account' then
    select * into d from departments where id = r.department_id;
    v_ou := 'OU=' || coalesce(d.name,'Staff') || ',DC=corp,DC=accessflow,DC=local';
    v_script := v_script ||
      'New-ADUser -Name ' || ps_quote(e.full_name) ||
      ' -SamAccountName ' || ps_quote(v_sam) ||
      ' -UserPrincipalName ' || ps_quote(v_sam || '@corp.accessflow.local') ||
      ' -EmailAddress ' || ps_quote(e.email) ||
      ' -Title ' || ps_quote(e.job_title) ||
      ' -Department ' || ps_quote(d.name) ||
      ' -Path ' || ps_quote(v_ou) || E' `\n' ||
      '  -AccountPassword (Read-Host -AsSecureString "Initial password") -ChangePasswordAtLogon $true -Enabled $true';
  elsif p_part = 'groups' then
    select * into g from access_groups where id = r.group_id;
    v_script := v_script ||
      'Add-ADGroupMember -Identity ' || ps_quote(g.name) || ' -Members ' || ps_quote(v_sam) || E'\n' ||
      '# Shared folder access is inherited from the group: ' || coalesce(g.folder_path,'(none)');
  elsif p_part = 'disable' then
    v_script := v_script || 'Disable-ADAccount -Identity ' || ps_quote(v_sam) || E'\n';
    for m in select g2.name from account_groups ag join access_groups g2 on g2.id = ag.group_id
             where ag.account_id = a.id and ag.revoked_at is null loop
      v_script := v_script || 'Remove-ADGroupMember -Identity ' || ps_quote(m.name) ||
                  ' -Members ' || ps_quote(v_sam) || ' -Confirm:$false' || E'\n';
    end loop;
  else
    raise exception 'Unknown script part %', p_part;
  end if;
  return v_script;
end $$;

-- ---------- Workflow functions ----------
-- Feature 02: AI role recommendation (rule-scored; never recommends administrative groups)
create or replace function recommend_access(p_employee uuid) returns recommendations
language plpgsql security definer set search_path = public as $$
declare e employees; best record; r recommendations; g access_groups;
        v_reasons text[]; v_conf int; v_blocked boolean;
begin
  perform require_role(array['hr','it_admin']);
  select * into e from employees where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
  if e.status not in ('registered','recommended','returned') then
    raise exception 'Employee is not awaiting a recommendation (status: %)', e.status;
  end if;

  select rr.group_id,
         sum(rr.weight + case when ag.department_id = e.department_id then 2 else 0 end)::int as score,
         array_agg(distinct rr.reason) as reasons
    into best
    from role_rules rr join access_groups ag on ag.id = rr.group_id
   where not ag.is_admin
     and lower(e.job_title) ~ ('\m' || regexp_replace(lower(rr.keyword), '([^a-z0-9 ])', '\\\1', 'g'))
   group by rr.group_id order by 2 desc limit 1;

  select exists (select 1 from role_rules rr join access_groups ag on ag.id = rr.group_id
                  where ag.is_admin
                    and lower(e.job_title) ~ ('\m' || regexp_replace(lower(rr.keyword), '([^a-z0-9 ])', '\\\1', 'g')))
    into v_blocked;

  if best.group_id is null then
    select * into g from access_groups where name = 'General_Staff';
    v_reasons := array['No job-title keyword matched, so general staff access is suggested.'];
    v_conf := 40;
  else
    select * into g from access_groups where id = best.group_id;
    v_reasons := best.reasons;
    v_conf := least(95, 45 + best.score * 8);
  end if;
  if v_blocked then
    v_reasons := v_reasons || 'An administrative group matched but AI cannot grant it. IT must assign it manually.';
  end if;

  insert into recommendations(employee_id, department_id, group_id, folder_path, confidence, reasons, created_by)
  values (e.id, coalesce(g.department_id, e.department_id), g.id, g.folder_path, v_conf, v_reasons, auth.uid())
  returning * into r;

  update employees set status = 'recommended' where id = e.id;
  perform write_audit('ai.recommended','employee',e.id,
    jsonb_build_object('group',g.name,'confidence',v_conf,'recommendation_only',true));
  return r;
end $$;

create or replace function submit_request(p_employee uuid) returns access_requests
language plpgsql security definer set search_path = public as $$
declare e employees; rec recommendations; req access_requests; v_name text;
begin
  perform require_role(array['hr']);
  select * into e from employees where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
  if e.manager_id is null then raise exception 'Assign a manager to this employee first'; end if;
  if e.status not in ('recommended') then raise exception 'Generate a recommendation first (status: %)', e.status; end if;
  select * into rec from recommendations where employee_id = e.id order by created_at desc limit 1;
  if not found then raise exception 'No recommendation found'; end if;
  select full_name into v_name from profiles where id = auth.uid();

  insert into access_requests(type, employee_id, recommendation_id, department_id, group_id, folder_path,
                              status, requested_by, requested_by_name)
  values ('onboarding', e.id, rec.id, rec.department_id, rec.group_id, rec.folder_path,
          'pending_manager', auth.uid(), v_name)
  returning * into req;
  update employees set status = 'pending_approval' where id = e.id;
  perform write_audit('request.submitted','access_request',req.id,
    jsonb_build_object('employee',e.full_name,'manager_id',e.manager_id));
  return req;
end $$;

-- Feature 03: manager decision (human)
create or replace function decide_request(p_request uuid, p_decision text, p_note text default null)
returns access_requests language plpgsql security definer set search_path = public as $$
declare req access_requests; e employees; v_name text;
begin
  perform require_role(array['manager']);
  if p_decision not in ('approved','returned','rejected') then raise exception 'Invalid decision'; end if;
  select * into req from access_requests where id = p_request;
  if not found or req.type <> 'onboarding' or req.status <> 'pending_manager' then
    raise exception 'Request is not awaiting manager approval';
  end if;
  select * into e from employees where id = req.employee_id;
  if e.manager_id is distinct from auth.uid() then
    raise exception 'Only the employee''s assigned manager can decide this request';
  end if;
  if p_decision in ('returned','rejected') and coalesce(trim(p_note),'') = '' then
    raise exception 'A note is required when returning or rejecting';
  end if;
  select full_name into v_name from profiles where id = auth.uid();

  update access_requests set status = p_decision, manager_note = p_note,
         decided_by = auth.uid(), decided_by_name = v_name, decided_at = now()
   where id = req.id returning * into req;
  update employees set status = case p_decision when 'approved' then 'approved'
                                               when 'returned' then 'returned' else 'rejected' end
   where id = e.id;
  perform write_audit('request.' || p_decision,'access_request',req.id,
    jsonb_build_object('employee',e.full_name,'note',p_note));
  return req;
end $$;

-- Feature 04: AD DS integration. No account exists before this step.
create or replace function provision_account(p_request uuid) returns ad_accounts
language plpgsql security definer set search_path = public as $$
declare req access_requests; e employees; d departments; g access_groups; acc ad_accounts;
        v_sam text; v_script text;
begin
  perform require_role(array['it_admin']);
  select * into req from access_requests where id = p_request;
  if not found or req.type <> 'onboarding' or req.status <> 'approved' then
    raise exception 'Request has not been approved by the manager';
  end if;
  select * into g from access_groups where id = req.group_id;
  if g.is_admin then raise exception 'Administrative groups can never be provisioned from a recommendation'; end if;
  select * into e from employees where id = req.employee_id;
  if exists (select 1 from ad_accounts where employee_id = e.id) then raise exception 'Account already exists'; end if;
  select * into d from departments where id = req.department_id;

  v_sam := next_sam(e.full_name);
  v_script := build_ad_script(req.id, 'account', v_sam);
  insert into ad_accounts(employee_id, sam_account_name, upn, ou)
  values (e.id, v_sam, v_sam || '@corp.accessflow.local',
          'OU=' || coalesce(d.name,'Staff') || ',DC=corp,DC=accessflow,DC=local')
  returning * into acc;

  update access_requests set status = 'account_created', script = v_script,
         executed_by = auth.uid(), executed_at = now() where id = req.id;
  update employees set status = 'account_created' where id = e.id;
  perform write_audit('adds.account_created','ad_account',acc.id,
    jsonb_build_object('employee',e.full_name,'sam',v_sam,'ou',acc.ou));
  return acc;
end $$;

-- Feature 05: group assignment (administrative groups stay locked)
create or replace function assign_groups(p_request uuid) returns access_requests
language plpgsql security definer set search_path = public as $$
declare req access_requests; g access_groups; acc ad_accounts; v_script text;
begin
  perform require_role(array['it_admin']);
  select * into req from access_requests where id = p_request;
  if not found or req.status <> 'account_created' then raise exception 'Account has not been created yet'; end if;
  select * into g from access_groups where id = req.group_id;
  if g.is_admin then raise exception 'Group % is administrative and locked', g.name; end if;
  select * into acc from ad_accounts where employee_id = req.employee_id;
  v_script := build_ad_script(req.id, 'groups');

  insert into account_groups(account_id, group_id, request_id, approved_by_name, approved_at)
  values (acc.id, g.id, req.id, req.decided_by_name, req.decided_at);

  update access_requests set status = 'completed', script = coalesce(script,'') || E'\n\n' || v_script,
         executed_by = auth.uid(), executed_at = now() where id = req.id returning * into req;
  update employees set status = 'active' where id = req.employee_id;
  perform write_audit('group.assigned','access_request',req.id,
    jsonb_build_object('sam',acc.sam_account_name,'group',g.name,'folder',g.folder_path));
  return req;
end $$;

-- Feature 06: access review (human confirms or revokes)
create or replace function review_access(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare ag account_groups; v_name text; v_group text; v_sam text;
begin
  perform require_role(array['it_admin']);
  if p_action not in ('keep','revoke') then raise exception 'Invalid action'; end if;
  select * into ag from account_groups where id = p_id;
  if not found then raise exception 'Permission not found'; end if;
  if ag.revoked_at is not null then raise exception 'Already revoked'; end if;
  select full_name into v_name from profiles where id = auth.uid();
  select g.name, a.sam_account_name into v_group, v_sam
    from access_groups g, ad_accounts a where g.id = ag.group_id and a.id = ag.account_id;
  if p_action = 'keep' then
    update account_groups set reviewed_at = now(), reviewed_by_name = v_name where id = p_id;
  else
    update account_groups set revoked_at = now(), reviewed_at = now(), reviewed_by_name = v_name where id = p_id;
  end if;
  perform write_audit('access.' || case p_action when 'keep' then 'confirmed' else 'revoked' end,
    'account_group', p_id, jsonb_build_object('sam',v_sam,'group',v_group));
end $$;

-- Feature 07: offboarding (HR requests, IT approves)
create or replace function start_offboarding(p_employee uuid, p_reason text, p_last_day date)
returns access_requests language plpgsql security definer set search_path = public as $$
declare e employees; req access_requests; v_name text;
begin
  perform require_role(array['hr']);
  select * into e from employees where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
  if e.status not in ('active','account_created') or not exists
     (select 1 from ad_accounts where employee_id = e.id and enabled) then
    raise exception 'Employee has no active account to disable';
  end if;
  select full_name into v_name from profiles where id = auth.uid();
  insert into access_requests(type, employee_id, status, requested_by, requested_by_name, reason, last_day)
  values ('offboarding', e.id, 'pending_it', auth.uid(), v_name, p_reason, p_last_day)
  returning * into req;
  update employees set status = 'offboarding' where id = e.id;
  perform write_audit('offboarding.requested','access_request',req.id,
    jsonb_build_object('employee',e.full_name,'reason',p_reason,'last_day',p_last_day));
  return req;
end $$;

create or replace function decide_offboarding(p_request uuid, p_approve boolean) returns access_requests
language plpgsql security definer set search_path = public as $$
declare req access_requests; acc ad_accounts; v_script text; v_name text;
begin
  perform require_role(array['it_admin']);
  select * into req from access_requests where id = p_request;
  if not found or req.type <> 'offboarding' or req.status <> 'pending_it' then
    raise exception 'Not a pending offboarding request';
  end if;
  select full_name into v_name from profiles where id = auth.uid();
  select * into acc from ad_accounts where employee_id = req.employee_id;
  if p_approve then
    v_script := build_ad_script(req.id, 'disable');
    update account_groups set revoked_at = now() where account_id = acc.id and revoked_at is null;
    update ad_accounts set enabled = false, disabled_at = now() where id = acc.id;
    update access_requests set status = 'completed', script = v_script, decided_by = auth.uid(),
           decided_by_name = v_name, decided_at = now(), executed_by = auth.uid(), executed_at = now()
     where id = req.id returning * into req;
    update employees set status = 'offboarded' where id = req.employee_id;
    perform write_audit('account.disabled','ad_account',acc.id,jsonb_build_object('sam',acc.sam_account_name));
  else
    update access_requests set status = 'rejected', decided_by = auth.uid(), decided_by_name = v_name,
           decided_at = now() where id = req.id returning * into req;
    update employees set status = 'active' where id = req.employee_id;
    perform write_audit('offboarding.rejected','access_request',req.id,'{}');
  end if;
  return req;
end $$;

-- ---------- Row Level Security ----------
alter table profiles        enable row level security;
alter table departments     enable row level security;
alter table access_groups   enable row level security;
alter table role_rules      enable row level security;
alter table employees       enable row level security;
alter table recommendations enable row level security;
alter table access_requests enable row level security;
alter table ad_accounts     enable row level security;
alter table account_groups  enable row level security;
alter table audit_log       enable row level security;

create policy "read profiles"        on profiles        for select to authenticated using (true);
create policy "read departments"     on departments     for select to authenticated using (true);
create policy "read groups"          on access_groups   for select to authenticated using (true);
create policy "read rules"           on role_rules      for select to authenticated using (true);
create policy "read employees"       on employees       for select to authenticated using (true);
create policy "read recommendations" on recommendations for select to authenticated using (true);
create policy "read requests"        on access_requests for select to authenticated using (true);
create policy "read accounts"        on ad_accounts     for select to authenticated using (true);
create policy "read account groups"  on account_groups  for select to authenticated using (true);
create policy "read audit"           on audit_log       for select to authenticated using (true);

create policy "hr registers employees" on employees for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'hr')
              and status = 'registered' and created_by = auth.uid());
create policy "hr edits open employees" on employees for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'hr')
         and status in ('registered','recommended','returned'))
  with check (status in ('registered','recommended','returned'));

create policy "it manages rules" on role_rules for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'it_admin'));
create policy "it deletes rules" on role_rules for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'it_admin'));

-- ---------- Seed data ----------
insert into departments(name) values ('HR'),('IT'),('Finance'),('Sales'),('Engineering'),('Operations');

insert into access_groups(name, description, department_id, folder_path, is_admin)
select v.n, v.d, dp.id, v.f, v.a
from (values
 ('HR_Group','Human resources staff','HR','\\fs01\HR',false),
 ('IT_Support_Group','Helpdesk and infrastructure','IT','\\fs01\IT',false),
 ('Finance_Group','Accounting and payroll','Finance','\\fs01\Finance',false),
 ('Sales_Group','Sales and business development','Sales','\\fs01\Sales',false),
 ('Developers_Group','Software engineering','Engineering','\\fs01\Engineering',false),
 ('Operations_Group','Operations and logistics','Operations','\\fs01\Operations',false),
 ('General_Staff','Default access for all staff','Operations','\\fs01\Public',false),
 ('Domain_Admins','LOCKED: domain administrators','IT',null,true),
 ('Server_Admins','LOCKED: server administrators','IT',null,true)
) as v(n,d,dept,f,a) join departments dp on dp.name = v.dept;

insert into role_rules(keyword, group_id, weight, reason)
select v.k, g.id, v.w, v.r from (values
 ('hr','HR_Group',3,'Job title indicates a Human Resources role'),
 ('human resources','HR_Group',3,'Job title mentions Human Resources'),
 ('recruit','HR_Group',3,'Recruiting work needs the HR shared folder'),
 ('talent','HR_Group',2,'Talent roles work with HR records'),
 ('payroll','Finance_Group',3,'Payroll work needs the Finance shared folder'),
 ('accountant','Finance_Group',3,'Accountants work in the Finance share'),
 ('finance','Finance_Group',3,'Job title mentions Finance'),
 ('auditor','Finance_Group',2,'Auditors review Finance records'),
 ('sales','Sales_Group',3,'Job title indicates a Sales role'),
 ('account executive','Sales_Group',3,'Account executives use the Sales share'),
 ('business development','Sales_Group',3,'Business development uses the Sales share'),
 ('developer','Developers_Group',3,'Developers need the Engineering share'),
 ('engineer','Developers_Group',2,'Engineering titles use the Engineering share'),
 ('software','Developers_Group',2,'Software roles use the Engineering share'),
 ('qa','Developers_Group',2,'QA works with the engineering team'),
 ('help desk','IT_Support_Group',3,'Help desk work needs IT support tooling'),
 ('helpdesk','IT_Support_Group',3,'Help desk work needs IT support tooling'),
 ('it support','IT_Support_Group',3,'Job title indicates IT support'),
 ('system administrator','IT_Support_Group',3,'System administrators need the IT share'),
 ('network','IT_Support_Group',2,'Network roles use the IT share'),
 ('operations','Operations_Group',3,'Job title indicates Operations'),
 ('logistics','Operations_Group',2,'Logistics belongs to Operations'),
 ('warehouse','Operations_Group',2,'Warehouse staff belong to Operations'),
 ('coordinator','Operations_Group',1,'Coordinators commonly support Operations'),
 ('domain admin','Domain_Admins',5,'Domain admin keyword (administrative groups are always blocked)')
) as v(k,gn,w,r) join access_groups g on g.name = v.gn;
