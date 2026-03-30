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
      <div className="mx-auto max-w-4xl px-6 py-20 space-y-10">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Support</p>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-heading)]">Support And Reporting</h1>
          <p className="text-sm text-white/45">
            Public launch support runs through GitHub until a dedicated support mailbox is added.
          </p>
        </div>

        <div className="grid gap-4">
          {supportLinks.map((item) => (
            <section
              key={item.title}
              id={item.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3"
            >
              <h2 className="text-xl font-semibold font-[family-name:var(--font-heading)]">{item.title}</h2>
              <p className="text-sm leading-7 text-white/75">{item.body}</p>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-sm text-white underline underline-offset-4"
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
