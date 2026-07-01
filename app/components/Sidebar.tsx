"use client";

import { useEffect, useState } from "react";

type SidebarProps = {
  activeTab: string;
  userName: string;
  branchName: string;
  role: string;
  onNavigate: (tab: string) => void;
  onLogout?: () => void;
};

const tabs = [
  "inventory",
  "stock-movement",
  "sales-load",
  "moves",
  "admin-panel",
];

const tabLabels: Record<string, string> = {
  inventory: "Inventory",
  "sales-load": "Sales Load",
  "stock-movement": "Stock Movement",
  moves: "Moves",
  "admin-panel": "Admin Panel",
};

function resolveTab(tab: string) {
  return tab;
}

function isActiveTab(activeTab: string, tab: string) {
  return activeTab === tab;
}

export function Sidebar({ activeTab, userName, branchName, role, onNavigate, onLogout }: SidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".mobile-nav") && !target?.closest(".mobile-nav-summary")) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const handleMobileNavigate = (tab: string) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
  };

  const handleMobileLogout = () => {
    setMobileMenuOpen(false);
    onLogout?.();
  };

  return (
    <aside className="stock-sidebar">
      <div className="brand-row">
        <div>
          <div className="eyebrow">Stock Webapp</div>
          <h1>GOLDPRINCE</h1>
        </div>
      </div>
      <div className="meta-block">
        <div>{role === "admin" ? "Admin Access" : "Dashboard Access"}</div>
        <div className="meta-subline">{userName || "Signed in user"} | {branchName || "All branches"}</div>
      </div>
      <nav className="tab-list desktop-nav" aria-label="Primary">
        {tabs.map((tab) => (
          tab === "admin-panel" && role !== "admin" ? null : (
          <button key={tab} type="button" className={isActiveTab(activeTab, tab) ? "tab active" : "tab"} onClick={() => onNavigate(resolveTab(tab))}>
            {tabLabels[tab] || tab.replace("-", " ")}
          </button>
          )
        ))}
      </nav>
      {onLogout ? (
        <button className="tab logout desktop-logout" type="button" onClick={onLogout}>
          Log Out
        </button>
      ) : null}
      <button
        className="mobile-nav-summary"
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((value) => !value)}
      >
        <span className="mobile-nav-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {mobileMenuOpen ? <button className="mobile-nav-backdrop" type="button" aria-hidden="true" onClick={() => setMobileMenuOpen(false)} /> : null}
      <div className="mobile-nav">
        <nav className={`tab-list mobile-nav-list ${mobileMenuOpen ? "open" : ""}`} aria-label="Primary mobile">
          {tabs.map((tab) => (
            tab === "admin-panel" && role !== "admin" ? null : (
              <button key={tab} type="button" className={isActiveTab(activeTab, tab) ? "tab active" : "tab"} onClick={() => handleMobileNavigate(resolveTab(tab))}>
                {tabLabels[tab] || tab.replace("-", " ")}
              </button>
            )
          ))}
          {onLogout ? (
            <button className="tab logout" type="button" onClick={handleMobileLogout}>
              Log Out
            </button>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
