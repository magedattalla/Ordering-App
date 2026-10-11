# Almaz Special Edition — October 11, 2026

## Goal

Run a one-day Almaz edition of the Order PWA. Hosts start an Almaz order without entering a vendor, and participants choose food from a searchable, categorized menu rather than typing freeform item names.

## Decisions

- The edition is active only on October 11, 2026 in the `Africa/Cairo` timezone.
- New orders created during the edition use the vendor name `Almaz`.
- Existing Almaz rooms keep the searchable menu for their full 24-hour lifetime, even after the edition date ends.
- Existing non-Almaz rooms keep the normal freeform item field.
- Menu prices are reference-only. They are not persisted, totaled, allocated, or included in copied summaries.
- Quantity, instructions, participant assignments, readiness, room status, sharing, and summaries remain unchanged.
- Box contents are shown as menu descriptions. Participants enter their specific choices in the existing instructions field.
- The implementation is client-side and does not change the Supabase schema, Worker API, RLS, or room payloads.

## Interface

The start screen uses Almaz special-edition copy and replaces the vendor input with a fixed Almaz card. In an Almaz room, the item field opens a grouped menu containing Breakfast, Sandwiches, Salads, Boxes, Hawawshi, Pasta, Desserts, and Drinks. Typing filters item names, categories, and descriptions. Each result shows its price in EGP. Selecting a result fills the existing order-line item name and closes the picker.

## Verification

- Test the Cairo date gate before, during, and after October 11.
- Test menu search by item, category, and description.
- Confirm Almaz orders require a menu selection and non-Almaz orders still accept freeform items.
- Run TypeScript checks, unit tests, the production build, and the Cloudflare deployment dry-run before preview and production deployment.
