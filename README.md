# Fireflies Meet Reminder

A small internal Chrome/Firefox extension that gives a friendly nudge inside
Google Meet if the Fireflies.ai notetaker hasn't joined the call, with a
"Mute for this meeting" option, plus a quick-notes widget for jotting down
moments worth remembering without having to re-read the whole transcript
later. No backend, no Fireflies API, no build step — plain JS/CSS/HTML
loaded as an unpacked extension.

## Install (per teammate)

### Chrome

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

### Firefox

Requires **Firefox 127 or later** — below that, Firefox doesn't grant the
Meet/Fireflies page access this extension needs at install time, so it loads
but silently does nothing.

1. Get the code the same way as above (Download ZIP or `git clone`, then
   unzip).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the **`manifest.json` file
   itself** (not the folder — Firefox's picker differs from Chrome's here).
4. Join a Google Meet call.

A temporary add-on is **cleared every time Firefox restarts** — you'll need
to repeat step 2–3 after each restart. For a permanent install, ask whoever
maintains this extension for a signed `.xpi` (see
[Signing and distribution](#signing-and-distribution-firefox)) and install
that via `about:addons` → the gear menu → **Install Add-on From File…**
instead.

**If the extension appears to do nothing** (no banner, no 📝 button): open
`about:addons`, click this extension, go to **Permissions**, and enable
*"Access your data for meet.google.com"* (and for `app.fireflies.ai` if you
use the linked-notes panel), then reload the tab. Firefox lets you revoke
this permission at any time even after granting it, so if the extension
stops working later, check here first.

**Keyboard shortcut**: if **Ctrl+Shift+F** (same combo on Mac — the physical
Control key, not Command, so it doesn't collide with the default Cmd+Shift+F
used on Chrome/Mac) doesn't flag a moment, another add-on or the browser
itself may already own that combination — Firefox gives no warning when this
happens. Go to `about:addons` → gear icon → **Manage Extension Shortcuts**
to rebind it; this persists across restarts even though the extension
itself isn't permanently installed.

## How it works

- Runs only on `meet.google.com`.
- After joining a call, waits a 1-minute grace period, then checks whether
  any visible participant's name contains "Fireflies". If not, it shows a
  banner in the call; it repeats every 5 minutes until Fireflies joins, the
  call ends, or you click "Mute for this meeting" (which silences it only
  for that specific call).
- Detection is done by reading names already visible on screen — normally
  it never opens Meet's People panel on your behalf.
- **Auto-admits Fireflies**: if Fireflies shows up in Meet's "waiting to
  join" / "With potential risks" queue, the extension clicks the "N
  guest(s) waiting" pill (confirmed necessary — the pending row doesn't
  behave until that's opened), opens that row's "More actions" menu, then
  clicks "Admit" for it — no one has to remember to let it in. This is the
  one place the extension clicks anything on your behalf, and it's scoped
  tightly to entries whose name contains "fireflies" (never touches "Deny"
  or any other pending participant). **Trade-off**: this bypasses Meet's
  own bot-safety confirmation step for anything matching that name — set
  `AUTO_ADMIT_FIREFLIES` to `false` in
  [`src/common/constants.js`](src/common/constants.js) to require manual
  admission instead.
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
- **Flag a moment instantly**: press **Ctrl+Shift+F** (same combo on Mac —
  physical Control key, not Command) anytime during a call to save a
  timestamped placeholder note with zero
  UI — no modal, no typing, just a quick flash on the 📝 button so you know
  it landed. Fill in the details later by clicking on that note's text
  (in the modal or the toolbar popup) to edit it in place. Customize the
  shortcut anytime at `chrome://extensions/shortcuts` (Chrome) or
  `about:addons` → gear icon → **Manage Extension Shortcuts** (Firefox).
- Notes are private to your own browser (saved locally, not shared with
  other participants or synced anywhere).
- To review notes after the call ends, click the extension's icon in the
  toolbar — it lists notes from your recent meetings (most recent
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

## Cross-browser notes

- One `manifest.json` serves both browsers — there is no separate Firefox
  build or branch. Loading it in Chrome may show one or two cosmetic
  `Unrecognized manifest key` warnings on the extensions page (for
  `browser_specific_settings` and possibly `background.scripts`); these are
  expected and harmless, not a sign anything is broken.
- `src/background/service-worker.js` keeps its filename even though Firefox
  runs it as a non-persistent **event page** rather than a service worker —
  Firefox doesn't implement background service workers, but the same file
  works unchanged in both because the manifest's `background` key lists it
  under both `service_worker` (Chrome) and `scripts` (Firefox).
- **macOS shortcut changed** as of this Firefox port: it's now
  **Ctrl+Shift+F** (the physical Control key) instead of the previous
  **Command+Shift+F**, in *both* Chrome and Firefox — this manifest is
  shared between the two, so the change applies everywhere at once. This
  was chosen over Command+Shift+F because `"Ctrl"` in the manifest maps to
  Command on macOS, which is why the shortcut needed the distinct
  `"MacCtrl"` modifier to avoid colliding with the same combo Firefox
  already reserves for other things. **If you're on a Mac and used
  Cmd+Shift+F before, retrain to Ctrl+Shift+F** (or rebind it back at
  `about:addons` / `chrome://extensions/shortcuts` if you'd rather keep
  Cmd+Shift+F).

### Signing and distribution (Firefox)

A permanent (non-temporary) Firefox install needs a **signed `.xpi`**, built
with [`web-ext`](https://github.com/mozilla/web-ext) via `npx` (no
dependency is added to this repo for it):

```
npx web-ext lint
npx web-ext sign --channel=unlisted --api-key=<AMO_API_KEY> --api-secret=<AMO_API_SECRET>
```

- `--channel=unlisted` produces a signed `.xpi` that installs permanently on
  release Firefox and can be shared internally without publishing to
  addons.mozilla.org.
- **Bump `version` in `manifest.json` before every signing run** — AMO
  rejects re-signing a version it has already seen.
- This extension has no auto-update mechanism configured (that would need
  `gecko.update_url` plus a self-hosted update manifest), so distribute new
  signed builds the same way you'd distribute a new ZIP for Chrome.

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
