(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});

  // Standalone on purpose (same rationale as notes-store.js). Remembers
  // which locally stored meeting-code's quick notes belong to a given
  // Fireflies page, keyed by that page's path — an explicit user pick here
  // always takes precedence over any auto-detection heuristic.
  const LINK_PREFIX = "firefliesLink:";

  // See notes-store.js for why this shim exists and why it resolves off
  // globalThis.
  const api = globalThis.browser ?? globalThis.chrome;

  function linkKey(pageKey) {
    return LINK_PREFIX + pageKey;
  }

  async function getLinkedMeetingCode(pageKey) {
    try {
      const key = linkKey(pageKey);
      const result = await api.storage.local.get(key);
      return result[key] || null;
    } catch (err) {
      console.warn("[fireflies-reminder] failed to read linked meeting", err);
      return null;
    }
  }

  async function setLinkedMeetingCode(pageKey, meetingCode) {
    try {
      await api.storage.local.set({ [linkKey(pageKey)]: meetingCode });
    } catch (err) {
      console.warn("[fireflies-reminder] failed to save linked meeting", err);
    }
  }

  NS.firefliesLinkStore = { getLinkedMeetingCode, setLinkedMeetingCode };
})(window);
