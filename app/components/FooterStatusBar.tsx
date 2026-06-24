"use client";

type FooterStatusBarProps = {
  status?: string;
};

export function FooterStatusBar({ status }: FooterStatusBarProps) {
  return <div className="footer-status-bar">{status || "Signed in as Admin"}</div>;
}
