# RollCall Continuation Handoff

## Objective

Finish and verify RollCall: a mobile-first, communal sushi-combo app. People with a private room link edit one shared order in real time. There are no participant names, allocations, pricing, or cost splits. The final visual direction is rounded, Apple/iOS-like UI — this deliberately overrides the earlier supplied flat design system.

## Completed and Verified

- Built the React/Vite app plus Hono Cloudflare Worker: room creation, shared builder, locked final order, exact/under/over totals, merge-on-normalized-name, recents, link/order copy, and 24-hour expiry.
- Local fallback works through `localStorage` and `BroadcastChannel`; remote implementation is in place through Supabase + Worker.
- Created a separate Supabase org/project; it is not linked to WSC:
  - Org: `Maged's Vibe Code Projects` (`mamwqjxkscexmuznuxlr`), Free plan.
  - Project: `RollCall` (`qhdsbfsyxdzadlmksvkp`), URL `https://qhdsbfsyxdzadlmksvkp.supabase.co`.
- In the Supabase dashboard, ran `supabase/migrations/20260829000000_create_rollcall.sql` successfully (`Success. No rows returned`). It creates RLS-protected rooms/members/items, private invite hashes, atomic RPCs, realtime publication, and expiry cleanup.
- Enabled Supabase Anonymous Sign-Ins.
- Configured public URL/key in `wrangler.jsonc` and `.env.production`; no private key is in the repo/bundle.
- Uploaded `SUPABASE_SECRET_KEY` to the encrypted Cloudflare Worker secret store in the separate RollCall Cloudflare account.
- Cloudflare is now separate from WSC. Named Wrangler profile `rollcall` is bound only to this project folder and authenticated as `maged@popcornproductions.co`, account ID `920c5240424581f9e0662ecbd8fef971`. `wrangler.jsonc` explicitly locks deployment to that account.
- Fully deployed public Worker `rollcall` to the separate account. Live URL: `https://rollcall.magedvibecode.workers.dev`. Latest version ID: `2e13eebd-e4a3-48b3-a3be-b797661b600b`. Scheduled cleanup cron: minute 17 of every hour.
- Latest local verification all passed: `npm run check`, `npm test` (1 file, 8 assertions), `npm run cf:types`, and `npm run build`.
- Live remote sharing test passed through `wrangler dev --remote` on 2026-08-30, using the real Supabase project and Worker implementation: two separate anonymous users were created; a host created a room and 64-character private invite; guest joined with the token; host and guest added `Salmon Nigiri` (8) and `Spicy Tuna Roll` (12) concurrently; both could read the same open room with two items totaling 20. The browser UI’s `Copy link` action also returned its visible `Copied` success state.
- Final public production verification passed on 2026-08-30 over HTTPS: `/api/health` returned `{"ok":true}` and a second two-anonymous-user test created a private 64-character invite, joined a guest, added two items concurrently, and read the same exact 20-piece room from both sessions.
- Visual polish deployed on 2026-08-30: the RollCall wordmark is now a fixed/sticky top header with the live vermilion stop; start, progress, add-item, list, and final states use one cleaner rounded iOS-like visual system. Verified against the live public URL after deployment.

## Current Architecture and Decisions

- `src/react-app/App.tsx` — product flow and client UI.
- `src/react-app/styles.css` — current rounded iOS visual system. Preserve unless user gives new UI.
- `src/react-app/lib/supabase-room-gateway.ts` — Supabase anonymous auth, Worker calls, realtime snapshot refresh.
- `src/react-app/components/TurnstileWidget.tsx` — optional CAPTCHA UI; activates only when `VITE_TURNSTILE_SITE_KEY` is present.
- `src/worker/index.ts` — privileged room APIs; verifies bearer token and keeps invite secret/service key private.
- `supabase/migrations/20260829000000_create_rollcall.sql` — source-of-truth schema/RLS/RPC migration.
- `wrangler.jsonc` — Worker config. Public Supabase URL/key are intentional. Private `SUPABASE_SECRET_KEY` exists only in Cloudflare.
- `.env.production` is build config and contains public values only.

## Remaining Deployment Work

The public deployment is complete at `https://rollcall.magedvibecode.workers.dev`. The only remaining production security configuration is Turnstile:

1. Create a Turnstile managed widget scoped to `rollcall.magedvibecode.workers.dev` (`npx wrangler turnstile widget create RollCall ...` can be used; run `--help` for current flags).
2. Add the widget secret to Supabase Auth CAPTCHA settings in Dashboard and enable CAPTCHA.
3. Add the widget site key to `.env.production` as `VITE_TURNSTILE_SITE_KEY`, rebuild, and deploy.
4. Verify anonymous sign-in/room creation in production.

## Exact Next Actions

1. Configure Turnstile as above. Do not present the app as abuse-protected before this is done.
2. Open `https://rollcall.magedvibecode.workers.dev` in two isolated browser sessions. The API-level two-user sharing test has passed; still visually confirm realtime propagation, rename/remove, and host-only finalization in two browser sessions. Confirm expiry/RLS test coverage as feasible.
3. The user originally requested `rollcall.magedvibe.workers.dev`, but the configured account subdomain is `magedvibecode`; use the currently live URL unless the user explicitly changes the account subdomain again.

## Cautions

- Never reveal or commit `SUPABASE_SECRET_KEY`. It was obtained from Supabase API Keys, stored in a Node/browser session only long enough for `wrangler secret put`, then stored encrypted by Cloudflare.
- The new Supabase org/project is separate from WSC. Do not use any WSC resource.
- The WSC Cloudflare account remains separate and untouched; run RollCall deployment commands from this project directory so the activated `rollcall` profile is selected.
- The current folder is not a Git repository.
- The recurring `rollcall-continuation-log` automation was explicitly deleted. Do not recreate it unless asked.
