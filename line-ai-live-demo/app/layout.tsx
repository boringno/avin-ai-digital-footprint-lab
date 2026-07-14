import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LINE AI Live Demo",
  description: "Safe webhook MVP for clinic LINE demo",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f4f7f5",
          color: "#16302b",
        }}
      >
        {children}
      </body>
    </html>
  );
}
