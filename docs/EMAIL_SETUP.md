# Manyfolds email activation

Status checked 19 October 2026: no domain/provider purchased, no custom SMTP or verified sender configured. Email confirmation stays required. Google sign-in can operate independently. Signup confirmation and password-reset delivery are not commercially ready until sender activation and inbox testing succeed.

## Prepared implementation

- Branded confirmation and recovery templates are in `emails/` and preserve Supabase's signed `ConfirmationURL` and existing PKCE callback.
- Password recovery now exchanges the recovery code even when a session is already active, opens a new-password/confirmation form, and reports completion. The recovery state comes from the SDK's PASSWORD_RECOVERY event. Signup, sign-in, reset requests and password changes have bounded waits.
- `npm run email:check` reads current Supabase settings and reports missing local settings without printing secrets or sending email.
- Put the chosen provider's `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and bare sender address `SMTP_FROM` into `.env.local`. The management command also needs the local `SUPABASE_ACCESS_TOKEN`; none of these belong in browser code.
- Configure the sender domain with the provider's exact SPF, DKIM and DMARC records; verify the sender in the provider dashboard. Disable provider click tracking for authentication links.
- `npm run email:configure` validates settings, configures the existing Manyfolds Supabase project, applies both templates, keeps confirmation required, and reads settings back. It does not change the site URL or redirect allowlist. Supabase currently rejects template changes on its free plan with the default mail sender; templates will be applied together with custom SMTP.

## Activation checks after provider setup

1. Verify delivery of a fresh-account confirmation to an explicitly designated test inbox. Follow the link in the browser used for signup; confirm a new school gets its own workspace.
2. Request password recovery for that test account. Open the link and save a new password, then verify the old password no longer works.
3. Check expired/reused links, provider delivery events, spam placement and rate limits. DNS record presence alone does not prove deliverability.
4. Staff invitations currently produce secure email-bound links for administrators to share. Automatic invitation emails and operational notifications are separate unfinished workflows; SMTP configuration alone does not implement them.

References: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
