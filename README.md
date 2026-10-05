# TradeTable

## Supabase and Discord setup

The app uses Supabase Auth for Discord sign-in and Supabase Postgres for trade nights, memberships, and card lists. It does not create an app profile table. Supabase Auth still keeps the provider identity needed to associate a sign-in with its data.

1. In the Supabase SQL Editor, run [`supabase/migrations/20261005000000_trade_nights.sql`](supabase/migrations/20261005000000_trade_nights.sql).
2. In **Authentication → Providers → Discord**, enable Discord and enter the Discord application client ID and secret. Add the callback URL shown by Supabase to the Discord application's OAuth2 redirect URLs.
3. In **Authentication → URL Configuration**, add local and deployed app URLs to the allowed redirect URLs (for example, `http://localhost:3000/**` and `https://your-app.vercel.app/**`).
4. The Supabase project URL and publishable key are in `.env.local` for local development. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Vercel project's environment variables for each deployment environment.

Discord OAuth is requested with the `identify` scope. The app stores only Supabase user IDs on its trade-night and card-list rows; invite tokens are stored hashed in Postgres. Event members can see the event and all member card lists, while each member can change only their own card rows. The event owner controls event details.

Existing browser-only demo lists are not imported automatically. The database migration must be applied before the app can create or load nights.
