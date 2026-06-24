"use client";

import React, { type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

function normalizeError(value: unknown) {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  if (typeof Event !== "undefined" && value instanceof Event) return new Error(`Unexpected ${value.type || "browser"} event`);
  try {
    return new Error(typeof value === "object" ? JSON.stringify(value) : String(value));
  } catch {
    return new Error(Object.prototype.toString.call(value));
  }
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: Error) {
    console.error("App runtime error", normalizeError(error));
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
          <h1 style={{ margin: "0 0 12px" }}>Application error</h1>
          <pre style={{ whiteSpace: "pre-wrap", color: "#a00", background: "#fff3f3", padding: 16, borderRadius: 8 }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
