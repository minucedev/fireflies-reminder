(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { LOG_PREFIX } = NS.constants;
  const { getMeetingCode } = NS.session;
  const { getControlBarRect } = NS.selectors;
  const notesStore = NS.notesStore;
  const notesExport = NS.notesExport;

  // See notes-store.js for why this shim exists and why it resolves off
  // globalThis. (Functionally a no-op here: onMessage is an event
  // registration, not a promise-returning call, so it already worked
  // identically on both `chrome.*` and `browser.*` — kept for consistency.)
  const api = globalThis.browser ?? globalThis.chrome;

  const NOTE_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="white" aria-hidden="true">' +
    '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41' +
    'l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

  const FAB_SIZE = 48;
  const DOCK_GAP = 12;
  const FLAG_PLACEHOLDER = "🚩 Flagged moment — click to add details";

  const STYLE = `
    .ffn-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483000;
      width: ${FAB_SIZE}px;
      height: ${FAB_SIZE}px;
      border-radius: 50%;
      background: #3c4043;
      color: white;
      border: none;
      cursor: pointer;
      font-size: 20px;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .ffn-fab:hover {
      background: #4c5053;
    }
    .ffn-fab.ffn-fab--docked {
      bottom: auto;
      right: auto;
    }
    .ffn-fab.ffn-fab--flash {
      background: #1e8e3e;
      transform: scale(1.15);
    }
    .ffn-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(0, 0, 0, 0.35);
      display: none;
    }
    .ffn-backdrop.ffn-open {
      display: block;
    }
    .ffn-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483001;
      width: 360px;
      max-height: 70vh;
      background: #ffffff;
      color: #202124;
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
      font-family: "Google Sans", Roboto, Arial, sans-serif;
      font-size: 13px;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .ffn-modal.ffn-open {
      display: flex;
    }
    .ffn-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      font-weight: 500;
      border-bottom: 1px solid #eee;
    }
    .ffn-close {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      color: #5f6368;
      line-height: 1;
      padding: 2px 4px;
    }
    .ffn-list {
      overflow-y: auto;
      padding: 10px 14px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ffn-item {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 6px 8px;
    }
    .ffn-item-time {
      color: #5f6368;
      font-size: 11px;
      white-space: nowrap;
      padding-top: 1px;
    }
    .ffn-item-text {
      flex: 1;
      word-break: break-word;
      cursor: text;
    }
    .ffn-item-edit-input {
      flex: 1;
      border: 1px solid #dadce0;
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 13px;
      font-family: inherit;
    }
    .ffn-item-del {
      cursor: pointer;
      color: #5f6368;
      border: none;
      background: none;
      font-size: 14px;
      line-height: 1;
    }
    .ffn-empty {
      color: #5f6368;
      padding: 8px 0;
    }
    .ffn-input-row {
      display: flex;
      gap: 6px;
      padding: 10px 14px;
      border-top: 1px solid #eee;
    }
    .ffn-input {
      flex: 1;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 13px;
      font-family: inherit;
    }
    .ffn-send {
      border: none;
      background: #1a73e8;
      color: white;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
    }
    .ffn-export-row {
      display: flex;
      gap: 8px;
      padding: 10px 14px;
      border-top: 1px solid #eee;
    }
    .ffn-export-btn {
      flex: 1;
      border: 1px solid #dadce0;
      background: none;
      color: #1a73e8;
      border-radius: 8px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    }
    .ffn-export-btn:hover:not(:disabled) {
      background: rgba(26, 115, 232, 0.08);
    }
    .ffn-export-btn:disabled {
      color: #9aa0a6;
      border-color: #eee;
      cursor: default;
    }
  `;

  let hostEl = null;
  let shadowRoot = null;
  let meetingCode = null;
  let joinedAtMs = null;
  let isOpen = false;
  let escapeHandler = null;
  let lastDockedPos = null;
  let hasEverDocked = false;

  function ensureMounted() {
    if (hostEl) return;

    hostEl = document.createElement("div");
    hostEl.id = "fireflies-notes-host";
    shadowRoot = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadowRoot.appendChild(style);

    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "ffn-fab";
    fab.title = "Quick notes for this meeting";
    fab.innerHTML = NOTE_ICON_SVG;
    shadowRoot.appendChild(fab);

    const backdrop = document.createElement("div");
    backdrop.className = "ffn-backdrop";
    shadowRoot.appendChild(backdrop);

    const modal = document.createElement("div");
    modal.className = "ffn-modal";
    modal.innerHTML =
      '<div class="ffn-modal-header">' +
      "<span>Quick notes — this meeting</span>" +
      '<button type="button" class="ffn-close" title="Close">✕</button>' +
      "</div>" +
      '<div class="ffn-list"></div>' +
      '<div class="ffn-input-row">' +
      '<input type="text" class="ffn-input" placeholder="Jot something down…" />' +
      '<button type="button" class="ffn-send">Add</button>' +
      "</div>" +
      '<div class="ffn-export-row">' +
      '<button type="button" class="ffn-export-btn" data-format="txt">Export .txt</button>' +
      '<button type="button" class="ffn-export-btn" data-format="md">Export .md</button>' +
      "</div>";
    shadowRoot.appendChild(modal);

    fab.addEventListener("click", () => (isOpen ? closeModal() : openModal()));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    modal.querySelector(".ffn-close").addEventListener("click", closeModal);

    const input = modal.querySelector(".ffn-input");
    const send = modal.querySelector(".ffn-send");
    const submit = async () => {
      const text = input.value.trim();
      if (!text || !meetingCode) return;
      input.value = "";
      await notesStore.addNote(meetingCode, text, Date.now() - (joinedAtMs || Date.now()));
      renderList();
    };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    modal.querySelectorAll(".ffn-export-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!meetingCode) return;
        const data = await notesStore.getNotes(meetingCode);
        notesExport.exportMeeting(data, btn.dataset.format);
      });
    });

    document.body.appendChild(hostEl);
    reposition();
  }

  // Docks the FAB just left of Meet's own control bar, vertically centered
  // on it. If the bar can't be located right now, holds the last known good
  // position (handles Meet's own auto-hide fade / transient re-renders)
  // rather than snapping back to the corner; only falls back to the fixed
  // corner position if we've never successfully docked at all.
  function reposition() {
    if (!shadowRoot) return;
    try {
      const fab = shadowRoot.querySelector(".ffn-fab");
      if (!fab) return;

      const rect = getControlBarRect();
      if (rect) {
        const left = rect.left - FAB_SIZE - DOCK_GAP;
        const top = rect.top + rect.height / 2 - FAB_SIZE / 2;
        if (left >= 4) {
          lastDockedPos = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
          hasEverDocked = true;
          fab.style.left = lastDockedPos.left;
          fab.style.top = lastDockedPos.top;
          fab.classList.add("ffn-fab--docked");
          return;
        }
      }

      if (hasEverDocked && lastDockedPos) {
        fab.style.left = lastDockedPos.left;
        fab.style.top = lastDockedPos.top;
        fab.classList.add("ffn-fab--docked");
      } else {
        fab.classList.remove("ffn-fab--docked");
        fab.style.left = "";
        fab.style.top = "";
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to reposition quick notes button`, err);
    }
  }

  function openModal() {
    try {
      ensureMounted();
      isOpen = true;
      shadowRoot.querySelector(".ffn-backdrop").classList.add("ffn-open");
      const modal = shadowRoot.querySelector(".ffn-modal");
      modal.classList.add("ffn-open");
      renderList();

      escapeHandler = (e) => {
        if (e.key === "Escape") closeModal();
      };
      document.addEventListener("keydown", escapeHandler);

      requestAnimationFrame(() => {
        const input = shadowRoot.querySelector(".ffn-input");
        if (input) input.focus();
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to open quick notes`, err);
    }
  }

  function closeModal() {
    try {
      isOpen = false;
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
      if (!shadowRoot) return;
      shadowRoot.querySelector(".ffn-backdrop").classList.remove("ffn-open");
      shadowRoot.querySelector(".ffn-modal").classList.remove("ffn-open");
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to close quick notes`, err);
    }
  }

  async function renderList() {
    try {
      if (!shadowRoot || !meetingCode) return;
      const listEl = shadowRoot.querySelector(".ffn-list");
      const data = await notesStore.getNotes(meetingCode);
      listEl.innerHTML = "";

      shadowRoot.querySelectorAll(".ffn-export-btn").forEach((btn) => {
        btn.disabled = !data.notes.length;
      });

      if (!data.notes.length) {
        listEl.innerHTML =
          '<div class="ffn-empty">No notes yet — capture something worth remembering.</div>';
        return;
      }

      data.notes.forEach((note, index) => {
        const item = document.createElement("div");
        item.className = "ffn-item";
        item.innerHTML =
          `<span class="ffn-item-time">${notesExport.formatElapsed(note.elapsedMs)}</span>` +
          '<span class="ffn-item-text"></span>' +
          '<button type="button" class="ffn-item-del" title="Delete">✕</button>';
        const textEl = item.querySelector(".ffn-item-text");
        textEl.textContent = note.text;
        textEl.title = "Click to edit";
        textEl.addEventListener("click", () => startEditingNote(item, index, note));
        item.querySelector(".ffn-item-del").addEventListener("click", async () => {
          await notesStore.deleteNote(meetingCode, index);
          renderList();
        });
        listEl.appendChild(item);
      });

      listEl.scrollTop = listEl.scrollHeight;
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to render notes list`, err);
    }
  }

  function startEditingNote(itemEl, index, note) {
    try {
      const textEl = itemEl.querySelector(".ffn-item-text");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "ffn-item-edit-input";
      input.value = note.text === FLAG_PLACEHOLDER ? "" : note.text;
      itemEl.replaceChild(input, textEl);
      input.focus();

      const commit = async () => {
        const newText = input.value.trim() || note.text;
        await notesStore.updateNoteText(meetingCode, index, newText);
        renderList();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to edit note`, err);
    }
  }

  function flashFab() {
    try {
      if (!shadowRoot) return;
      const fab = shadowRoot.querySelector(".ffn-fab");
      if (!fab) return;
      fab.classList.add("ffn-fab--flash");
      setTimeout(() => fab.classList.remove("ffn-fab--flash"), 500);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to flash quick notes button`, err);
    }
  }

  // Zero-friction capture: no modal, no typing — just a timestamped
  // placeholder note plus a quick visual cue, fillable in later.
  async function flagMoment() {
    try {
      if (!meetingCode) return;
      await notesStore.addNote(meetingCode, FLAG_PLACEHOLDER, Date.now() - (joinedAtMs || Date.now()));
      flashFab();
      if (isOpen) renderList();
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to flag moment`, err);
    }
  }

  try {
    // Must NOT be async / return a promise: returning a promise (or `true`)
    // tells the browser "I will send a response", which changes what the
    // sender's sendMessage() promise resolves to in both Chrome and Firefox.
    // flagMoment() is fire-and-forget, so this listener must return
    // `undefined` in both engines.
    api.runtime.onMessage.addListener((message) => {
      if (message && message.type === "flag-moment") flagMoment();
    });
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to listen for flag-moment command`, err);
  }

  function init(joinTimestampMs) {
    try {
      meetingCode = getMeetingCode();
      joinedAtMs = joinTimestampMs || Date.now();
      ensureMounted();
      window.addEventListener("resize", reposition);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to initialize quick notes`, err);
    }
  }

  function destroy() {
    try {
      window.removeEventListener("resize", reposition);
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
      if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to remove notes host`, err);
    } finally {
      hostEl = null;
      shadowRoot = null;
      meetingCode = null;
      joinedAtMs = null;
      isOpen = false;
      lastDockedPos = null;
      hasEverDocked = false;
    }
  }

  NS.quickNotes = { init, destroy, reposition };
})(window);
