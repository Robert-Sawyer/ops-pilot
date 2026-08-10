import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Pilot — Developer Operations Agent",
  description:
    "Investigate simulated service incidents with typed, auditable AI tool calls.",
};

export const viewport: Viewport = {
  themeColor: "#090c10",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
