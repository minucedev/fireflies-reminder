# Firefox support — investigation results and task list

Status: **in progress.** T1–T2, T4, T5b and T8 implemented (T3 was
implemented then superseded/removed by T5b). Live-tested in Firefox
(2026-09-09): P1, F2, and F4 (soak-tested twice — once pre-T5b, which failed
and drove the T5b fix, then post-T5b, which passed clean) all confirmed
working. Remaining: F1/F3/F5–F12 feature pass, Chrome regression pass, T6
macOS decision, T7 icons, T9 signing.

The verdict is that a Firefox build is worth doing and is a small job. Almost
nothing here is Chrome-specific: the whole reminder engine is page-context
`MutationObserver` + `setTimeout`, there are no alarms, notifications,
offscreen documents, audio, `chrome.scripting`, no `importScripts`, no ES
modules, no bundler, no host permissions, and no hardcoded extension ID.
Extension APIs are touched in exactly **17 places across 5 files**.

The catch is that this codebase wraps every extension call in a `try/catch`
that degrades to a safe default (empty notes, `isMuted → false`), and every
DOM selector lookup fails safe too. So on Firefox the extension will *load and
appear to run while silently doing nothing*. Every verification step below is
designed to break that silence — do not skip them, and do not trust "no errors
in the console" as a pass.

---

## 1. Findings

Each of these was verified against MDN, browser-compat-data, Bugzilla, or
Extension Workshop — not assumed.

### F-1 — `chrome.*` in Firefox is callback-only 🔴

MDN: *"the Firefox implementation of WebExtensions APIs supports `chrome` and
callbacks as well as `browser` and Promises."* Only `browser.*` returns
promises in Firefox.

Every storage call in this repo is `await chrome.storage.…`. In Firefox those
resolve to `undefined`, then `result[key]` throws, then the surrounding
`try/catch` swallows it. Result: notes never save or load, mute never sticks,
the Fireflies-page link store never persists — with no visible error.

