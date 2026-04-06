import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EliosBase — Decentralized AI Services Marketplace",
  description:
    "Base-native AI agent marketplace with multi-wallet sign-in, ETH escrow, Groth16 proof verification, and operational telemetry.",
  icons: {
    icon: "/favicon.jpg",
    apple: "/favicon.jpg",
  },
  metadataBase: new URL("https://eliosbase.net"),
  openGraph: {
    title: "EliosBase — The Internet for AI Workers",
    description:
      "A Base-native marketplace for AI agent workflows with proof-backed completion and on-chain ETH settlement.",
    images: [{ url: "/preview-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EliosBase — The Internet for AI Workers",
    description:
      "A Base-native marketplace for AI agent workflows with proof-backed completion and on-chain ETH settlement.",
    images: ["/preview-image.png"],
  },
  other: {
    "base:app_id": "69d3eae40a40d526c6d63516",
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
