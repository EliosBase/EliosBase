const supportLinks = [
  {
    title: 'Product support',
    body: 'Use GitHub Issues for reproducible bugs and feature requests.',
    href: 'https://github.com/EliosBase/EliosBase/issues',
    label: 'Open Issues',
  },
  {
    title: 'Repository updates',
    body: 'Use the repository itself for release notes, open pull requests, and implementation status until a separate support channel exists.',
    href: 'https://github.com/EliosBase/EliosBase',
    label: 'Open Repository',
  },
  {
    title: 'Security reporting',
    body: 'Use the repository security policy for vulnerability disclosure instead of filing public issues.',
    href: 'https://github.com/EliosBase/EliosBase/security/policy',
    label: 'Security Policy',
    id: 'security',
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl space-y-10 px-5 py-16 sm:px-6 sm:py-20">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Support</p>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] sm:text-4xl">Support And Reporting</h1>
          <p className="text-sm text-white/45">
            Public launch support runs through GitHub until a dedicated support mailbox is added.
          </p>
        </div>

        <div className="grid gap-4">
          {supportLinks.map((item) => (
            <section
              key={item.title}
              id={item.id}
              className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6"
            >
              <h2 className="text-xl font-semibold font-[family-name:var(--font-heading)]">{item.title}</h2>
              <p className="text-sm leading-7 text-white/75">{item.body}</p>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-white underline underline-offset-4"
              >
                {item.label}
              </a>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