Worst case is [`src/background/service-worker.js:25`](src/background/service-worker.js#L25):

```js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
```

Destructuring `undefined` throws *before* `sendMessage` is reached, so the
`flag-moment` shortcut is 100% broken in Firefox today, not merely degraded.

Note `chrome.runtime.onMessage.addListener` in
[`src/content/quick-notes.js:444`](src/content/quick-notes.js#L444) is the one
call that already works in both engines — it's an event registration, not a
promise-returning function.

### F-2 — Firefox does not support `background.service_worker` — but one manifest can serve both 🟢

Firefox does not implement extension background service workers
([bug 1573659](https://bugzilla.mozilla.org/show_bug.cgi?id=1573659)); it uses
non-persistent **event pages** instead. Per MDN, a single manifest may declare
both keys pointing at the same file:

```json
"background": {
  "service_worker": "src/background/service-worker.js",
  "scripts": ["src/background/service-worker.js"]
}
```

Chrome reads `service_worker`, Firefox reads `scripts`, neither warns about the
other. Firefox ≤120 refused to start the background page when `service_worker`
was present; **Firefox 121+ starts it regardless.**

The existing file works unchanged in both contexts because it never touches
`window`, `document`, or `importScripts`, and registers all its listeners
synchronously at top level — which is exactly what a wakeable event page needs.

This is what lets us keep one directory, one manifest, and no build step.

### F-3 — Firefox ≤126 does not grant content-script host permissions at install 🔴 blocking

Extension Workshop, verbatim:

> From Firefox 127, host permissions listed in `host_permissions` and
> `content_scripts` are displayed in the install prompt and granted on
> installation.

> In Firefox 126 and earlier, Manifest V3 host permissions were not granted
> during installation and were not displayed to the user.

Below Firefox 127 the extension installs and does **nothing at all**, with no
error anywhere. This — not `storage.session` or the background key — is what
sets `strict_min_version`.

Also note: *"Users can grant or revoke any host permission on an ad-hoc
basis."* So even on 127+ a user can turn our host access off, and the symptom
is again "the extension does nothing".

### F-4 — `storage.session.setAccessLevel` does not exist in Firefox 🟠

browser-compat-data for `storage.StorageArea.setAccessLevel`:

```json
"chrome":  { "version_added": "96" },
"firefox": { "version_added": false, "impl_url": "https://bugzil.la/1724754" },
"safari":  { "version_added": "17.1" }
```

[Bug 1724754](https://bugzilla.mozilla.org/show_bug.cgi?id=1724754) is still
NEW and unassigned after five years. This is the only API in
[`src/background/service-worker.js:7`](src/background/service-worker.js#L7),
and it exists solely to open `storage.session` to content scripts — which is
where "Mute for this meeting" lives
([`src/content/meeting-session.js:25,36`](src/content/meeting-session.js#L25-L36)).

Because Firefox has never implemented the *separation mechanism itself*, and
MDN's Content scripts page lists **"Everything from: `storage`"** as
content-script-available, `storage.session` is most likely ungated in Firefox
and mute will just work. **That is an inference, not a documented guarantee**
— T0 probes it, T5a proves it end to end.

`storage.session` itself is Firefox 115+.

### F-5 — A conflicting keyboard shortcut fails silently 🟠

MDN `commands`, verbatim:

> If a key combination is already used by the browser (like `"Ctrl+P"`) or by
> an existing add-on, then you can't override it. You can define it, but your
> event handler will not be called when the user presses the key combination.

No manifest warning, no console error. `Ctrl+Shift+F` looks unclaimed on
Windows/Linux Firefox. macOS needs a real check — and note that dropping the
`"mac"` override does not help, because MDN maps `"Ctrl"` → `"Command"` on
macOS, landing on the same combination.

### F-6 — AMO now requires a data-collection declaration 🟠

`browser_specific_settings.gecko.data_collection_permissions` became mandatory
for new AMO submissions on 2025-11-03 and was extended to all extensions
during H1 2026. Without it, AMO will not sign the build. `{"required":
["none"]}` is the accurate value here: no backend, no Fireflies API,
`storage.local` only.

### F-7 — Things that turned out NOT to be problems 🟢

Worth recording so nobody re-investigates them:

- **Page CSP vs. shadow-DOM `<style>` injection.** Meet has a strict CSP and
  we inject stylesheets as `style.textContent` in three places
  (`reminder-banner.js`, `quick-notes.js`, `fireflies-panel.js`).
  [Bug 1415352](https://bugzilla.mozilla.org/show_bug.cgi?id=1415352) is
  RESOLVED FIXED since Firefox 59 and covers both `style` attributes and
  `<style>` node contents for content scripts. Safe.
- **`<a download>` + `URL.createObjectURL` from a content script.** This is
  the pattern Firefox documentation actually recommends. What Firefox blocks
  is `downloads.download()` on a content-script blob URL
  ([bug 1696174](https://bugzilla.mozilla.org/show_bug.cgi?id=1696174)),
  which this code does not use.
- **`tabs.query` / `tabs.sendMessage` permissions.** Neither needs the `tabs`
  permission. Only the `url`/`title` *filters* and the `tab.url`/`tab.title`
  *fields* require it; `tab.id` is always present. Do **not** add `tabs` — in
  Firefox it produces a "Read your browsing history" install prompt for zero
  benefit.
- **`window.__fireflies` sharing across content scripts.** In Firefox a
  content script's `window` is the *page's* window via an Xray wrapper, but
  expando properties are per-sandbox and all content scripts of one extension
  in one document share one sandbox. The existing pattern holds. (P3 verifies;
  the fix if it ever breaks is mechanical — nine `})(window);` →
  `})(globalThis);`.)

---

## 2. Tasks

### T0 — Measure the platform floor before writing any code

Roughly 15 minutes, run against the **current, unmodified** extension.
Everything downstream is pointless if content scripts don't run.

- [x] `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
      select the **`manifest.json` file** (Firefox picks the manifest; Chrome
      picks the folder — a real difference for the README).
- [x] Open `https://meet.google.com/`, DevTools console:
      `typeof window.__fireflies` must be `"object"`.
      If `"undefined"`: `about:addons` → this extension → **Permissions** →
      enable *"Access your data for meet.google.com"*, reload the tab, retry.
- [x] **Write down whether that permission step was needed.** **Result
      (2026-09-09, post-T1/T2 build, real Firefox 127+ session): no manual
      permission step was needed** — the temporary add-on got content-script
      host access automatically and `window.__fireflies` was an `"object"`
      immediately. Auto-admit (QA F2) also fired with no manual click. See
      open question 4 below.
- [ ] Probe session storage from the extension's content-script sandbox
      (switch the console's JS context):
      ```js
      await browser.storage.session.set({ probe: 1 });
      await browser.storage.session.get("probe");   // {probe: 1} ⇒ ungated, T5b not needed
      ```
      A rejection, a `TypeError`, or `{}` means it is gated → T5b applies.
      Not yet run — still needed to settle open question 5 / T5a vs. T5b.

### T1 — `manifest.json`

- [ ] `version` → `1.7.0`
- [ ] `background`: add `scripts` alongside `service_worker`, same file (F-2)
- [ ] Add `browser_specific_settings.gecko`:
      - `id` — email-ish form, `^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$`. **Needs an
        internal domain, see §4.**
      - `strict_min_version: "127.0"` — this is `max(109 MV3, 115
        storage.session, 121 background page starts with service_worker
        present, 127 content_scripts granted at install)`. F-3 is the binding
        constraint.
      - `data_collection_permissions: { "required": ["none"] }` (F-6)
- [ ] `permissions`: add `clipboardWrite` for
      [`src/popup/popup.js:77`](src/popup/popup.js#L77). The click gesture in a
      `moz-extension:` context should be enough on paper, but Firefox
      extension pages have historically needed it explicitly, and that call is
      `.catch(() => {})` so a failure shows up as the 📋 button doing nothing.
      The permission carries no install warning in either browser.
- [ ] Do **not** add `tabs` or `host_permissions` (F-7). Do **not** add
      `gecko_android` — this is desktop-only in practice (toolbar popup,
      keyboard shortcut, Meet's desktop DOM).
- [ ] Keep the filename `service-worker.js` even though it is an event page in
      Firefox. Renaming is pure churn; explain it in the README instead.

### T2 — Namespace shim: 5 files, 17 call sites

Add this preamble to each module that touches an extension API, then rename
`chrome.` → `api.`:

```js
const api = globalThis.browser ?? globalThis.chrome;
```

**Resolve off `globalThis`, never `window`.** The Chrome MV3 service worker has
no `window` at all, and in a Firefox content script `window` is the *page's*
window while the extension globals live on the content-script sandbox global.

Put the full explanatory comment once in `notes-store.js` (most call sites,
first-loaded common module) and a one-line back-reference in the other four.

- [ ] [`src/background/service-worker.js`](src/background/service-worker.js) —
      `const api` at file top level (this file has no IIFE wrapper).
      Sites: L7, L15, L16, L22, L25, L27. Also drop the `chrome.` prefix from
      the comments on L1 and L19.
- [ ] [`src/common/notes-store.js`](src/common/notes-store.js) — full comment +
      `const api` after L2. Sites: L16, L33, L48, L63, L73, L89.
      (`get(null)` means "everything" in Firefox too.)
- [ ] [`src/common/fireflies-link-store.js`](src/common/fireflies-link-store.js) — L17, L27
- [ ] [`src/content/meeting-session.js`](src/content/meeting-session.js) — L25,
      L36; update the L19 comment
- [ ] [`src/content/quick-notes.js`](src/content/quick-notes.js) — L444
      (functionally a no-op, done for consistency)

Untouched: `constants.js`, `notes-export.js`, `meet-selectors.js`,
`fireflies-selectors.js`, `detector.js`, `reminder-banner.js`,
`fireflies-panel.js`, `content-script.js`, `popup.js`, `popup.html` — all pure
page-context DOM.

#### Why not a shared `src/common/browser-api.js`

Considered and rejected. It would add a hard load-order dependency to **both**
`content_scripts` js arrays **and** `popup.html`'s script tags; if it were ever
mis-ordered, bare `browser` is a `ReferenceError` — a hard crash of the whole
content script, in a codebase whose entire design is fail-safe degradation. It
would also break the invariant that
[`notes-store.js:4-5`](src/common/notes-store.js#L4-L5) and
[`notes-export.js:4-5`](src/common/notes-export.js#L4-L5) explicitly document
("Standalone on purpose … loaded both as a content script and inside the
toolbar popup page"). And the background has neither `window` nor
`__fireflies`, so sharing the file there needs either a guarded
`importScripts` or ES modules — a bigger change than the thing being shimmed.
Total saving: about four lines.

#### Why not `webextension-polyfill`

A UMD bundle that cannot be `importScripts`'d into a classic MV3 service worker
without a build step, and per Chrome's own docs it is a **no-op on Chrome
148+**. It would become this repo's first vendored dependency in exchange for
nothing.

### T3 — Capability guard in the service worker

**Superseded by T5b (2026-09-09).** The guard was implemented first, then
T5a's soak test showed the underlying `storage.session` dependency was
broken in a way the guard doesn't fix (see T5a/T5b below), so
`unlockSessionStorageForContentScripts()` — guard included — was deleted
entirely rather than kept. Left here for the record, not as a pending item.

- [x] ~~At the top of `unlockSessionStorageForContentScripts()`~~ — moot,
      the function no longer exists.

### T4 — Pin the `onMessage` contract

- [ ] Comment at [`src/content/quick-notes.js:444`](src/content/quick-notes.js#L444):
      the listener must **not** be `async`. Returning a promise tells the
      browser "I will send a response", which changes what the sender's
      `sendMessage()` promise resolves to. `flagMoment()` is fire-and-forget,
      so this listener must return `undefined` in both engines. This is a live
      footgun for whoever edits it next.

### T5a — Mute soak test (5 minutes, unavoidable)

- [x] After T2: join a real call, let the 60s grace period elapse, click
      **"Mute for this meeting"**, then **wait the full 5 minutes**. The banner
      must not come back.

This is the only test that catches F-4. `isMuted()` catches and returns
`false`, so a gated read produces **no console error at the moment anything is
visibly wrong** — the sole symptom is a banner nagging again five minutes
later.

**Result (2026-09-09):** the console showed exactly the predicted failure —
`api.storage.session is undefined`, caught by both `isMuted()` and
`setMuted()`. The banner did *not* reappear in the 5-minute window, but that
turned out to be a red herring, not proof mute was working: clicking "Mute
for this meeting" calls `clearAllTimers()` **unconditionally** in
[`content-script.js`'s `onMute`](src/content/content-script.js#L34-L38),
regardless of whether the underlying `setMuted()` write succeeded — so the
in-page timer chain stops either way. The mute state itself was never
persisted, so a page reload or `handleFirefliesGone()` re-triggering
`startNagCycle()` mid-call would have called `isMuted()` again, gotten
`false`, and resumed nagging despite the earlier click. **Verdict: F-4
confirmed, gated → T5b required**, resolving open question 5.

**Re-test after T5b (2026-09-09):** same script (grace period elapsed,
banner appeared, clicked "Mute for this meeting", waited the full 5
minutes) against the `sessionStorage` build. Console was clean — no
`[fireflies-reminder] failed to read/write mute state` warnings this time
(the sessionStorage calls don't throw) — banner did not return, and
Fireflies detection/auto-admit kept working normally alongside it. **Passes
task.md's original T5a bar.** Still open: this run didn't specifically
exercise the reload-mid-call or Fireflies-leaves-and-rejoins edge cases
called out above — worth one more pass before calling F-4 fully closed, but
not blocking.

### T5b — Mute fallback

Move mute state to the Meet tab's own `sessionStorage`, in
`meeting-session.js` only:

```js
// storage.session would be the natural home, but Firefox has never
// implemented setAccessLevel (bug 1724754) so content scripts can't rely on
// reaching it. The Meet tab's own sessionStorage has the same "in-memory, no
// manual expiry bookkeeping" property — and is actually tighter: mute dies
// with the tab rather than with the whole browser session, which is closer to
// "muted for this meeting, not forever". Kept async so callers don't change.
return Boolean(window.sessionStorage.getItem(STORAGE_MUTE_PREFIX + meetingCode));
```

- [x] Switch `isMuted` / `setMuted` to `sessionStorage`, keeping both `async`
      and keeping the existing `try/catch` → `return false` fail-safe.
- [x] Then **delete** `unlockSessionStorageForContentScripts()` and both its
      `onInstalled` / `onStartup` listeners. The background shrinks to just the
      command relay and the `storage.session` dependency leaves the project
      entirely — this is a net simplification, not a compatibility wart.
      Done 2026-09-09; `npx web-ext lint` still 0 errors / same 7 warnings
      after the change.

**Trade-off, stated plainly:** it writes one prefixed key into
`meet.google.com`'s own origin storage, where Meet's page scripts can see it.
That is a small violation of this codebase's otherwise clean separation from the
page. Given the extension already clicks buttons in Meet's UI on the user's
behalf (`admitPendingFireflies`), one prefixed marker key is proportionate.

**Rejected — `storage.local` + `mutedAt` + TTL.** Directly reintroduces what
[`meeting-session.js:19-21`](src/content/meeting-session.js#L19-L21) was
written to avoid ("without any manual expiry bookkeeping"). Needs an arbitrary
constant that is wrong for both a 20-minute standup and an all-day workshop,
makes mute survive a browser restart, and piles keys into the same area that
`getAllMeetingsWithNotes()` scans with `get(null)` — so it would owe a trim
path too. Three new problems to dodge one.

**Rejected — message the background.** Doesn't remove the dependency, just adds
a hop to it; and in Chrome the service worker can be evicted mid-call so the
background would still have to persist rather than hold state in memory. Cost:
a request/response protocol on the one API surface whose cross-engine semantics
genuinely differ (`return true` + `sendResponse` vs. returning a promise), plus
an async round-trip inside `startNagCycle()` / `tickRepeat()`.

### T6 — Decide the macOS shortcut

- [ ] Have someone on a Mac run QA F6 first.
- [ ] **Default: change nothing in the manifest; document the rebind** in the
      README (`about:addons` → gear → **Manage Extension Shortcuts**). Firefox
      has a first-class UI for this and it persists. Costs Mac users one
      15-second setup step.
- [ ] Alternative: `"mac": "MacCtrl+Shift+F"` keeps the F-for-Flag mnemonic and
      is unclaimed on macOS in both browsers — **but the manifest is shared**,
      so it silently rebinds existing Chrome/macOS users' muscle memory. Only
      do this if there are few enough Mac Chrome users to just tell them.
- [ ] Do not split the manifest over this.

### T7 — Icons (needed for AMO, not blocking)

The repo currently has **no icon files at all** and no `icons` /
`action.default_icon` keys. Chrome substitutes a generic puzzle piece; Firefox
shows a generic add-on icon in the toolbar and `about:addons`, while
[`README.md:75-76`](README.md#L75-L76) tells people to "click the extension's
icon".

- [ ] Produce PNG assets (new files, none exist yet)
- [ ] `icons` at 16 / 32 / 48 / 128, `action.default_icon` at 16 / 32.
      Firefox uses 32 for the toolbar and 48 in `about:addons` — those two
      matter most here.

### T8 — README

- [ ] New Firefox install section: `about:debugging#/runtime/this-firefox` →
      Load Temporary Add-on → pick the **`manifest.json` file**.
- [ ] Note that a temporary add-on is **cleared on every Firefox restart**, and
      that a signed `.xpi` (T9) is the permanent route.
- [ ] Document the `about:addons` → Permissions check for when the extension
      appears to do nothing (F-3).
- [ ] Document rebinding the shortcut at `about:addons` → Manage Extension
      Shortcuts.
- [ ] State the Firefox 127+ requirement and why.
- [ ] Warn that Chrome will show one or two cosmetic `Unrecognized manifest
      key` warnings (`browser_specific_settings`, possibly
      `background.scripts`) — harmless, so nobody files it as a bug.
- [ ] Fix the Chrome-only wording: [L3](README.md#L3) "A small internal
      **Chrome** extension", [L14](README.md#L14) and [L22](README.md#L22)
      `chrome://extensions`, [L72](README.md#L72)
      `chrome://extensions/shortcuts`, [L76](README.md#L76) "**Chrome**
      toolbar".

### T9 — Signing and distribution

Dev tooling via `npx` only — no dependency added to the repo:

```
npx web-ext lint
npx web-ext run
npx web-ext sign --channel=unlisted --api-key=... --api-secret=...
```

- [ ] `--channel=unlisted` returns a **signed `.xpi`** that installs
      permanently on release Firefox and can be distributed internally without
      publishing to the store.
- [ ] **Bump the version on every signing run** — AMO rejects a duplicate
      version.
- [ ] Requires `gecko.id` and `data_collection_permissions` from T1.
- [ ] Auto-update would need `gecko.update_url` plus a self-hosted update
      manifest — out of scope, but it is the reason those fields go in now.

---

## 3. QA checklist

Firefox 127+, with the Chrome build kept alongside for comparison. There is no
test runner in this repo (no `package.json`), so this is all manual.

🔴 blocking or likely broken · 🟠 silent failure mode, verify carefully ·
🟢 expected to pass

### Platform gates

| | Check | How |
|---|---|---|
| 🟢 | **P1** Content scripts run at all | Meet tab console: `typeof window.__fireflies === "object"`. If not, `about:addons` → Permissions. **Record the answer — it drives the README.** **Verified 2026-09-09: passed with no manual permission step.** |
| 🟠 | **P2** Background alive as an event page | `about:debugging` → Inspect. No `failed to set storage access level` warning (T3 suppresses it). Context should identify as an event page, not a worker. |
| 🟠 | **P3** `window.__fireflies` survives the Xray boundary | P1 proves it. If it ever fails: nine `})(window);` → `})(globalThis);`. |
| 🟢 | **P4** Stable extension ID | Reload the temporary add-on twice; notes captured before still appear in the popup. Proves `gecko.id` works. |

### Features

| | Feature | How to verify | Risk notes |
|---|---|---|---|
| 🔴 | **F1** Meet DOM selectors | Join a real call. Console free of `selector lookup failed (…)`, `isInCall()` true. | **Highest risk in the whole port, and it is not an API problem.** [`meet-selectors.js`](src/content/meet-selectors.js) was reverse-engineered against Chrome's Meet DOM, and Meet serves browser-dependent markup. `[data-participant-id]`, `[aria-label*="leave" i]`, and the control-bar ancestor walk all need independent confirmation. Every lookup fails safe and silent, so a DOM difference looks identical to a permissions problem — clear P1 first. |
| 🟢 | **F2** Auto-admit Fireflies | Invite the notetaker, watch it get admitted with no click. | Depends on the `N guests waiting` pill (matched by **exact visible text**, so locale-sensitive), the `More actions` menu, the `Admit <name>` item, and untrusted `.click()` / synthetic `Escape` reaching Meet's handlers. Three chained fragile steps. Test with `AUTO_ADMIT_FIREFLIES: false` first so it doesn't confound F1/F3. **Verified 2026-09-09: admitted automatically, no manual click needed.** |
| 🟠 | **F3** Nag cycle | Join without Fireflies. Banner at ~60s. Click "Got it, thanks". Banner returns at ~5min with **different copy** (proves `repeatIndex` rotation). | Pure `setTimeout`; ports unchanged. Real risk is upstream in F1. |
| 🟢 | **F4** Mute for this meeting | = T5a. Full 5-minute soak. | Silent by construction. Cannot be short-cut. **T5a first exposed the gap 2026-09-09 → T5b (sessionStorage) implemented → re-soaked same day, passed clean (no console warnings, banner stayed away).** Reload-mid-call / Fireflies-leaves-and-rejoins edge cases still untested but not blocking. |
| 🟠 | **F5** Quick notes modal | 📝 docks left of Meet's control bar — bottom-right corner means `getControlBarRect()` returned null, which is an F1 problem, not an F5 one. Add / inline-edit / delete, Escape closes, click-outside closes, ✕ closes. | Shadow DOM + inline `<style>` is safe (F-7). Watch the `requestAnimationFrame` → `input.focus()`: Meet steals focus aggressively and Firefox's shadow-DOM focus timing differs. Also re-check the docking geometry. |
| 🔴 | **F6** flag-moment shortcut | Ctrl+Shift+F (Win/Linux) / Cmd+Shift+F (macOS) mid-call → 📝 flashes, placeholder note appears. | Two independent failure modes: the `tabs.query` throw (F-1, fixed by T2) and a possible macOS shortcut conflict (F-5) where the handler is never called with **no error anywhere**. Confirm the relay works on Win/Linux before concluding anything about macOS. Also confirm it works with no host permissions declared. |
| 🟠 | **F7** Notes export | `.txt` and `.md` from **all three** call sites: in-call modal (content script), fireflies.ai panel (content script), popup (extension page). Correct filename and contents in Downloads. | The pattern is Firefox-recommended (F-7), but the two content-script sites run under Meet's and Fireflies' CSP while the popup runs under the extension's. `triggerDownload` catches and warns, so failure is a silent dead button. |
| 🟠 | **F8** Toolbar popup | Meetings newest-first, 320px with no clipping, scrolls past 480px, inline edit works, 📋 **actually pasted somewhere to confirm**, TXT/MD download. | Firefox popups auto-size to content; `body { width: 320px }` with no `<html>` width sometimes renders narrow or with a stray scrollbar — cosmetic, fix with `html { width: 320px }`. And `.catch(() => {})` makes a clipboard failure invisible, so don't just click. |
| 🟠 | **F9** fireflies.ai panel | On an `app.fireflies.ai` meeting page: 📝 opens the panel; auto-detect or the picker; pick one → remembered; SPA-navigate to another meeting → panel re-resolves; navigate back → the pick persisted; "Not the right meeting? Change" re-opens the picker. | Exercises `fireflies-link-store` (covered by T2) plus `findMeetingCodeOnPage()` against a DOM this codebase admits it has never inspected. The SPA path also depends on `MutationObserver` firing on Fireflies' React tree. |
| 🟢 | **F10** Confirmation badge | With Fireflies in the call: green badge once, no buttons, auto-hides after 4s. | Gated on F1's `scanForFireflies()`. |
| 🟢 | **F11** Teardown | Leave the call → banner and 📝 gone, timers stopped, no errors. Close the tab → no unhandled rejections. | `pagehide` / `beforeunload` fire in Firefox. |
| 🟢 | **F12** Trim to 20 meetings | Covered transitively by F8; `get(null)` behaves identically. | |

### Chrome regression pass — mandatory

Re-run F3, F4, F6, F7, F8 in Chrome after T2 lands. The whole point of the
shared-manifest approach is that Chrome is provably untouched, and
`globalThis.browser ?? globalThis.chrome` is the one line that changes Chrome's
behaviour: on Chrome 148+ every call now routes through `browser.*` for the
first time. Test both sides if the team spans versions.

Finish with `npx web-ext lint` — clean of errors before signing.

---

## 4. Open questions

1. **Internal domain for `gecko.id`** (T1).
2. **Icon PNG assets** (T7) — none exist in the repo.
3. **Are there macOS users?** Decides T6.
4. **Does a temporary add-on get the F-3 host-permission auto-grant?**
   **Answered 2026-09-09: yes** — on this test run (real Firefox 127+,
   loaded as a temporary add-on) content scripts ran immediately with no
   manual `about:addons` → Permissions step. Content script loading and F2
   auto-admit both worked automatically. Treat as one confirmed data point,
   not a guarantee across every Firefox version/profile — the README still
   documents the manual-grant fallback for teammates who see a different
   result.
5. **Is `storage.session` gated for content scripts in Firefox?**
   **Answered 2026-09-09: yes (effectively — it's `undefined` in the
   content-script sandbox, not merely permission-gated).** T5a's soak test
   confirmed it live; T5b (sessionStorage-based mute) is implemented and
   `storage.session` has been removed from the codebase entirely.

---

## Sources

MDN: [WebExtensions API (browser vs chrome namespace)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API) ·
[manifest.json/background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) ·
[manifest.json/commands](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands) ·
[storage.session](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session) ·
[StorageArea.setAccessLevel](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/setAccessLevel) ·
[Content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) ·
[Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) ·
[Firefox 127 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/127)

Extension Workshop: [Manifest V3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)

browser-compat-data: [`webextensions/api/storage.json`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/storage.json)

Bugzilla: [1573659](https://bugzilla.mozilla.org/show_bug.cgi?id=1573659) background service workers ·
[1724754](https://bugzilla.mozilla.org/show_bug.cgi?id=1724754) `setAccessLevel` ·
[1415352](https://bugzilla.mozilla.org/show_bug.cgi?id=1415352) content-script inline styles vs page CSP ·
[1696174](https://bugzilla.mozilla.org/show_bug.cgi?id=1696174) `downloads.download` with content-script blobs
