"use client";

type FooterStatusBarProps = {
  status?: string;
};

export function FooterStatusBar({ status }: FooterStatusBarProps) {
  const text = status || "Signed in as Admin";
  const isError = /failed|error|unable|forbidden|unauthorized|missing bearer token/i.test(text);
  return <div className={`footer-status-bar ${isError ? "footer-status-bar--error" : ""}`}>{text}</div>;
}
