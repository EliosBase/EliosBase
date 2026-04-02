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
