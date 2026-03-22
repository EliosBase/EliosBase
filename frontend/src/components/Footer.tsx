import Image from "next/image";
import { Github, Twitter } from "lucide-react";

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
      { label: "GitHub", href: "#" },
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
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-white/6 py-16 px-6 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-5 gap-12 mb-12">
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
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors duration-200 text-white/50 hover:text-white cursor-pointer"
                aria-label="Twitter"
              >
                <Twitter size={18} />
              </a>
              <a
                href="#"
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors duration-200 text-white/50 hover:text-white cursor-pointer"
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
                      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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
