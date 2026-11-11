# Security model

- Public source contains no Bible databases, scores, notes, tokens, passwords,
  screenshots, backups or account-specific settings.
- Public code is not a private login wall. Google authorizes private data access.
- Optional setup handoff uses a URL fragment containing only public OAuth client
  ID, restricted browser Picker API key and project number. It is stripped before
  initialization and never contains a token, notes, identity or private dataset.
  Recipients confirm import. Treat the link as personal setup, not a public post.
  Never make Drive originals link-public.
- Google Identity Services token model: no client secret/refresh token,
  access token in memory only; drive.file and openid/email scopes.
- Account binding prevents uploading existing data to a different Google account.
- A browser Web Lock permits one active app tab to write at a time where
  supported. Restoring a back/forward-cached tab reloads before writing.
- Each Drive backup is immutable. Explicit restore saves a local rescue first.
- Sync uses private append-only event batches with per-field causal multi-value
  registers, not device-clock last-writer-wins. Deletions are tombstones.
  Concurrent values are retained until explicit user resolution.
  Local notes and pending events commit atomically in IndexedDB before upload.
  Failed uploads remain queued; replay is idempotent. No broader Drive scope,
  public sharing, persisted token or always-running server is introduced.
- Parameterized SQLite queries in a Worker; two-database LRU, query_only enabled.
  File signature/schema, size, notes structure and prototype keys are validated.
- CSP restricts scripts to self and official Google Identity/Picker. No analytics.
  sql.js is vendored; no SQL runtime CDN dependency.
- Service-worker caching is public-asset allowlisted and same-origin only.
  Google requests bypass it entirely. Untrusted content is rendered as text.
- Residual risks: XSS, compromised publishing access/dependencies/extensions,
  shared unlocked devices and browser eviction. Enable Google/GitHub 2FA.
  Origin-shared storage is not encrypted against an unlocked device's users.
- App settings use a dedicated prefix; device deletion does not clear other
  GitHub Pages apps' localStorage. Same-origin apps still share a trust boundary.
- Do not store sensitive pastoral/medical records on a shared device.
- Build does not publish. Review artifacts, permissions and scopes first.
