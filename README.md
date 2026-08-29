# RollCall

RollCall is a mobile-first, communal sushi combo builder. A room owner shares one private link and everyone edits the same order until the combo total is exact.

## Run locally

```bash
npm install
npm run dev
```

Without Supabase environment variables, the app runs in local prototype mode. It supports the complete builder flow in one browser and stores prototype rooms in local storage.

## Connect Supabase

1. Create a separate Supabase organization and project for RollCall. Do not use the Wadi Sports Camp organization.
2. Apply `supabase/migrations/20260829000000_create_rollcall.sql` to that project.
3. Enable Anonymous Sign-Ins and add `rooms` and `order_items` to the `supabase_realtime` publication.
4. Copy `.env.example` to `.env.local` and `.dev.vars.example` to `.dev.vars`, then add the new project values.
5. Configure a Cloudflare Turnstile widget in the Supabase Auth CAPTCHA settings and add its public site key to `VITE_TURNSTILE_SITE_KEY`.

The Worker needs `SUPABASE_SECRET_KEY` as a Cloudflare secret on deployment. It is never included in the browser bundle.
