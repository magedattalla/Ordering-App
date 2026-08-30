# Order — Implementation and Deployment Status

## Completed

- React/Vite TypeScript PWA with a Cloudflare Worker entrypoint
- Full group-ordering domain model and validation
- Local browser gateway using `localStorage`, `sessionStorage`, and `BroadcastChannel`
- Host start flow and nickname-based join flow
- Personal/shared lines, quantity, instructions, participant assignments, edits, and deletion
- Readiness and automatic readiness reset after edits
- Participant rename/removal/reassignment and single-host transfer
- Open, closed, reopened, and permanently placed states
- Restaurant and per-person summaries
- Native share, link copy, and QR code
- Local recents, offline lock, safe areas, icons, manifest, and static-shell service worker
- Unit tests, local two-tab verification, and production multi-device verification
- Additive Supabase v2 schema with RLS, private RPCs, Realtime publication, and 24-hour cleanup
- Anonymous Supabase sessions and private invite-token joins
- Cloudflare Turnstile on room creation and joining
- Encrypted Worker secrets for Supabase and Turnstile
- Preview deployment at `https://order-preview.magedvibecode.workers.dev`
- Production deployment at `https://order.magedvibecode.workers.dev`
- Realtime subscriptions with a three-second consistency refresh when events are delayed

## Verified release flow

1. Applied the standalone Supabase v2 migration to project `qhdsbfsyxdzadlmksvkp` alongside the untouched legacy schema.
2. Verified five exposed v2 tables have RLS, thirteen v2 functions exist, and four tables are in the Realtime publication.
3. Created a hostname-restricted Turnstile widget and stored both server secrets in Cloudflare.
4. Deployed and tested `order-preview` in two isolated browser sessions.
5. Promoted the identical verified build to production and repeated the public create, share, join, add-item, and cross-device refresh flow.

## Deployment guardrails

- Do not modify or delete the existing deployed `rollcall` Worker during the new release.
- Do not access or change any WSC account, app, domain, data, or configuration.
- Do not commit environment files or private keys.
- The public client cannot enable priced menus or bill splitting.

## Remaining release hardening

- Expand automated database/RLS tests for outsider, removed-member, expiry, and 100-person limits.
- Add automated browser coverage for host transfer, permanent placement, and summary copying.
- Complete physical iPhone/Android install, keyboard, accessibility, and mobile performance checks.
