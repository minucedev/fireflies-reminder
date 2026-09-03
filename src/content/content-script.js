(function (global) {
  const NS = global.__fireflies;
  const { DEFAULT_GRACE_PERIOD_MS, DEFAULT_REPEAT_INTERVAL_MS, MUTATION_DEBOUNCE_MS, LOG_PREFIX } =
    NS.constants;
  const { getCallState, scanForFireflies } = NS.detector;
  const { getMeetingCode, isMuted, setMuted } = NS.session;
  const banner = NS.banner;

  let wasInCall = false;
  let firefliesDetected = false;
  let meetingCode = null;
  let graceTimer = null;
  let repeatTimer = null;
  let debounceTimer = null;
  let observer = null;

  function clearAllTimers() {
    if (graceTimer) clearTimeout(graceTimer);
    if (repeatTimer) clearTimeout(repeatTimer);
    graceTimer = null;
    repeatTimer = null;
  }

  function showBanner(isFirst) {
    banner.show({
      isFirst,
      onDismiss: () => {}, // reappears on the next repeat tick unless muted
      onMute: async () => {
        await setMuted(meetingCode);
        clearAllTimers();
      },
    });
  }

  async function tickRepeat() {
    if (firefliesDetected || getCallState() !== "in-call") return;
    if (await isMuted(meetingCode)) return;
    showBanner(false);
    repeatTimer = setTimeout(tickRepeat, DEFAULT_REPEAT_INTERVAL_MS);
  }

  function onGraceExpired() {
    graceTimer = null;
    if (firefliesDetected) return;
    showBanner(true);
    repeatTimer = setTimeout(tickRepeat, DEFAULT_REPEAT_INTERVAL_MS);
  }

  async function startNagCycle() {
    if (graceTimer || repeatTimer) return; // already running
    if (await isMuted(meetingCode)) return;
    graceTimer = setTimeout(onGraceExpired, DEFAULT_GRACE_PERIOD_MS);
  }

  function handleFirefliesDetected() {
    firefliesDetected = true;
    clearAllTimers();
    banner.showConfirmation();
  }

  function handleFirefliesGone() {
    // Bot dropped off mid-call: give it a fresh grace period before nagging again.
    firefliesDetected = false;
    startNagCycle();
  }

  function teardownMeeting() {
    clearAllTimers();
    banner.destroy();
    firefliesDetected = false;
    meetingCode = null;
  }

  async function evaluate() {
    const state = getCallState();

    if (state === "in-call" && !wasInCall) {
      wasInCall = true;
      meetingCode = getMeetingCode();
      firefliesDetected = false;
      await startNagCycle();
    } else if (state !== "in-call" && wasInCall) {
      wasInCall = false;
      teardownMeeting();
    }

    if (wasInCall) {
      const found = scanForFireflies();
      if (found && !firefliesDetected) {
        handleFirefliesDetected();
      } else if (!found && firefliesDetected) {
        handleFirefliesGone();
      }
    }
  }

  function scheduleEvaluate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      evaluate().catch((err) => console.warn(`${LOG_PREFIX} evaluate failed`, err));
    }, MUTATION_DEBOUNCE_MS);
  }

  function destroy() {
    try {
      if (observer) observer.disconnect();
      clearAllTimers();
      banner.destroy();
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to tear down`, err);
    }
  }

  function init() {
    try {
      observer = new MutationObserver(scheduleEvaluate);
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleEvaluate();

      window.addEventListener("pagehide", destroy);
      window.addEventListener("beforeunload", destroy);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to initialize`, err);
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})(window);
