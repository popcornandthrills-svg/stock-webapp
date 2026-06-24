"use client";

import type { ReactNode } from "react";

type ContentContainerProps = {
  children: ReactNode;
};

export function ContentContainer({ children }: ContentContainerProps) {
  return <section className="content app-content-container">{children}</section>;
}
