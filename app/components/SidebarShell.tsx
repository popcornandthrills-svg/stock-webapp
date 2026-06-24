"use client";

type SidebarShellProps = {
  active: "billing" | "sales-report" | "sales-due" | "returns" | "inventory" | "moves" | "stock-transfer" | "sales-load" | "analytics" | "managers" | "audit";
  onLogout: () => void;
  onNavigate?: (view: "billing" | "sales-report" | "sales-due" | "returns" | "inventory" | "moves" | "stock-transfer" | "sales-load" | "analytics" | "managers" | "audit") => void;
};
export function SidebarShell({ active, onLogout, onNavigate }: SidebarShellProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="gold-mark">G</div>
        <div>
          <h1>GOLDPRINCE</h1>
          <p>JEWELL INDUSTRY INDIA PVT. LTD. | SINCE 1995</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-group">
          <span className="nav-label">SALES</span>
          <button className={`nav-item ${active === "billing" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("billing")}>Billing</button>
          <button className={`nav-item ${active === "sales-report" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("sales-report")}>Sales Report</button>
          <button className={`nav-item ${active === "sales-due" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("sales-due")}>Sales Due</button>
          <button className={`nav-item ${active === "returns" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("returns")}>Return</button>
        </div>

        <div className="nav-group">
          <span className="nav-label">STOCK</span>
          <button className={`nav-item ${active === "inventory" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("inventory")}>Inventory</button>
          <button className={`nav-item ${active === "stock-transfer" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("stock-transfer")}>Stock Movement</button>
          <button className={`nav-item ${active === "sales-load" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("sales-load")}>Sales Load</button>
          <button className={`nav-item ${active === "moves" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("moves")}>Moves</button>
          <button className={`nav-item ${active === "analytics" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("analytics")}>Stock Analytics</button>
        </div>

        <div className="nav-group">
          <span className="nav-label">SHOP MANAGERS</span>
          <button className={`nav-item ${active === "managers" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("managers")}>Manage SM's</button>
          <button className={`nav-item ${active === "audit" ? "active" : ""}`} type="button" onClick={() => onNavigate?.("audit")}>Audit Log</button>
        </div>

        <button className="nav-item logout" onClick={onLogout} type="button">
          Log Out
        </button>
      </nav>
    </aside>
  );
}
