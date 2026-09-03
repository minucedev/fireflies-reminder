(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});
  const { LOG_PREFIX, MUTATION_DEBOUNCE_MS } = NS.constants;
  const { findMeetingCodeOnPage } = NS.firefliesSelectors;
  const { getLinkedMeetingCode, setLinkedMeetingCode } = NS.firefliesLinkStore;
  const notesStore = NS.notesStore;
  const notesExport = NS.notesExport;

  const STYLE = `
    .ffp-tab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483000;
      width: 48px;
      height: 48px;
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
    }
    .ffp-tab:hover {
      background: #4c5053;
    }
    .ffp-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(0, 0, 0, 0.35);
      display: none;
    }
    .ffp-backdrop.ffp-open {
      display: block;
    }
    .ffp-modal {
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
    .ffp-modal.ffp-open {
      display: flex;
    }
    .ffp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      font-weight: 500;
      border-bottom: 1px solid #eee;
    }
    .ffp-close {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      color: #5f6368;
      line-height: 1;
      padding: 2px 4px;
    }
    .ffp-body {
      overflow-y: auto;
      padding: 10px 14px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ffp-item {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 6px 8px;
    }
    .ffp-item-time {
      color: #5f6368;
      font-size: 11px;
      white-space: nowrap;
      padding-top: 1px;
    }
    .ffp-item-text {
      flex: 1;
      word-break: break-word;
    }
    .ffp-item-del {
      cursor: pointer;
      color: #5f6368;
      border: none;
      background: none;
      font-size: 14px;
      line-height: 1;
    }
    .ffp-empty {
      color: #5f6368;
      padding: 8px 0;
    }
    .ffp-pick-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      border: none;
      text-align: left;
      font-family: inherit;
      font-size: 13px;
      color: #202124;
    }
    .ffp-pick-row:hover {
      background: #eef1f3;
    }
    .ffp-pick-meta {
      color: #5f6368;
      font-size: 11px;
    }
    .ffp-footer {
      display: flex;
      gap: 8px;
      padding: 10px 14px;
      border-top: 1px solid #eee;
    }
    .ffp-btn {
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
    .ffp-btn:hover:not(:disabled) {
      background: rgba(26, 115, 232, 0.08);
    }
    .ffp-btn:disabled {
      color: #9aa0a6;
      border-color: #eee;
      cursor: default;
    }
    .ffp-link-btn {
      background: none;
      border: none;
      color: #1a73e8;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      padding: 0;
      text-align: left;
    }
  `;

  let hostEl = null;
  let shadowRoot = null;
  let debounceTimer = null;
  let observer = null;
  let lastPath = null;
  let linkedMeetingCode = null;
  let view = "linked"; // "linked" | "picker"

  function ensureMounted() {
    if (hostEl) return;

    hostEl = document.createElement("div");
    hostEl.id = "fireflies-panel-host";
    shadowRoot = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadowRoot.appendChild(style);

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "ffp-tab";
    tab.title = "Your quick notes for this meeting";
    tab.textContent = "📝";
    shadowRoot.appendChild(tab);

    const backdrop = document.createElement("div");
    backdrop.className = "ffp-backdrop";
    shadowRoot.appendChild(backdrop);

    const modal = document.createElement("div");
    modal.className = "ffp-modal";
    modal.innerHTML =
      '<div class="ffp-header"><span class="ffp-title">Quick notes</span>' +
      '<button type="button" class="ffp-close" title="Close">✕</button></div>' +
      '<div class="ffp-body"></div>' +
      '<div class="ffp-footer"></div>';
    shadowRoot.appendChild(modal);

    tab.addEventListener("click", () => {
      const isOpen = modal.classList.contains("ffp-open");
      isOpen ? closePanel() : openPanel();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closePanel();
    });
    modal.querySelector(".ffp-close").addEventListener("click", closePanel);

    document.body.appendChild(hostEl);
  }

  function openPanel() {
    try {
      ensureMounted();
      shadowRoot.querySelector(".ffp-backdrop").classList.add("ffp-open");
      shadowRoot.querySelector(".ffp-modal").classList.add("ffp-open");
      render();
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to open Fireflies notes panel`, err);
    }
  }

  function closePanel() {
    try {
      if (!shadowRoot) return;
      shadowRoot.querySelector(".ffp-backdrop").classList.remove("ffp-open");
      shadowRoot.querySelector(".ffp-modal").classList.remove("ffp-open");
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to close Fireflies notes panel`, err);
    }
  }

  async function render() {
    try {
      if (!shadowRoot) return;
      const titleEl = shadowRoot.querySelector(".ffp-title");
      const bodyEl = shadowRoot.querySelector(".ffp-body");
      const footerEl = shadowRoot.querySelector(".ffp-footer");
      bodyEl.innerHTML = "";
      footerEl.innerHTML = "";

      if (view === "picker" || !linkedMeetingCode) {
        titleEl.textContent = "Link your quick notes";
        await renderPicker(bodyEl);
        return;
      }

      titleEl.textContent = `Quick notes — ${linkedMeetingCode}`;
      const data = await notesStore.getNotes(linkedMeetingCode);

      if (!data.notes.length) {
        bodyEl.innerHTML = '<div class="ffp-empty">No notes captured for this meeting.</div>';
      } else {
        data.notes.forEach((note, index) => {
          const item = document.createElement("div");
          item.className = "ffp-item";
          item.innerHTML =
            `<span class="ffp-item-time">${notesExport.formatElapsed(note.elapsedMs)}</span>` +
            '<span class="ffp-item-text"></span>' +
            '<button type="button" class="ffp-item-del" title="Delete">✕</button>';
          item.querySelector(".ffp-item-text").textContent = note.text;
          item.querySelector(".ffp-item-del").addEventListener("click", async () => {
            await notesStore.deleteNote(linkedMeetingCode, index);
            render();
          });
          bodyEl.appendChild(item);
        });
      }

      const changeBtn = document.createElement("button");
      changeBtn.type = "button";
      changeBtn.className = "ffp-link-btn";
      changeBtn.textContent = "🔗 Not the right meeting? Change";
      changeBtn.addEventListener("click", () => {
        view = "picker";
        render();
      });
      bodyEl.appendChild(changeBtn);

      const txtBtn = document.createElement("button");
      txtBtn.type = "button";
      txtBtn.className = "ffp-btn";
      txtBtn.textContent = "Export .txt";
      txtBtn.disabled = !data.notes.length;
      txtBtn.addEventListener("click", () => notesExport.exportMeeting(data, "txt"));

      const mdBtn = document.createElement("button");
      mdBtn.type = "button";
      mdBtn.className = "ffp-btn";
      mdBtn.textContent = "Export .md";
      mdBtn.disabled = !data.notes.length;
      mdBtn.addEventListener("click", () => notesExport.exportMeeting(data, "md"));

      footerEl.appendChild(txtBtn);
      footerEl.appendChild(mdBtn);
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to render Fireflies notes panel`, err);
    }
  }

  async function renderPicker(bodyEl) {
    const meetings = await notesStore.getAllMeetingsWithNotes();

    if (!meetings.length) {
      bodyEl.innerHTML =
        '<div class="ffp-empty">No quick notes captured yet. Jot some down during your next Google Meet call, then come back here.</div>';
      return;
    }

    meetings.forEach((meeting) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ffp-pick-row";
      row.innerHTML =
        `<span>${meeting.meetingCode}</span>` +
        `<span class="ffp-pick-meta">${notesExport.formatDate(meeting.updatedAt)} — ${meeting.notes.length} note(s)</span>`;
      row.addEventListener("click", async () => {
        linkedMeetingCode = meeting.meetingCode;
        view = "linked";
        await setLinkedMeetingCode(lastPath, linkedMeetingCode);
        render();
      });
      bodyEl.appendChild(row);
    });
  }

  async function resolveLink() {
    try {
      const pageKey = location.pathname;
      const stored = await getLinkedMeetingCode(pageKey);
      if (stored) {
        linkedMeetingCode = stored;
        view = "linked";
        return;
      }

      const autoCode = findMeetingCodeOnPage();
      if (autoCode) {
        const data = await notesStore.getNotes(autoCode);
        if (data.notes.length) {
          linkedMeetingCode = autoCode;
          view = "linked";
          await setLinkedMeetingCode(pageKey, autoCode);
          return;
        }
      }

      linkedMeetingCode = null;
      view = "picker";
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to resolve linked meeting`, err);
      linkedMeetingCode = null;
      view = "picker";
    }
  }

  async function checkForNavigation() {
    const currentPath = location.pathname;
    if (currentPath === lastPath) return;
    lastPath = currentPath;
    closePanel();
    await resolveLink();
  }

  function scheduleCheck() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      checkForNavigation().catch((err) => console.warn(`${LOG_PREFIX} nav check failed`, err));
    }, MUTATION_DEBOUNCE_MS);
  }

  function init() {
    try {
      ensureMounted();
      lastPath = location.pathname;
      resolveLink();

      observer = new MutationObserver(scheduleCheck);
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (err) {
      console.warn(`${LOG_PREFIX} failed to initialize Fireflies notes panel`, err);
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})(window);
