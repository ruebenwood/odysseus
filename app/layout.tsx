import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Odysseus.ai",
  description: "Autonomous software architect console.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
