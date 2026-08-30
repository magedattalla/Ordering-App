# Order — Product Brief

## Product

Order is a mobile-first group-ordering tool for food and drinks. A host starts one order for one vendor, shares a private link or QR code, and everyone adds their own or shared items to the same live order.

“Order” is a temporary working label. Naming, logo, colors, and production domain must remain replaceable.

## Problem

Group orders are usually coordinated in a chat. Items get buried, modifications are missed, people forget to respond, and one person manually rewrites everything for the restaurant. Order replaces that thread with one structured, restaurant-ready source of truth.

## Core experience

1. The host enters a nickname, vendor, optional order title, and optional deadline.
2. The host shares a private link or QR code.
3. Each participant joins with a temporary unique nickname. No account is required.
4. People add items with quantity, freeform additions/removals/instructions, and one or more assigned participants.
5. People mark themselves done. Editing their order clears that state.
6. The host closes the order for review, may reopen it, then permanently marks it placed.
7. The final summary can be read by person or grouped for the restaurant.

## Rules

- Food and drinks only; one vendor per order.
- Rooms accept at most 100 active participants.
- Items default to their creator. Shared items can be assigned to selected people or everyone currently present.
- Item owners and the host can edit or remove an item.
- The host can rename/remove people, reassign their items, transfer host control, close, reopen, and place.
- `open` allows editing. `closed` pauses participant editing. `placed` is permanently read-only.
- Deadlines warn but never change room status automatically.
- Access ends exactly 24 hours after creation.
- Recent vendors, items, and instructions stay in browser storage only.

## Summaries

- Person view lists every participant and the lines assigned to them.
- Restaurant view combines only lines with the same normalized item name, instructions, and structured options.
- Both views support plain-text copying.

## Future priced menus

The data model can hold trusted menu item references, variants, modifiers, currency, and prices. Pricing and bill splitting remain hidden unless a server-controlled `pricedMenu` capability is enabled by a trusted menu provider. Users cannot enter prices manually.

When active, shared lines divide equally, tax/tip/fees/discounts allocate proportionally, and integer minor-unit calculations use deterministic remainder allocation so every participant total matches the bill exactly.

## Out of scope

- Direct restaurant submission
- Checkout or payment collection
- Permanent accounts or server-side order history
- Public room discovery
- Chat or push notifications
- More than one vendor in a room

## Current status

The functional v2 PWA is deployed at `https://order.magedvibecode.workers.dev`. The additive Supabase schema, anonymous sessions, RLS, private invite flow, Turnstile, encrypted Worker secrets, scheduled expiry cleanup, and multi-device synchronization are active. The production share flow has been verified with isolated host and guest browser sessions.
