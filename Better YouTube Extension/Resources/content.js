"use strict";

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULTS = { autoQuality: true, qualityShortcut: "q", theaterMode: true };
let cfg = { ...DEFAULTS };

browser.storage.local.get(DEFAULTS).then((stored) => {
  cfg = { ...DEFAULTS, ...stored };
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.autoQuality !== undefined) {
    cfg.autoQuality = changes.autoQuality.newValue;
    if (cfg.autoQuality) trySetHighestQuality(0);
  }
  if (changes.qualityShortcut !== undefined) {
    cfg.qualityShortcut = changes.qualityShortcut.newValue;
  }
  if (changes.theaterMode !== undefined) {
    cfg.theaterMode = changes.theaterMode.newValue;
    if (cfg.theaterMode) {
      setTheaterCookie();
      tryEnableTheaterMode();
    }
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll for a selector to appear — much faster than fixed sleeps
function waitForElement(selector, timeout = 2000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start >= timeout) return resolve(null);
      setTimeout(check, 30);
    };
    check();
  });
}

// Hide the settings menu with CSS so the user never sees it flicker open.
// opacity:0 only — pointer-events stays default so JS .click() still works.
function suppressMenuVisibility() {
  if (document.getElementById("atm-suppress-menu")) return;
  const s = document.createElement("style");
  s.id = "atm-suppress-menu";
  s.textContent = `.ytp-settings-menu { opacity: 0 !important; }`;
  document.head.appendChild(s);
}

function restoreMenuVisibility() {
  document.getElementById("atm-suppress-menu")?.remove();
}

// ── Theater Mode ──────────────────────────────────────────────────────────────

function setTheaterCookie() {
  if (!cfg.theaterMode) return;
  const tenYears = new Date();
  tenYears.setFullYear(tenYears.getFullYear() + 10);
  document.cookie = `wide=1; domain=.youtube.com; path=/; expires=${tenYears.toUTCString()}; SameSite=Lax`;
}

function enableTheaterMode() {
  if (!cfg.theaterMode) return false;
  if (!window.location.pathname.startsWith("/watch")) return false;

  const watchFlexy = document.querySelector("ytd-watch-flexy");
  if (!watchFlexy) return false;

  if (watchFlexy.hasAttribute("theater")) return true;

  const sizeButton = document.querySelector(".ytp-size-button");
  if (!sizeButton) return false;

  const title = (
    sizeButton.title ||
    sizeButton.getAttribute("aria-label") ||
    ""
  ).toLowerCase();

  if (title.includes("theater")) {
    sizeButton.click();
    return true;
  }

  return false;
}

function tryEnableTheaterMode() {
  if (!cfg.theaterMode) return;
  if (!window.location.pathname.startsWith("/watch")) return;

  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (enableTheaterMode() || attempts >= 40) clearInterval(interval);
  }, 300);
}

// ── Highest Quality (menu-click approach) ─────────────────────────────────────
//
// YouTube's setPlaybackQuality / setPlaybackQualityRange APIs are overridden
// immediately by YouTube's adaptive bitrate engine, so they don't stick.
// Driving the settings menu is the only reliable method.
// We hide it with CSS (opacity:0) so there is zero visible flicker.
// waitForElement() is used instead of fixed sleeps so each step proceeds the
// instant the DOM is ready — this keeps the total operation under ~200 ms and
// lets us finish before the video has buffered more than a few frames.

async function setHighestQualityViaMenu() {
  if (!cfg.autoQuality) return false;
  if (!window.location.pathname.startsWith("/watch")) return false;

  const settingsBtn = document.querySelector(".ytp-settings-button");
  if (!settingsBtn) return false;

  suppressMenuVisibility();

  try {
    // ── Step 1: open the settings panel ──────────────────────────────────────
    settingsBtn.click();

    // Wait for at least one menu item to appear instead of a fixed delay
    const firstItem = await waitForElement(".ytp-menuitem", 1500);
    if (!firstItem) {
      settingsBtn.click();
      return false;
    }

    // ── Step 2: find & click the "Quality" row ────────────────────────────────
    const qualityRow = [...document.querySelectorAll(".ytp-menuitem")].find(
      (el) =>
        el.querySelector(".ytp-menuitem-label")?.textContent.trim() ===
        "Quality",
    );

    if (!qualityRow) {
      settingsBtn.click();
      return false;
    }

    qualityRow.click();

    // ── Step 3: wait for quality radio options then pick the highest ──────────
    // YouTube swaps in a sub-panel; items have role="menuitemradio",
    // ordered highest → lowest, with "Auto (NNNp)" at the bottom.
    const firstRadio = await waitForElement(
      '.ytp-menuitem[role="menuitemradio"]',
      1500,
    );

    if (!firstRadio) {
      settingsBtn.click();
      return false;
    }

    const options = [
      ...document.querySelectorAll('.ytp-menuitem[role="menuitemradio"]'),
    ];

    const highest = options.find(
      (el) =>
        !el
          .querySelector(".ytp-menuitem-label")
          ?.textContent.toLowerCase()
          .includes("auto"),
    );

    if (!highest) {
      settingsBtn.click();
      return false;
    }

    highest.click();
    // YouTube closes the menu automatically after a selection.
    return true;
  } catch (_) {
    return false;
  } finally {
    restoreMenuVisibility();
  }
}

// Retry with recursive setTimeout so async attempts never overlap.
// initialDelay=0 on SPA navigation (player already mounted),
// small delay on first page load (player may still be mounting).
function trySetHighestQuality(initialDelay = 300) {
  if (!window.location.pathname.startsWith("/watch")) return;

  let attempts = 0;

  async function attempt() {
    attempts++;

    // Guard: settings button must exist before we can drive the menu
    if (!document.querySelector(".ytp-settings-button")) {
      if (attempts < 30) setTimeout(attempt, 200);
      return;
    }

    const ok = await setHighestQualityViaMenu();
    if (!ok && attempts < 10) {
      setTimeout(attempt, 400 + attempts * 100);
    }
  }

  setTimeout(attempt, initialDelay);
}

// ── Toast notification ────────────────────────────────────────────────────────

function showToast(text) {
  document.querySelector(".atm-toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "atm-toast";
  toast.textContent = text;

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "72px",
    left: "50%",
    transform: "translateX(-50%) translateY(4px)",
    background: "rgba(28, 28, 28, 0.92)",
    color: "#ffffff",
    padding: "8px 18px",
    borderRadius: "20px",
    fontSize: "13px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    fontWeight: "500",
    letterSpacing: "0.01em",
    zIndex: "9999999",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.18s ease, transform 0.18s ease",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(4px)";
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    e.target.isContentEditable ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;

  if (e.key.toLowerCase() === cfg.qualityShortcut.toLowerCase()) {
    cfg.autoQuality = !cfg.autoQuality;
    browser.storage.local.set({ autoQuality: cfg.autoQuality });

    if (cfg.autoQuality) {
      trySetHighestQuality(0);
      showToast("Auto Quality: On");
    } else {
      showToast("Auto Quality: Off");
    }
  }
});

// ── Initial page load ─────────────────────────────────────────────────────────

setTheaterCookie();
tryEnableTheaterMode();
trySetHighestQuality(300);

// ── YouTube SPA navigation ────────────────────────────────────────────────────
// The player element persists across SPA navigations, so the settings button
// is already in the DOM — we can start immediately (initialDelay = 0) and
// finish setting quality before the new video has buffered more than a frame.

window.addEventListener("yt-navigate-finish", () => {
  setTheaterCookie();
  tryEnableTheaterMode();
  trySetHighestQuality(0);
});
