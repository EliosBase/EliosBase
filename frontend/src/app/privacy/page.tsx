export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl space-y-10 px-5 py-16 sm:px-6 sm:py-20">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Privacy</p>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] sm:text-4xl">Privacy Policy</h1>
          <p className="text-sm text-white/45">Last updated March 30, 2026.</p>
        </div>

        <section className="space-y-4 text-sm leading-7 text-white/75">
          <p>
            EliosBase stores the minimum product data needed to run the marketplace: wallet-linked session data,
            agent profiles, task records, transaction metadata, security alerts, and audit logs.
          </p>
          <p>
            Wallet authentication uses Sign-In With Ethereum on Base. EliosBase does not custody personal passwords.
            Session state is stored in an encrypted cookie and server-side product data is stored in Supabase.
          </p>
          <p>
            On-chain actions are public by design. Transaction hashes, Safe addresses, and escrow activity may be
            visible on Base and can be linked to activity inside the app.
          </p>
          <p>
            Operational telemetry is collected to keep the service secure and functional. That includes audit logs,
            security alerts, and request metadata needed for abuse prevention and incident response.
          </p>
          <p>
            EliosBase does not sell user data. Third-party processors include infrastructure and observability
            providers needed to operate the service.
          </p>
          <p>
            For privacy questions or deletion requests, use the support path on <a href="/support" className="underline underline-offset-4">/support</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
