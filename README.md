# Fireflies Meet Reminder

A small internal Chrome/Firefox extension that nudges you inside Google Meet
if the Fireflies.ai notetaker hasn't joined the call, with a "Mute for this
meeting" option and a quick-notes widget for jotting down moments to revisit
later. No backend, no build step.

## Install

Get the latest build from **[Releases](https://github.com/minucedev/fireflies-reminder/releases/latest)**.

### Firefox (127+)

1. Download the `.xpi` file.
2. Open `about:addons` → gear icon (top) → **Install Add-on From File...** →
   select the `.xpi`. Installs permanently.

### Chrome

1. Download the `.zip` file and unzip it.
2. Open `chrome://extensions` → enable **Developer mode** (top-right) →
   **Load unpacked** → select the unzipped folder.

Neither browser auto-updates this extension — for a new version, download
the new release and repeat these steps (Firefox: install the new `.xpi`
over the old one; Chrome: replace the unzipped folder's contents and click
the reload icon on its card).

**Extension doing nothing on Firefox?** Open `about:addons` → this
extension → **Permissions** → enable access for `meet.google.com` (and
`app.fireflies.ai` if you use linked notes), then reload the tab.

## Keyboard shortcut

**Ctrl+Shift+F** (same combo on Mac — the physical Control key, not
Command) flags a moment instantly during a call, saving a timestamped
placeholder note with no UI. Rebind it at `chrome://extensions/shortcuts`
(Chrome) or `about:addons` → gear icon → **Manage Extension Shortcuts**
(Firefox) if it conflicts with something else on your system.
