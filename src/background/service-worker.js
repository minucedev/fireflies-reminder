// See notes-store.js for why this shim exists and why it resolves off
// globalThis (this file has no `window` at all in Chrome's MV3 service
// worker, and Firefox's event page shares the same top-level global).
const api = globalThis.browser ?? globalThis.chrome;

// commands fires here in the background, not on the page — relay it
// to the active tab's content script. Fails silently if that tab isn't a
// Meet call with the content script injected, which is the desired no-op.
api.commands.onCommand.addListener(async (command) => {
  if (command !== "flag-moment") return;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    api.tabs.sendMessage(tab.id, { type: "flag-moment" }).catch(() => {});
  } catch (err) {
    console.warn("[fireflies-reminder] failed to relay flag-moment command", err);
  }
});
