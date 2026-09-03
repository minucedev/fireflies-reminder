(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { STORAGE_MUTE_PREFIX, LOG_PREFIX } = NS.constants;

  // Meet URLs look like https://meet.google.com/abc-defg-hij for both the
  // lobby and the live call, so we key mute state off the meeting code
  // parsed from the path, with a defensive fallback if the shape ever changes.
  function getMeetingCode() {
    try {
      const match = window.location.pathname.match(/^\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/i);
      if (match) return match[1].toLowerCase();
      return window.location.pathname.replace(/^\/+/, "") || "unknown-meeting";
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to parse meeting code`, err);
      return "unknown-meeting";
    }
  }

  // chrome.storage.session is in-memory and clears itself when the browser
  // closes, which matches "muted for this meeting, not forever" without any
  // manual expiry bookkeeping.
  async function isMuted(meetingCode) {
    try {
      const key = STORAGE_MUTE_PREFIX + meetingCode;
      const result = await chrome.storage.session.get(key);
      return Boolean(result[key]);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to read mute state`, err);
      return false;
    }
  }

  async function setMuted(meetingCode) {
    try {
      const key = STORAGE_MUTE_PREFIX + meetingCode;
      await chrome.storage.session.set({ [key]: { mutedAt: Date.now() } });
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to write mute state`, err);
    }
  }

  NS.session = { getMeetingCode, isMuted, setMuted };
})(window);
