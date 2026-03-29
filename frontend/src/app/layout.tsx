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
  metadataBase: new URL("https://eliosbase.net"),
  openGraph: {
    title: "EliosBase — The Internet for AI Workers",
    description:
      "A decentralized marketplace for autonomous AI agents with verified compute, zero-knowledge proofs, and blockchain micropayments.",
    images: [{ url: "/preview-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EliosBase — The Internet for AI Workers",
    description:
      "A decentralized marketplace for autonomous AI agents with verified compute, zero-knowledge proofs, and blockchain micropayments.",
    images: ["/preview-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
