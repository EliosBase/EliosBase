# Wallet E2E Harness

This is the working wallet Playwright setup. It uses a cold copy of a real local Google Chrome profile with the wallet extensions already installed.

Do not replace this with Chrome for Testing, Playwright-managed Chromium profiles, or automation against the live Chrome profile.

## Non-negotiables

- Use the system Chrome app at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Copy from `$HOME/Library/Application Support/Google/Chrome`, then attach Playwright to the copied profile over CDP.
- Close Google Chrome before starting a run. The harness will fail fast if Chrome is still running.
- Keep the app flow on the AppKit modal path:
  - app `Connect Wallet`
  - `w3m-modal`
  - wallet selection in the modal
  - extension chooser if Phantom asks which extension to use
  - wallet popup or notification approval
  - SIWE verify request
- Do not point automation at the live `Default` or `Profile *` directories.

## Entry points

- Stable wallet runner: `scripts/wallet-e2e-run.ts`
- Stable wallet suite: `scripts/wallet-e2e-suite.mjs`
- Harness helpers: `e2e-wallet/support/synpressWallets.ts`
- Wallet Playwright config: `playwright.wallet.config.ts`
- MetaMask flow: `e2e-wallet/metamask.spec.ts`
- Phantom flow: `e2e-wallet/phantom.spec.ts`
- Coinbase flow: `e2e-wallet/coinbase.spec.ts`

## Scripts

- `npm run e2e:wallet:doctor`
  - Checks the real Chrome executable, candidate profiles, and installed wallet extensions.
- `npm run e2e:wallet:cleanup`
  - Kills orphaned copied-profile Chrome processes and removes wallet test scratch directories.
- `npm run e2e:wallet:metamask`
- `npm run e2e:wallet:phantom`
- `npm run e2e:wallet:coinbase`
- `npm run e2e:wallet`
  - Runs the stable copied-profile suite by invoking the wallet runner sequentially for Coinbase, MetaMask, and Phantom.

## Required env

- `PLAYWRIGHT_METAMASK_PASSWORD`
- `PLAYWRIGHT_PHANTOM_PASSWORD`
- `PLAYWRIGHT_COINBASE_PASSWORD`

Optional:

- `PLAYWRIGHT_WALLET_DEBUG=1`
  - Keeps the extra wallet harness logging on.
- `PLAYWRIGHT_WALLET_CHROME_PROFILE="Profile 2"`
  - Pins the copied-profile harness to a specific real Chrome profile instead of auto-picking the newest candidate.
- `PLAYWRIGHT_REOWN_PROJECT_ID`
  - Overrides the default Reown project id for wallet E2E.

## Known-good baseline

The preserved baseline is:

- copied real Chrome profile
- real installed wallet extensions
- AppKit modal selection
- Playwright attach over CDP

This is the setup that worked end to end.

Current known status in this branch:

- MetaMask: verified end to end on the copied-profile harness
- Phantom: verified end to end on the copied-profile harness
- Coinbase Wallet: verified end to end on the copied-profile harness

The script-driven runner is the authoritative path. The raw Playwright spec files are retained for lower-level debugging, but the stable verification command is `npm run e2e:wallet`.

If a wallet breaks, treat that as a regression in the copied-profile harness first. Do not switch to Chrome for Testing to paper over it.
