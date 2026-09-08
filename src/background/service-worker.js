// chrome.storage.session defaults to extension-only access; content scripts
// can't read/write it until a trusted context (this service worker) opts in.
// This must be re-applied every time the worker starts, since the access
// level isn't persisted across browser restarts.
async function unlockSessionStorageForContentScripts() {
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  } catch (err) {
    console.warn("[fireflies-reminder] failed to set storage access level", err);
  }
}

chrome.runtime.onInstalled.addListener(unlockSessionStorageForContentScripts);
chrome.runtime.onStartup.addListener(unlockSessionStorageForContentScripts);
unlockSessionStorageForContentScripts();

// chrome.commands fires here in the background, not on the page — relay it
// to the active tab's content script. Fails silently if that tab isn't a
// Meet call with the content script injected, which is the desired no-op.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "flag-moment") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "flag-moment" }).catch(() => {});
  } catch (err) {
    console.warn("[fireflies-reminder] failed to relay flag-moment command", err);
  }
});
