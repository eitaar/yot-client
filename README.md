# yot-client

A mobile client for [yot](https://github.com/eitaar/yot), the self-hosted calendar
server. Built with Expo (React Native + web from one codebase).

The calendar is for **reading**. Events are created and managed by an agent
elsewhere — over MCP, from your chats and mail — and this app is where you see
the result.

## Screens

- **Calendar** — a proportional day timeline: each event is a capsule whose
  filled dot is its exact start, whose length is its duration, and whose hollow
  ring is its end. Overlapping events split into lanes; a live NOW line tracks
  the clock; all-day entries sit above the grid. Pull the handle (or swipe) for
  the month grid.
- **Upcoming** — events grouped by day.
- **Feed** — a visual browse of what's ahead, in one of four layouts.
- **Ask** — a local, disposable query view over your schedule (no history, no
  network call).
- **Tracking** — release/banner countdowns. Currently local demo data.
- **Settings** — display preferences, and disconnecting revokes this device's
  key on the server.

## Setup

```bash
npm install
npx expo start          # then press w / i / a
```

You need a reachable yot server. Generate a pairing PIN on it:

```bash
yot auth                # prints a 6-digit PIN, valid 5 minutes
```

Then in the app: enter the server address (e.g. `cal.example.com` or
`192.168.1.10:4010`), wait for the green check, and enter the PIN. The app
exchanges it for an API key via `POST /api/auth/pair` and stores it in the OS
keychain (`expo-secure-store`; AsyncStorage on web). Every request after that
carries `Authorization: Bearer`.

Updates arrive live over SSE (`GET /api/stream`); pull down on any list to sync
manually. The last sync is cached, so the app opens with your schedule offline.

## Scripts

```bash
npm test                        # jest
TZ=Asia/Tokyo npm test          # the suite is pinned to UTC but must pass anywhere
npx tsc --noEmit                # types
npx expo export --platform web  # static web build
```

## Layout

```
app/          expo-router routes (tabs, onboarding, detail, settings)
src/api/      yot REST client, SSE stream, session storage
src/store/    zustand stores (events, settings, tracking)
src/lib/      pure logic — timeline layout, date formatting, ask engine
src/components/, src/theme/
```

The timeline geometry lives in `src/lib/layoutDay.ts` as a pure function:
events in, positioned blocks out. It carries the heaviest test coverage in the
repo.

## Status

Verified: types clean, 371 tests passing (UTC / Asia/Tokyo / America/New_York),
web export succeeds, and an end-to-end run against a live `yot-server` covering
pairing, timeline geometry, an edit round-trip, live SSE updates, and key
revocation on disconnect.

Known gaps, in rough priority order:

- **Not yet run on a physical device.** Verification so far is web-only. The
  pull-to-sync pan previously stole scroll-up drags from the ScrollView (its
  `simultaneousWithExternalGesture` registration resolves to a no-op — RNGH
  drops refs without a `handlerTag`); the pan is now gated on the top-of-list
  position, but scrolling still deserves a device pass.
- On iOS the number-pad keyboard can cover the PIN screen's confirm button.
- Failed saves and deletes roll back silently — there is no error surface yet,
  and delete navigates back even when it failed.
- A `read`-scoped key still shows Edit and Delete; those requests will 403.
- Event cover images do not load on the web build (headers cannot be attached
  to `<img>`), and there is no fallback to the placeholder.
- Tracking data is local, not server-backed. Agent toggles in Settings persist
  but do nothing yet.
