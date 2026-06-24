"use client";

import type { ReactNode } from "react";
import { ContentContainer } from "./ContentContainer";
import { FooterStatusBar } from "./FooterStatusBar";
import { Header } from "./Header";
import { MobileLandscapeGuard } from "./MobileLandscapeGuard";
import { Sidebar } from "./Sidebar";

type AppLayoutProps = {
  activeTab: string;
  userName: string;
  branchName: string;
  role: string;
  status?: string;
  onNavigate: (tab: string) => void;
  onLogout?: () => void;
  children: ReactNode;
};

export function AppLayout({ activeTab, userName, branchName, role, status, onNavigate, onLogout, children }: AppLayoutProps) {
  return (
    <main className="app-shell stock-shell stock-shell--premium">
      <MobileLandscapeGuard />
      <Sidebar
        activeTab={activeTab}
        userName={userName}
        branchName={branchName}
        role={role}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <ContentContainer>
        <Header />
        <section className="app-content-body">{children}</section>
        <FooterStatusBar status={status} />
      </ContentContainer>
    </main>
  );
}
