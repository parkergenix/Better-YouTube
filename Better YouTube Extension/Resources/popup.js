"use strict";

const theaterToggle = document.getElementById("theater-toggle");
const qualityToggle = document.getElementById("quality-toggle");
const shortcutRow = document.getElementById("shortcut-row");
const shortcutKey = document.getElementById("shortcut-key");
const shortcutHint = document.getElementById("shortcut-hint");

// ── Load saved settings ───────────────────────────────────────────────────────

browser.storage.local
  .get({ theaterMode: true, autoQuality: true, qualityShortcut: "q" })
  .then((settings) => {
    theaterToggle.checked = settings.theaterMode;
    qualityToggle.checked = settings.autoQuality;
    shortcutKey.value = settings.qualityShortcut.toUpperCase();
    setShortcutRowState(settings.autoQuality);
  });

// ── Theater mode toggle ───────────────────────────────────────────────────────

theaterToggle.addEventListener("change", () => {
  browser.storage.local.set({ theaterMode: theaterToggle.checked });
});

// ── Quality toggle ────────────────────────────────────────────────────────────

qualityToggle.addEventListener("change", () => {
  browser.storage.local.set({ autoQuality: qualityToggle.checked });
  setShortcutRowState(qualityToggle.checked);
});

function setShortcutRowState(enabled) {
  shortcutRow.classList.toggle("disabled", !enabled);
}

// ── Shortcut key capture ──────────────────────────────────────────────────────

shortcutKey.addEventListener("click", () => {
  shortcutKey.removeAttribute("readonly");
  shortcutKey.value = "";
  shortcutKey.classList.add("capturing");
  shortcutHint.textContent = "press a key…";
  shortcutKey.focus();
});

shortcutKey.addEventListener("keydown", (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === "Escape") {
    cancelCapture();
    return;
  }

  if (/^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const key = e.key.toLowerCase();
    shortcutKey.value = key.toUpperCase();
    browser.storage.local.set({ qualityShortcut: key });
    commitCapture();
  }
});

shortcutKey.addEventListener("blur", () => {
  if (shortcutKey.classList.contains("capturing")) {
    cancelCapture();
  }
});

function commitCapture() {
  shortcutKey.setAttribute("readonly", "");
  shortcutKey.classList.remove("capturing");
  shortcutHint.textContent = "click to change";
}

function cancelCapture() {
  browser.storage.local.get({ qualityShortcut: "q" }).then((s) => {
    shortcutKey.value = s.qualityShortcut.toUpperCase();
  });
  commitCapture();
}
