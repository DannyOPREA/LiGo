---
paths:
  - "lila/app/controllers/**"
  - "lila/conf/**"
  - "lila/modules/security/**"
  - "lila/modules/oauth/**"
  - "lila/modules/api/**"
  - "lila-ws/src/main/scala/**"
---
# Security rules
- Keep lila's CSRF protection, auth checks (`Auth`, `Secure`, scopes) and rate limits on every
  endpoint you add or change; copy the pattern from a neighbouring endpoint.
- Never log secrets, tokens, passwords, emails or IPs.
- No secrets in the repo; config secrets come from the environment.
- Security-sensitive choices are major decisions: ask the owner. Run /security-review on the diff.
