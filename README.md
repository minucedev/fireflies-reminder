# Fireflies Meet Reminder

A small internal Chrome extension that gives a friendly nudge inside Google
Meet if the Fireflies.ai notetaker hasn't joined the call, with a
"Mute for this meeting" option, plus a quick-notes widget for jotting down
moments worth remembering without having to re-read the whole transcript
later. No backend, no Fireflies API, no build step — plain JS/CSS/HTML
loaded as an unpacked extension.

## Install (per teammate)

1. Go to this repo on GitHub → green **Code** button → **Download ZIP**
   (or `git clone` it if you prefer). Unzip it somewhere on your machine.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder (the one that
   directly contains `manifest.json`).
5. Join a Google Meet call — that's it, no configuration needed.

This extension does **not** auto-update. When it changes, pull the latest
`main` (or download the ZIP again), replace your local folder's contents,
and click the reload icon (⟳) on its card in `chrome://extensions`.

If your organization manages Chrome centrally, developer mode / unpacked
extensions may be blocked by policy — check with IT before rolling this out
to the whole team.

## How it works

- Runs only on `meet.google.com`.
- After joining a call, waits a 1-minute grace period, then checks whether
  any visible participant's name contains "Fireflies". If not, it shows a
  banner in the call; it repeats every 5 minutes until Fireflies joins, the
  call ends, or you click "Mute for this meeting" (which silences it only
  for that specific call).
- Detection is done by reading names already visible on screen — it never
  opens Meet's People panel or clicks anything on your behalf.
- Once Fireflies is actually admitted into the meeting (not just invited/
  waiting), a brief green confirmation badge appears and auto-dismisses.

## Quick notes

- A small dark round button (styled to match Meet's own controls) docks
  just to the left of Meet's mic/camera/leave row. If Meet's control bar
  can't be located for some reason, it falls back to the bottom-right
  corner instead of disappearing. Click it to open a centered notes window
  (Escape, clicking outside it, or the ✕ all close it), type a quick note,
  hit Enter — it's saved instantly, tagged with the elapsed time since you
  joined the call (e.g. `12:34`), so you can jump straight to that moment
  in the Fireflies recording/transcript later instead of re-reading the
  whole thing.
- **Export .txt / Export .md** in that same window download the current
  meeting's notes as a file (`fireflies-notes-<meeting-code>-<date>.txt`
  or `.md`), including the meeting link and date.
- Notes are private to your own browser (saved locally, not shared with
  other participants or synced anywhere).
- To review notes after the call ends, click the extension's icon in the
  Chrome toolbar — it lists notes from your recent meetings (most recent
  first) with **Copy / TXT / MD** actions per meeting. Only the last 20
  meetings with notes are kept; older ones are cleaned up automatically.

## Linked notes on the Fireflies app

- On any `app.fireflies.ai` meeting page, the same small round button
  opens a panel showing the quick notes captured during the matching
  Google Meet call — so you don't have to re-read the whole transcript to
  find what you flagged live.
- The match is **manual-first**: the extension tries to auto-detect the
  original Meet link on the page, but if it can't (we haven't confirmed
  Fireflies always exposes it), you'll see a picker listing your locally
  stored meetings — click the right one once and it's remembered for that
  Fireflies page from then on. Use "Not the right meeting? Change" in the
  panel to re-pick if needed.
- Same Export .txt/.md as the in-call modal and toolbar popup.

## Tuning / maintenance

- Grace period, repeat interval, and the Fireflies name match are in
  [`src/common/constants.js`](src/common/constants.js) — change and reload
  the extension to take effect.
- All raw Google Meet DOM selectors live in a single file,
  [`src/content/meet-selectors.js`](src/content/meet-selectors.js). Google
  changes Meet's markup without notice; if the reminder stops
  detecting Fireflies or the call state, this is the file to fix. Every
  lookup there fails safe (returns nothing) and logs a single
  `console.warn` instead of throwing, so a broken selector can't crash the
  Meet tab itself — check the DevTools console on the Meet tab for
  `[fireflies-reminder]` warnings as a starting point.
- Likewise, all raw Fireflies-app DOM queries live in
  [`src/content/fireflies-selectors.js`](src/content/fireflies-selectors.js)
  — currently just a best-effort scan for a Google Meet link on the page.

## Known limitations

- English-only banner copy for now.
- No options page yet — settings are hardcoded constants (see above).
- Quick notes are stored per meeting code, so re-joining the same recurring
  Meet link later appends to the same note list rather than starting fresh.
- If a large call collapses extra participants into an overflow group,
  Fireflies' name might not be visible on-screen even though it has joined;
  the fix would be to have the extension briefly open the People panel as a
  last resort, which was intentionally left out of v1 to avoid changing the
  user's UI uninvited.
