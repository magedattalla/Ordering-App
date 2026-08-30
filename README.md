# Order — local group-ordering prototype

Order is a mobile-first group-ordering PWA for food and drinks. A host starts one private order, shares its link or QR code, and everyone adds personal or shared items in real time.

The temporary name and visual branding are isolated so they can be replaced later.

## Run the local prototype

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. With no Supabase variables, the app automatically uses local prototype mode.

The local prototype includes:

- Host nickname, vendor, optional title, and optional deadline
- Private share link and QR code
- Personal and shared items with quantity and instructions
- Live multi-tab updates through browser storage
- Readiness, participant management, and host transfer
- Open, closed, reopened, and permanently placed states
- Restaurant and per-person summaries
- Local recents, offline locking, and installable PWA assets

Local mode is deliberately browser-only. Sharing works between tabs in the same browser profile. True multi-device sharing starts when the reviewed prototype is connected to the additive Supabase v2 schema.

## Verify

```bash
npm run check
npm test
npm run build
```

## Deferred connection phase

The additive migration is in `supabase/migrations/20260830003000_create_group_orders_v2.sql`. Do not apply it until the local prototype has been reviewed. The legacy RollCall migration and deployed Worker remain untouched.
