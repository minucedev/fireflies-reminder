# Fireflies Meet Reminder

A small internal Chrome extension that gives a friendly nudge inside Google
Meet if the Fireflies.ai notetaker hasn't joined the call, with a
"Mute for this meeting" option. No backend, no Fireflies API, no build step —
plain JS/CSS loaded as an unpacked extension.

## Install (per teammate)

1. Download/clone this folder onto your machine.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Join a Google Meet call — that's it, no configuration needed.

This extension does **not** auto-update. When it changes, pull the latest
folder and click the reload icon on its card in `chrome://extensions`.

If your organization manages Chrome centrally, developer mode / unpacked
extensions may be blocked by policy — check with IT before rolling this out
to the whole team.

## How it works

- Runs only on `meet.google.com`.
- After joining a call, waits a 2-minute grace period, then checks whether
  any visible participant's name contains "Fireflies". If not, it shows a
  banner in the call; it repeats every 5 minutes until Fireflies joins, the
  call ends, or you click "Mute for this meeting" (which silences it only
  for that specific call).
- Detection is done by reading names already visible on screen — it never
  opens Meet's People panel or clicks anything on your behalf.

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

## Known limitations

- English-only banner copy for now.
- No options page yet — settings are hardcoded constants (see above).
- If a large call collapses extra participants into an overflow group,
  Fireflies' name might not be visible on-screen even though it has joined;
  the fix would be to have the extension briefly open the People panel as a
  last resort, which was intentionally left out of v1 to avoid changing the
  user's UI uninvited.
