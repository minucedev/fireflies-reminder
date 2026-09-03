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
