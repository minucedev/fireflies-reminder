(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { FIREFLIES_NAME_MATCH, LOG_PREFIX } = NS.constants;
  const {
    isInCall,
    isInLobby,
    getVisibleNameTexts,
    getPendingFirefliesMoreActionsButtons,
    findGuestsWaitingTrigger,
    findFirefliesAdmitMenuItem,
  } = NS.selectors;

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

  let admitInProgress = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForAdmitMenuItem(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      function check() {
        const item = findFirefliesAdmitMenuItem();
        if (item) return resolve(item);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(check, 100);
      }
      check();
    });
  }

  // Admits any pending participant whose name contains "fireflies" —
  // narrowly scoped to that admission-gate entry only, never touches
  // "Deny" or any other participant. This bypasses Meet's own bot-safety
  // confirmation step by design (opted into via AUTO_ADMIT_FIREFLIES in
  // constants.js). Confirmed via real click traces to be a multi-step Meet
  // interaction: click the "N guest(s) waiting" pill first (the pending
  // row doesn't behave until then), open that row's "More actions" menu,
  // then click the "Admit <name>" menu item that appears (there's no
  // single direct Admit button anywhere). Guarded by admitInProgress so
  // overlapping debounced scan ticks don't fire a second click sequence
  // while one is still mid-flight (e.g. toggling the same menu closed
  // again).
  async function admitPendingFireflies() {
    if (admitInProgress) return false;
    // Already in the call — nothing left to admit. Without this check we'd
    // keep trying to open the "guests waiting" pill on every scan tick
    // forever, which flickers open/closed against whatever unrelated
    // notification (e.g. "External participants joined") happens to be
    // sitting in that same UI slot afterward.
    if (scanForFireflies()) return false;

    admitInProgress = true;
    let openedPanelTrigger = null;
    try {
      let moreButtons = getPendingFirefliesMoreActionsButtons();

      if (!moreButtons.length) {
        const waitingTrigger = findGuestsWaitingTrigger();
        if (!waitingTrigger) return false;
        if (waitingTrigger.getAttribute("aria-expanded") !== "true") {
          waitingTrigger.click();
          openedPanelTrigger = waitingTrigger; // remember to close what we opened
          await wait(500);
        }
        moreButtons = getPendingFirefliesMoreActionsButtons();
        if (!moreButtons.length) return false;
      }

      for (const moreBtn of moreButtons) {
        moreBtn.click();
        const menuItem = await waitForAdmitMenuItem(1500);
        if (menuItem) {
          menuItem.click();
        } else {
          // Menu may still be open with nothing matched — close it rather
          // than leaving Meet's UI in an unexpected state.
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }
      }

      // Restore the panel to how we found it, since we only opened it to
      // reach the Admit control — leaves Meet's UI (including whatever
      // notification pill occupies that same slot afterward) as close to
      // untouched as possible.
      if (openedPanelTrigger) {
        await wait(300);
        openedPanelTrigger.click();
      }

      return true;
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to auto-admit Fireflies`, err);
      return false;
    } finally {
      admitInProgress = false;
    }
  }

  NS.detector = { getCallState, scanForFireflies, admitPendingFireflies };
})(window);
