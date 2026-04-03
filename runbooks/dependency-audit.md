# Dependency Audit Triage

## Ship Bar

- Zero high or critical advisories in production dependencies.
- Dev-only advisories are tracked separately and do not block production sign-off unless they cross into shipped runtime paths.

## Current Production Position

- `validate` now enforces `npm audit --omit=dev --audit-level=high`.
- The unused `@metamask/connect-evm` runtime dependency has been removed.
- Remaining production findings are moderate only.

## Accepted Moderate Findings

- `frog` pulls a Vite / esbuild advisory chain tied to development-server behavior, not the shipped Next.js runtime.
- Keep that tracked until the upstream package can be upgraded cleanly without breaking frame routes.

## Dev-Only Wallet Tooling

- The remaining high advisories in a full `npm audit` are concentrated in Synpress and its browser-wallet test stack.
- That tooling is used for copied-profile local wallet automation, not the production serving path.
