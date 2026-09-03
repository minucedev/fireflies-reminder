(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { LOG_PREFIX } = NS.constants;

  // The ONLY file allowed to touch the Fireflies web app's raw DOM. We have
  // not inspected Fireflies' exact markup, so this is a best-effort, generic
  // scan (not tied to any class name) that fails safe (returns null) instead
  // of throwing, and warns once rather than spamming the console.
  const warnedKeys = new Set();
  function warnOnce(key, err) {
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);
    console.warn(`${LOG_PREFIX} selector lookup failed (${key}) on Fireflies page`, err);
  }

  const MEET_LINK_PATTERN = /meet\.google\.com\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/i;

  // Looks for the original Google Meet link anywhere on the current
  // Fireflies page (an anchor href first, then plain visible text) so we
  // can auto-match this Fireflies meeting to locally stored quick notes.
  // Not guaranteed to find anything — callers must handle a null result.
  function findMeetingCodeOnPage() {
    try {
      const links = document.querySelectorAll('a[href*="meet.google.com"]');
      for (const link of links) {
        const match = (link.href || "").match(MEET_LINK_PATTERN);
        if (match) return match[1].toLowerCase();
      }
    } catch (err) {
      warnOnce("findMeetingCodeOnPage:links", err);
    }

    try {
      const text = document.body.innerText || "";
      const match = text.match(MEET_LINK_PATTERN);
      if (match) return match[1].toLowerCase();
    } catch (err) {
      warnOnce("findMeetingCodeOnPage:text", err);
    }

    return null;
  }

  NS.firefliesSelectors = { findMeetingCodeOnPage };
})(window);
