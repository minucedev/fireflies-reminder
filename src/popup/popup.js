(function () {
  const notesStore = window.__fireflies.notesStore;
  const notesExport = window.__fireflies.notesExport;
  const listEl = document.getElementById("list");

  async function render() {
    try {
      const meetings = await notesStore.getAllMeetingsWithNotes();
      listEl.innerHTML = "";

      if (!meetings.length) {
        listEl.innerHTML =
          '<div class="empty">No quick notes yet.<br />Capture something during your next Meet call.</div>';
        return;
      }

      meetings.forEach((meeting) => {
        const section = document.createElement("div");
        section.className = "meeting";

        const title = document.createElement("div");
        title.className = "meeting-title";

        const label = document.createElement("span");
        label.className = "meeting-label";
        label.textContent = `${meeting.meetingCode} — ${notesExport.formatDate(meeting.updatedAt)}`;

        const actions = document.createElement("div");
        actions.className = "meeting-actions";
        actions.innerHTML =
          '<button type="button" class="action-btn copy-btn" title="Copy all">📋</button>' +
          '<button type="button" class="action-btn export-btn" data-format="txt" title="Export .txt">TXT</button>' +
          '<button type="button" class="action-btn export-btn" data-format="md" title="Export .md">MD</button>';

        title.appendChild(label);
        title.appendChild(actions);
        section.appendChild(title);

        meeting.notes.forEach((note) => {
          const noteEl = document.createElement("div");
          noteEl.className = "note";
          const timeEl = document.createElement("span");
          timeEl.className = "note-time";
          timeEl.textContent = notesExport.formatElapsed(note.elapsedMs);
          const textEl = document.createElement("span");
          textEl.textContent = note.text;
          noteEl.appendChild(timeEl);
          noteEl.appendChild(textEl);
          section.appendChild(noteEl);
        });

        actions.querySelector(".copy-btn").addEventListener("click", () => {
          const text = meeting.notes
            .map((n) => `[${notesExport.formatElapsed(n.elapsedMs)}] ${n.text}`)
            .join("\n");
          navigator.clipboard.writeText(text).catch(() => {});
        });

        actions.querySelectorAll(".export-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            notesExport.exportMeeting(meeting, btn.dataset.format);
          });
        });

        listEl.appendChild(section);
      });
    } catch (err) {
      console.warn("[fireflies-reminder] failed to render notes popup", err);
    }
  }

  render();
})();
