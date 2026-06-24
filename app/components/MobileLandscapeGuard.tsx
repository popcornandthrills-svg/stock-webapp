"use client";

import { useEffect, useState } from "react";

function canUseLandscapeLock() {
  if (typeof window === "undefined") return false;
  const orientation = window.screen?.orientation as ScreenOrientation & { lock?: unknown } | undefined;
  return Boolean(orientation && typeof orientation.lock === "function");
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 980px)").matches || window.matchMedia("(pointer: coarse)").matches;
}

function isPortrait() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(orientation: portrait)").matches;
}

export function MobileLandscapeGuard() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateState = () => {
      const mobile = isMobileViewport();
      const portrait = isPortrait();
      setShowPrompt(mobile && portrait);
    };

    const tryLockLandscape = () => {
      if (!canUseLandscapeLock()) return;
      const orientation = window.screen.orientation as ScreenOrientation & { lock: (mode: string) => Promise<void> };
      orientation.lock("landscape").catch(() => {
        // The browser may require a user gesture or fullscreen. We still fall back to the prompt.
      });
    };

    updateState();
    tryLockLandscape();

    window.addEventListener("resize", updateState);
    window.addEventListener("orientationchange", updateState);
    return () => {
      window.removeEventListener("resize", updateState);
      window.removeEventListener("orientationchange", updateState);
    };
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="landscape-overlay landscape-overlay-visible" role="alertdialog" aria-modal="true" aria-label="Rotate device">
      <div className="landscape-card">
        <div className="landscape-icon" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="landscape-copy">
          <h2>Rotate to landscape</h2>
          <p>This app is designed to open in landscape on mobile so the inventory table and actions stay visible.</p>
        </div>
      </div>
    </div>
  );
}
