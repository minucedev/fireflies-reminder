(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});

  // Standalone on purpose (no dependency on constants.js/other modules) so it
  // can be loaded both as a content script and inside the toolbar popup page.
  const NOTES_PREFIX = "firefliesNotes:";
  const MAX_MEETINGS_KEPT = 20;

  // Firefox only implements the Promise-returning extension API on
  // `browser.*` — `chrome.*` there is callback-only and returns `undefined`
  // when awaited, which the try/catch below would silently swallow. Chrome
  // has no `browser` global, so this falls through to `chrome`. Resolve off
  // `globalThis`, never `window`: the MV3 service worker has no `window`,
  // and in a Firefox content script `window` is the *page's* window while
  // the extension globals live on the content-script sandbox global.
  const api = globalThis.browser ?? globalThis.chrome;

  function noteKey(meetingCode) {
    return NOTES_PREFIX + meetingCode;
  }

  async function getNotes(meetingCode) {
    try {
      const key = noteKey(meetingCode);
      const result = await api.storage.local.get(key);
      return result[key] || { meetingCode, notes: [], updatedAt: null };
    } catch (err) {
      console.warn("[fireflies-reminder] failed to read notes", err);
      return { meetingCode, notes: [], updatedAt: null };
    }
  }

  async function addNote(meetingCode, text, elapsedMs) {
    try {
      const existing = await getNotes(meetingCode);
      const note = { text, capturedAt: new Date().toISOString(), elapsedMs };
      const updated = {
        meetingCode,
        notes: [...existing.notes, note],
        updatedAt: note.capturedAt,
      };
      await api.storage.local.set({ [noteKey(meetingCode)]: updated });
      await trimOldMeetings();
      return updated;
    } catch (err) {
      console.warn("[fireflies-reminder] failed to save note", err);
      return null;
    }
  }

  async function deleteNote(meetingCode, index) {
    try {
      const existing = await getNotes(meetingCode);
      const notes = existing.notes.slice();
      notes.splice(index, 1);
      const updated = { ...existing, notes };
      await api.storage.local.set({ [noteKey(meetingCode)]: updated });
      return updated;
    } catch (err) {
      console.warn("[fireflies-reminder] failed to delete note", err);
      return null;
    }
  }

  async function updateNoteText(meetingCode, index, newText) {
    try {
      const existing = await getNotes(meetingCode);
      if (!existing.notes[index]) return null;
      const notes = existing.notes.slice();
      notes[index] = { ...notes[index], text: newText };
      const updated = { ...existing, notes, updatedAt: new Date().toISOString() };
      await api.storage.local.set({ [noteKey(meetingCode)]: updated });
      return updated;
    } catch (err) {
      console.warn("[fireflies-reminder] failed to update note", err);
      return null;
    }
  }

  async function getAllMeetingsWithNotes() {
    try {
      const all = await api.storage.local.get(null);
      return Object.keys(all)
        .filter((key) => key.startsWith(NOTES_PREFIX) && all[key].notes && all[key].notes.length)
        .map((key) => all[key])
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (err) {
      console.warn("[fireflies-reminder] failed to list notes", err);
      return [];
    }
  }

  async function trimOldMeetings() {
    try {
      const meetings = await getAllMeetingsWithNotes();
      if (meetings.length <= MAX_MEETINGS_KEPT) return;
      const toRemove = meetings.slice(MAX_MEETINGS_KEPT).map((m) => noteKey(m.meetingCode));
      await api.storage.local.remove(toRemove);
    } catch (err) {
      console.warn("[fireflies-reminder] failed to trim old notes", err);
    }
  }

  NS.notesStore = { getNotes, addNote, deleteNote, updateNoteText, getAllMeetingsWithNotes };
})(window);
