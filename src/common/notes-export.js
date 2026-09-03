(function (global) {
  const NS = (global.__fireflies = global.__fireflies || {});

  // Standalone on purpose (same rationale as notes-store.js) so it can be
  // loaded both as a content script and inside the toolbar popup page.

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.round((ms || 0) / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      return "";
    }
  }

  function meetingLink(meetingCode) {
    return `https://meet.google.com/${meetingCode}`;
  }

  function buildFilename(meetingCode, updatedAt, ext) {
    const d = updatedAt ? new Date(updatedAt) : new Date();
    const dateStr = isNaN(d) ? "unknown-date" : d.toISOString().slice(0, 10);
    return `fireflies-notes-${meetingCode}-${dateStr}.${ext}`;
  }

  function buildTextExport(meeting) {
    const lines = [
      `Fireflies quick notes — ${meeting.meetingCode}`,
      `Link: ${meetingLink(meeting.meetingCode)}`,
      `Date: ${formatDate(meeting.updatedAt)}`,
      "",
    ];
    if (!meeting.notes.length) {
      lines.push("(no notes)");
    } else {
      meeting.notes.forEach((n) => lines.push(`[${formatElapsed(n.elapsedMs)}] ${n.text}`));
    }
    return lines.join("\n");
  }

  function buildMarkdownExport(meeting) {
    const link = meetingLink(meeting.meetingCode);
    const lines = [
      `# Fireflies quick notes — ${meeting.meetingCode}`,
      "",
      `- **Link:** [${link}](${link})`,
      `- **Date:** ${formatDate(meeting.updatedAt)}`,
      "",
      "## Notes",
      "",
    ];
    if (!meeting.notes.length) {
      lines.push("_(no notes)_");
    } else {
      meeting.notes.forEach((n) => lines.push(`- \`${formatElapsed(n.elapsedMs)}\` ${n.text}`));
    }
    return lines.join("\n");
  }

  function triggerDownload(filename, content, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn("[fireflies-reminder] failed to trigger download", err);
    }
  }

  function exportMeeting(meeting, format) {
    const isMd = format === "md";
    const content = isMd ? buildMarkdownExport(meeting) : buildTextExport(meeting);
    const filename = buildFilename(meeting.meetingCode, meeting.updatedAt, isMd ? "md" : "txt");
    const mimeType = isMd ? "text/markdown" : "text/plain";
    triggerDownload(filename, content, mimeType);
  }

  NS.notesExport = {
    formatElapsed,
    formatDate,
    meetingLink,
    buildFilename,
    buildTextExport,
    buildMarkdownExport,
    triggerDownload,
    exportMeeting,
  };
})(window);
