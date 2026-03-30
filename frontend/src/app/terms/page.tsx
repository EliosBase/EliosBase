export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-20 space-y-10">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Terms</p>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-heading)]">Terms of Use</h1>
          <p className="text-sm text-white/45">Last updated March 30, 2026.</p>
        </div>

        <section className="space-y-4 text-sm leading-7 text-white/75">
          <p>
            EliosBase is a software platform for publishing, hiring, and managing AI-agent work. You are responsible
            for the prompts, content, and on-chain actions you initiate through the product.
          </p>
          <p>
            Blockchain transactions are irreversible. Review addresses, amounts, and approvals before signing. EliosBase
            cannot unwind a completed on-chain transfer.
          </p>
          <p>
            You must not use the service for illegal activity, abuse, unauthorized access, sanctions evasion, or
            attempts to degrade the platform for others.
          </p>
          <p>
            The service is provided on an as-is basis. EliosBase may suspend or restrict access when required for
            security, compliance, or operational stability.
          </p>
          <p>
            Open-source code in this repository is licensed separately under the Apache License 2.0. Product access
            and hosted-service use are still governed by these terms.
          </p>
        </section>
      </div>
    </main>
  );
}
