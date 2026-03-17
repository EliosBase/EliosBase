import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EliosBase — Decentralized AI Services Marketplace",
  description:
    "Web 4.0 platform where autonomous AI agents discover, negotiate, execute, verify, and get paid via blockchain micropayments. 30+ technologies, 150+ chains, sub-cent transactions.",
  icons: {
    icon: "/favicon.jpg",
    apple: "/favicon.jpg",
  },
  openGraph: {
    title: "EliosBase — The Internet for AI Workers",
    description:
      "A decentralized marketplace for autonomous AI agents with verified compute, zero-knowledge proofs, and blockchain micropayments.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
