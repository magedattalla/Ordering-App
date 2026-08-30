# Order — Implementation Status and Next Phase

## Completed locally

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
- Unit tests and two-tab browser verification

## Deferred until product review

1. Apply the standalone Supabase v2 migration to project `qhdsbfsyxdzadlmksvkp`.
2. Enable anonymous authentication, confirm RLS and Realtime behavior, and run database/security advisors.
3. Configure Cloudflare Turnstile and Worker secrets.
4. Deploy an `order-preview` Worker in Cloudflare account `920c5240424581f9e0662ecbd8fef971`.
5. Run a real multi-device test against preview.
6. Promote the identical verified build to `order.magedvibecode.workers.dev`.

## Deployment guardrails

- Do not modify or delete the existing deployed `rollcall` Worker during the new release.
- Do not access or change any WSC account, app, domain, data, or configuration.
- Do not commit environment files or private keys.
- The public client cannot enable priced menus or bill splitting.

## Verification before production

- Type check, unit tests, build, and Worker dry run
- Database/RLS tests for outsider, member, owner, host, removed-member, status, expiry, and 100-person limits
- Three isolated browser sessions with concurrent edits and Realtime refresh
- Host moderation, transfer, close/reopen/place, and both summary modes
- iPhone/Android installation, safe areas, keyboard behavior, accessibility, offline state, and mobile performance
