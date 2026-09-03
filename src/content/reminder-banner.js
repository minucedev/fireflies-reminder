(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { LOG_PREFIX } = NS.constants;

  const FIRST_MESSAGE =
    "👋 Looks like Fireflies hasn't joined this call yet. Want to invite the notetaker so no one has to take notes?";

  // Rotated on repeat appearances so the nag doesn't feel identical/robotic
  // every few minutes.
  const REPEAT_MESSAGES = [
    "⏰ Still no Fireflies bot in this call. No worries if it's intentional — just checking in.",
    "🙂 Just a friendly nudge — Fireflies still hasn't joined. Invite it whenever you're ready.",
    "📝 Reminder: no one's taking notes yet. Invite Fireflies if this meeting needs a transcript.",
  ];

  const CONFIRMATION_MESSAGE = "✅ Fireflies is in the meeting — you're all set.";
  const CONFIRMATION_DURATION_MS = 4000;

  const STYLE = `
    .ff-banner {
      position: fixed;
      top: 16px;
      left: 50%;
      z-index: 2147483000;
      max-width: 420px;
      background: #ffffff;
      color: #202124;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      padding: 14px 16px;
      font-family: "Google Sans", Roboto, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: 10px;
      opacity: 0;
      transform: translate(-50%, -8px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    .ff-banner.ff-visible {
      opacity: 1;
      transform: translate(-50%, 0);
      pointer-events: auto;
    }
    .ff-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .ff-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      padding: 4px 8px;
      border-radius: 6px;
      color: #1a73e8;
    }
    .ff-btn:hover {
      background: rgba(26, 115, 232, 0.08);
    }
    .ff-btn.ff-mute {
      color: #5f6368;
    }
    .ff-banner.ff-confirmation {
      border-left: 4px solid #1e8e3e;
    }
  `;

  let hostEl = null;
  let shadowRoot = null;
  let repeatIndex = 0;
  let autoHideTimer = null;

  function clearAutoHide() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  function ensureMounted() {
    if (hostEl) return;

    hostEl = document.createElement("div");
    hostEl.id = "fireflies-reminder-host";
    shadowRoot = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadowRoot.appendChild(style);

    const el = document.createElement("div");
    el.className = "ff-banner";
    el.innerHTML =
      '<div class="ff-text"></div>' +
      '<div class="ff-actions">' +
      '<button type="button" class="ff-btn ff-dismiss">Got it, thanks</button>' +
      '<button type="button" class="ff-btn ff-mute">Mute for this meeting</button>' +
      "</div>";
    shadowRoot.appendChild(el);

    document.body.appendChild(hostEl);
  }

  function show({ isFirst, onDismiss, onMute }) {
    try {
      clearAutoHide();
      ensureMounted();
      const el = shadowRoot.querySelector(".ff-banner");
      const textEl = shadowRoot.querySelector(".ff-text");
      const actionsEl = shadowRoot.querySelector(".ff-actions");

      el.classList.remove("ff-confirmation");
      actionsEl.style.display = "";

      textEl.textContent = isFirst
        ? FIRST_MESSAGE
        : REPEAT_MESSAGES[repeatIndex++ % REPEAT_MESSAGES.length];

      const dismissBtn = shadowRoot.querySelector(".ff-dismiss");
      const muteBtn = shadowRoot.querySelector(".ff-mute");
      dismissBtn.onclick = () => {
        hide();
        if (onDismiss) onDismiss();
      };
      muteBtn.onclick = () => {
        hide();
        if (onMute) onMute();
      };

      requestAnimationFrame(() => el.classList.add("ff-visible"));
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to show banner`, err);
    }
  }

  // Brief, button-less reassurance shown once Fireflies is actually in the
  // meeting. Reuses the same banner shell, swaps in positive styling/copy,
  // and auto-hides — no interaction required.
  function showConfirmation() {
    try {
      clearAutoHide();
      ensureMounted();
      const el = shadowRoot.querySelector(".ff-banner");
      const textEl = shadowRoot.querySelector(".ff-text");
      const actionsEl = shadowRoot.querySelector(".ff-actions");

      el.classList.add("ff-confirmation");
      actionsEl.style.display = "none";
      textEl.textContent = CONFIRMATION_MESSAGE;

      requestAnimationFrame(() => el.classList.add("ff-visible"));
      autoHideTimer = setTimeout(() => {
        hide();
        autoHideTimer = null;
      }, CONFIRMATION_DURATION_MS);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to show confirmation`, err);
    }
  }

  function hide() {
    try {
      if (!shadowRoot) return;
      const el = shadowRoot.querySelector(".ff-banner");
      if (el) el.classList.remove("ff-visible");
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to hide banner`, err);
    }
  }

  function destroy() {
    try {
      clearAutoHide();
      if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to remove banner host`, err);
    } finally {
      hostEl = null;
      shadowRoot = null;
      repeatIndex = 0;
    }
  }

  NS.banner = { show, showConfirmation, hide, destroy };
})(window);
