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

  // storage.session would be the natural home, but Firefox has never
  // implemented setAccessLevel (bug 1724754) so content scripts can't rely on
  // reaching it — confirmed live: `browser.storage.session.get/set` throw
  // "api.storage.session is undefined" from this content script. The Meet
  // tab's own sessionStorage has the same "in-memory, no manual expiry
  // bookkeeping" property — and is actually tighter: mute dies with the tab
  // rather than with the whole browser session, which is closer to "muted
  // for this meeting, not forever". Kept async so callers don't change.
  async function isMuted(meetingCode) {
    try {
      const key = STORAGE_MUTE_PREFIX + meetingCode;
      return Boolean(window.sessionStorage.getItem(key));
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to read mute state`, err);
      return false;
    }
  }

  async function setMuted(meetingCode) {
    try {
      const key = STORAGE_MUTE_PREFIX + meetingCode;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to write mute state`, err);
    }
  }

  NS.session = { getMeetingCode, isMuted, setMuted };
})(window);
