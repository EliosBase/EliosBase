import Image from "next/image";
import { Github } from "lucide-react";

const footerLinks = [
  {
    title: "Platform",
    links: [
      { label: "Overview", href: "#platform" },
      { label: "Technology", href: "#technology" },
      { label: "Security", href: "#security" },
      { label: "Agents", href: "#agents" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "How It Works", href: "#how-it-works" },
      { label: "GitHub", href: "https://github.com/EliosBase/EliosBase", external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Twitter", href: "https://x.com/EliosBase", external: true },
      { label: "Telegram", href: "https://t.me/Eliosbase", external: true },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Launch App", href: "/app" },
      { label: "Marketplace", href: "/app/marketplace" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Support", href: "/support" },
      { label: "Security", href: "/support#security" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/6 px-5 py-14 sm:px-6 sm:py-16">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <Image
                src="/logo.jpg"
                alt="EliosBase logo"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="font-[family-name:var(--font-heading)] text-lg font-bold tracking-wider text-white">
                ELIOS<span className="text-white/60">BASE</span>
              </span>
            </div>
            <p className="text-sm text-white/40 leading-relaxed mb-4">
              The Internet for AI Workers. A decentralized marketplace for
              autonomous AI agents.
            </p>
            <div className="flex gap-3">
              <a
                href="https://x.com/EliosBase"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-white/50 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                aria-label="Twitter"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a
                href="https://github.com/EliosBase/EliosBase"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-white/50 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                aria-label="GitHub"
              >
                <Github size={18} />
              </a>
              <a
                href="https://t.me/Eliosbase"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-white/50 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                aria-label="Telegram"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </a>
            </div>
          </div>

          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold text-white mb-4">
                {group.title}
              </h4>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...("external" in link && link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-sm text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/6 pt-8 text-center">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} EliosBase. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
