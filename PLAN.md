# RollCall Communal Sushi Prototype

## Summary

Build a mobile-first functional prototype for one communal sushi combo. Everyone with the private link edits the same shared item list in real time. There are no participant names, personal allocations, or cost splitting.

The prototype will use a neutral temporary interface. The final UI and branding will be applied later without changing the product logic.

## Implementation

- Scaffold a TypeScript React/Vite SPA with a Hono API on Cloudflare Workers, following Cloudflare’s current [React SPA + Worker pattern](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/).
- Create three simple views:
  - Start a room: restaurant name and preset/custom combo size.
  - Communal builder: shared items, quick counts `1`, `2`, `4`, `8`, custom quantity, live progress, copy/share link.
  - Final order: locked restaurant-ready item summary with copy-to-clipboard.
- Merge repeated item names case-insensitively. Support rename, increase, decrease, remove, under/exact/over states, and block finalization unless the total is exact.
- Only the room creator can finalize. Everyone with the link can edit while the room is open.
- Rooms expire exactly 24 hours after creation. Access stops at expiry; a scheduled Cloudflare Worker deletes expired data afterward.
- Remember recent item names per restaurant in local browser storage for faster entry, without creating public restaurant history.
- Keep the temporary UI semantic and token-based so the supplied design can later replace typography, spacing, colors, and component styling cleanly.

## Supabase and Interfaces

- Create a completely separate Supabase organization/project—not the connected Wadi Sports Camp organization. Project creation will require the new organization to be connected and its cost confirmed first.
- Use anonymous Supabase Auth, Cloudflare Turnstile abuse protection, RLS on every exposed table, and Supabase Realtime for live room updates.
- Store:
  - `rooms`: restaurant, combo target, status, creator, timestamps, expiry.
  - `room_members`: anonymous user membership and host role.
  - `order_items`: communal item name, normalized name, piece count, and ordering.
  - Private invite-token hashes in an unexposed schema.
- Share rooms as `/r/{slug}#token={secret}`. The Cloudflare Worker validates the secret and grants the anonymous user room membership; secrets and Supabase privileged keys never reach the public client.
- Public Worker endpoints:
  - `POST /api/rooms`
  - `POST /api/rooms/:slug/join`
- RLS-protected database functions perform atomic communal edits:
  - `add_or_increment_item`
  - `change_item_count`
  - `rename_item`
  - `remove_item`
  - `finalize_room`
- Realtime subscriptions refresh the shared room snapshot after changes, using Supabase’s documented [Realtime](https://supabase.com/docs/guides/realtime/getting_started) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) patterns.

## Test Plan

- Validate restaurant names, preset/custom combo sizes, item names, and positive safe whole-number quantities.
- Confirm duplicate names merge despite case or surrounding whitespace.
- Test under, exact, and over totals; finalization succeeds only when exact.
- Use two browser sessions to verify live additions, simultaneous increments without lost updates, renames, removals, and final locking.
- Verify non-members cannot read or edit rooms, invalid links fail, members cannot access other rooms, and non-hosts cannot finalize.
- Verify rooms become inaccessible after 24 hours and scheduled cleanup cascades through memberships and items.
- Run unit tests, Worker API tests, database/RLS tests, production build, and mobile browser flow checks before handoff.

## Assumptions

- “RollCall” remains the working name.
- English-only prototype; Arabic and RTL remain ready for a later phase.
- Pieces only—no pricing.
- No public history, accounts, participant tracking, restaurant-managed menus, or WSC branding/data.
- The prototype is locally verified first; deployment is separate unless explicitly requested.
