# TGG signup password hardening — 2026-09-17

## Production state

- `tgg-password-breach-check-v4` deployed version: **7**
- `tgg-creator-os-app-v17` deployed version: **210**
- `private.tgg_signup_password_guard_config.enforcement_enabled`: **true**
- Guard covers password-backed INSERT plus the invited-account repair UPDATE path.
- Signup approval tokens are single-use, email-bound, purpose-bound, and expire after 5 minutes.
- The breach checker remains backwards-compatible with password-only checks used by account password changes.
- Direct signup uses purpose `creator_os_direct`.
- Call-validation signup/repair uses purpose `call_validation_invite`.

## Verification completed

1. RED source contract confirmed missing approval bridge before implementation.
2. Breach-check source contract GREEN after deployment.
3. Approval issuer RPC returned `ok:true` with a 300-second TTL and persisted the approval row.
4. Rollback-only database integration test passed with enforcement enabled:
   - valid token accepted;
   - token stripped from metadata;
   - token consumed from approval table;
   - invalid token blocked;
   - invited repair UPDATE accepted with valid token.
5. Creator OS source contract GREEN:
   - two create-user calls retained;
   - direct signup wired once;
   - invited create/repair wired twice;
   - three approval metadata writes present.
6. Security advisor rerun after activation.

## Remaining external control

Supabase's hosted **Leaked Password Protection** toggle is still reported disabled by the Security Advisor. The custom TGG guard is active and fail-closed, but it does not replace the hosted Supabase setting in the advisor.

Remediation reference:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Rollback

If password-backed signup must be reopened before a regression is fixed:

```sql
update private.tgg_signup_password_guard_config
set enforcement_enabled=false, updated_at=now()
where id=1;
```

Do not remove the trigger or approval tables as an emergency rollback; use the configuration switch above.
