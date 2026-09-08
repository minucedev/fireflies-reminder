(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { LOG_PREFIX } = NS.constants;

  // The ONLY file allowed to touch Google Meet's raw DOM. Meet's markup is
  // obfuscated and changes without notice, so every query here fails safe
  // (returns an empty/false default) instead of throwing, and warns once
  // rather than spamming the console on every scan.
  const warnedKeys = new Set();
  function warnOnce(key, err) {
    if (warnedKeys.has(key)) return;
    warnedKeys.add(key);
    console.warn(`${LOG_PREFIX} selector lookup failed (${key}) — Meet's DOM may have changed`, err);
  }

  function isInCall() {
    try {
      return document.querySelectorAll('[aria-label*="leave" i]').length > 0;
    } catch (err) {
      warnOnce("isInCall", err);
      return false;
    }
  }

  function isInLobby() {
    try {
      return (
        document.querySelectorAll('[aria-label*="join now" i], [aria-label*="ask to join" i]')
          .length > 0
      );
    } catch (err) {
      warnOnce("isInLobby", err);
      return false;
    }
  }

  // A participant who has been invited but not yet admitted (e.g. Meet's
  // "With potential risks" bot-admission gate, or a regular waiting room)
  // still carries a `data-participant-id` and a matching aria-label, so it
  // looks identical to a real joined participant unless we explicitly check
  // for the pending-admission container around it.
  function isPendingAdmission(el) {
    try {
      return Boolean(
        el.closest(
          [
            '[aria-label*="potential risk" i]',
            '[aria-label*="waiting" i]',
            '[aria-label*="admit" i]',
            '[aria-label*="ask to join" i]',
            '[aria-label*="let in" i]',
          ].join(", ")
        )
      );
    } catch (err) {
      warnOnce("isPendingAdmission", err);
      return false;
    }
  }

  // Collects any visible name-ish text from participants who are actually in
  // the call: video tile labels/captions (works whether or not the side
  // "People" panel is open) plus the People panel's list items if that panel
  // happens to already be open. We never programmatically open the People
  // panel ourselves — that would change the user's UI state and is a more
  // fragile click-simulation surface. Anything still sitting in an
  // admission/waiting gate is excluded via isPendingAdmission.
  function getVisibleNameTexts() {
    const texts = [];

    const collect = (el) => {
      if (isPendingAdmission(el)) return;
      const label = el.getAttribute && el.getAttribute("aria-label");
      if (label) texts.push(label);
      if (el.textContent) texts.push(el.textContent);
    };

    try {
      document.querySelectorAll("[data-participant-id]").forEach(collect);
    } catch (err) {
      warnOnce("getVisibleNameTexts:tiles", err);
    }

    try {
      document
        .querySelectorAll('[aria-label="Participants"] [role="listitem"], [role="list"] [role="listitem"]')
        .forEach(collect);
    } catch (err) {
      warnOnce("getVisibleNameTexts:panel", err);
    }

    return texts;
  }

  // Finds the bounding box of Meet's own bottom control bar (mic/camera/leave
  // row) so the quick-notes button can dock just outside its left edge. We
  // don't know Meet's obfuscated class names for the row container, so we
  // start from the one button we can already reliably identify — the "leave
  // call" button (same selector isInCall() relies on) — and walk a small,
  // bounded number of ancestors looking for the lowest one that also
  // contains mic AND camera controls, i.e. the row that groups the whole
  // button set. Returns null (never throws) if it can't confidently find
  // that row within the bound, so callers can fall back to a fixed position.
  const CONTROL_BAR_MAX_ANCESTOR_DEPTH = 6;

  function getControlBarRect() {
    try {
      const leaveBtn = document.querySelector('[aria-label*="leave" i]');
      if (!leaveBtn) return null;

      let candidate = leaveBtn.parentElement;
      let depth = 0;
      while (candidate && depth < CONTROL_BAR_MAX_ANCESTOR_DEPTH) {
        const hasMic = candidate.querySelector('[aria-label*="microphone" i], [aria-label*="mic" i]');
        const hasCamera = candidate.querySelector('[aria-label*="camera" i]');
        if (hasMic && hasCamera) {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 ? rect : null;
        }
        candidate = candidate.parentElement;
        depth++;
      }
      return null;
    } catch (err) {
      warnOnce("getControlBarRect", err);
      return null;
    }
  }

  // Admitting a pending "fireflies"-named participant is a two-step Meet
  // interaction (confirmed via a real recorded click trace): open that
  // row's "More actions" (⋮) menu, then click the "Admit <name>" menu item
  // that appears — there is no single direct "Admit" button on the row.
  // Scoped tightly to admission-gate list items whose own aria-label
  // matches "fireflies" — never touches "Deny" or any other participant.
  function getPendingFirefliesMoreActionsButtons() {
    const buttons = [];
    try {
      document.querySelectorAll('[role="listitem"][aria-label*="fireflies" i]').forEach((item) => {
        if (!isPendingAdmission(item)) return;
        const moreBtn = item.querySelector('[aria-label="More actions"], [aria-label*="more actions" i]');
        if (moreBtn) buttons.push(moreBtn);
      });
    } catch (err) {
      warnOnce("getPendingFirefliesMoreActionsButtons", err);
    }
    return buttons;
  }

  // The pending-admission row only appears to exist/behave correctly once
  // Meet's "N guest(s) waiting" pill has been clicked (confirmed via a real
  // click trace) — this pill has no aria-label, only plain visible text,
  // so it's matched by exact trimmed text content rather than attributes.
  // Guarded by aria-expanded so we don't toggle an already-open panel shut.
  const GUESTS_WAITING_PATTERN = /^\d+\s+guests?\s+waiting$/i;

  function findGuestsWaitingTrigger() {
    try {
      // Not a <button>/role="button" in practice (confirmed live) — plain
      // div/span. querySelectorAll returns matches in document order, so an
      // outer clickable wrapper is naturally checked before any inner text
      // span it contains, as long as the exact-match text lives on it too.
      const candidates = document.querySelectorAll('button, [role="button"], div, span');
      for (const el of candidates) {
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (GUESTS_WAITING_PATTERN.test(text)) return el;
      }
    } catch (err) {
      warnOnce("findGuestsWaitingTrigger", err);
    }
    return null;
  }

  // The "Admit <name>" menu item Meet renders after the "More actions" menu
  // is opened — matched by role + aria-label containing both "admit" and
  // "fireflies" (confirmed wording: "Admit Fireflies.ai Notetaker <name>").
  // Not scoped to a specific row's subtree since Meet may render the open
  // menu elsewhere in the document.
  function findFirefliesAdmitMenuItem() {
    try {
      return document.querySelector('[role="menuitem"][aria-label*="admit" i][aria-label*="fireflies" i]');
    } catch (err) {
      warnOnce("findFirefliesAdmitMenuItem", err);
      return null;
    }
  }

  NS.selectors = {
    isInCall,
    isInLobby,
    getVisibleNameTexts,
    getControlBarRect,
    getPendingFirefliesMoreActionsButtons,
    findGuestsWaitingTrigger,
    findFirefliesAdmitMenuItem,
  };
})(window);
