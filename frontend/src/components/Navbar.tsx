"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Platform", href: "#platform" },
  { label: "Technology", href: "#technology" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "Agents", href: "#agents" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={`fixed top-3 left-3 right-3 z-50 rounded-2xl transition-all duration-300 sm:top-4 sm:left-4 sm:right-4 ${
        scrolled || open ? "glass shadow-lg" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl pr-3 text-white transition-colors"
        >
          <Image
            src="/logo.jpg"
            alt="EliosBase logo"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="truncate font-[family-name:var(--font-heading)] text-base font-bold tracking-[0.24em] text-white sm:text-lg">
            ELIOS<span className="text-white/60">BASE</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-white/50 hover:text-white transition-colors duration-200 cursor-pointer"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          <Link
            href="/app"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors duration-200 cursor-pointer"
          >
            Launch App
          </Link>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/8 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="flex flex-col gap-2 border-t border-white/6 px-4 pb-4 pt-3 md:hidden sm:px-6">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-xl px-3 text-sm text-white/60 transition-colors duration-200 hover:bg-white/6 hover:text-white"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/app"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-2.5 text-center text-sm font-semibold text-black transition-colors duration-200 hover:bg-white/90"
          >
            Launch App
          </Link>
        </div>
      )}
    </nav>
  );
}
