# Trading Simulation Live Dashboard

A real-time classroom trading game dashboard with two interfaces:

- Public board (`/`) for students: live prices, team rankings, score cards, buzzer overlay.
- Admin panel (`/admin`) for teacher/trader: manage teams, shape prices, batch sales, announcements, buzzer, and resets.

## Features

- Handles changing team counts each year (10-20+ teams is fine).
- Live updates using Socket.IO.
- Manual team cash adjustments.
- Batch sale entry with accepted/rejected quantities.
- Price changes reflected immediately.
- Buzzer stop/resume controls.
- Team bulk import from `.csv`, `.xls`, or `.xlsx` in admin.
- Team portal mode for iPads: tap team card, login with team PIN, view assets and deposit/withdraw.
- Dedicated country cards screen for iPads at `/countries`.
- Banker approval panel (`/banker`) for approving/rejecting team deposit/withdraw requests.
- Data persisted in `data/state.json`.

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Set an admin password and run:

```bash
ADMIN_PASSWORD="choose-a-strong-password" npm start
```

3. Open:

- Public: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`

You can also double-click `start-trading-sim.command` to launch the server and open both pages in Chrome.

## Deploy to Render

This project includes `render.yaml`.

1. Push folder to GitHub.
2. In Render, create a new Blueprint service from repo.
3. Set environment variable:
   - `ADMIN_PASSWORD` = your password.
4. Deploy.

## Notes

- If no team image URL is provided, the dashboard shows team initials.
- Admin auth is a simple shared password sent in request headers. For school use this is usually enough, but do not share the admin URL/password with students.
- If `ADMIN_PASSWORD` is not set, the app fallback password is `Alpha1234*`.
- Team import columns: use `name` or `team` (required), and optionally `flagUrl`/`flag`/`image`.
- Team PINs can be set manually when creating/editing teams, or auto-generated if left blank.
- Banker login uses `BANKER_PASSWORD` (fallback: `Banker1234*`).
