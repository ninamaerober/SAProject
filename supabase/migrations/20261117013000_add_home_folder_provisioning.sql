-- Replace the account script builder so approved employee provisioning also
-- creates a private home folder on the configured Windows file share.
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
      '$HomeRoot = $env:ACCESSFLOW_HOME_SHARE_ROOT' || E'\n' ||
      '$ItAdmins = $env:ACCESSFLOW_IT_ADMINS_GROUP' || E'\n' ||
      '$SamAccountName = ' || ps_quote(v_sam) || E'\n' ||
      'if ([string]::IsNullOrWhiteSpace($HomeRoot)) { throw ''ACCESSFLOW_HOME_SHARE_ROOT is required'' }' || E'\n' ||
      'if (-not $HomeRoot.StartsWith(''\\'')) { throw ''Home folder root must be a UNC share path'' }' || E'\n' ||
      'if ([string]::IsNullOrWhiteSpace($ItAdmins)) { throw ''ACCESSFLOW_IT_ADMINS_GROUP is required'' }' || E'\n' ||
      'if (-not (Test-Path -LiteralPath $HomeRoot -PathType Container)) { throw ''Home folder share root is not accessible'' }' || E'\n' ||
      '$HomeDirectory = Join-Path -Path $HomeRoot -ChildPath $SamAccountName' || E'\n' ||
      'if (Test-Path -LiteralPath $HomeDirectory) { throw ''Home folder already exists; investigate before provisioning'' }' || E'\n' ||
      'New-ADUser -Name ' || ps_quote(e.full_name) ||
      ' -SamAccountName ' || ps_quote(v_sam) ||
      ' -UserPrincipalName ' || ps_quote(v_sam || '@corp.accessflow.local') ||
      ' -EmailAddress ' || ps_quote(e.email) ||
      ' -Title ' || ps_quote(e.job_title) ||
      ' -Department ' || ps_quote(d.name) ||
      ' -Path ' || ps_quote(v_ou) || E' `\n' ||
      '  -HomeDirectory $HomeDirectory -HomeDrive ''H:'' -AccountPassword (Read-Host -AsSecureString "Initial password") -ChangePasswordAtLogon $true -Enabled $true -ErrorAction Stop' || E'\n' ||
      'New-Item -ItemType Directory -Path $HomeDirectory -ErrorAction Stop | Out-Null' || E'\n' ||
      '$DomainNetBIOS = (Get-ADDomain).NetBIOSName' || E'\n' ||
      '& icacls.exe $HomeDirectory /inheritance:r /grant:r "$($DomainNetBIOS)\$($SamAccountName):(OI)(CI)M" "$($ItAdmins):(OI)(CI)F" ''SYSTEM:(OI)(CI)F''' || E'\n' ||
      'if ($LASTEXITCODE -ne 0) { throw ''Failed to set home folder permissions'' }';
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
