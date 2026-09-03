(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { FIREFLIES_NAME_MATCH, LOG_PREFIX } = NS.constants;
  const { isInCall, isInLobby, getVisibleNameTexts } = NS.selectors;

  function getCallState() {
    if (isInCall()) return "in-call";
    if (isInLobby()) return "lobby";
    return "unknown";
  }

  function scanForFireflies() {
    try {
      return getVisibleNameTexts().some((text) => FIREFLIES_NAME_MATCH.test(text));
    } catch (err) {
      console.warn(`${LOG_PREFIX} scan for Fireflies failed`, err);
      return false;
    }
  }

  NS.detector = { getCallState, scanForFireflies };
})(window);
