import { spawn } from 'node:child_process';

const wallets = ['coinbase', 'metamask', 'phantom'];

function runWallet(wallet) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['--yes', 'tsx', 'scripts/wallet-e2e-run.ts', wallet],
      {
        stdio: 'inherit',
        env: process.env,
      },
    );

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      reject(new Error(`${wallet} wallet E2E failed (${details})`));
    });
  });
}

for (const wallet of wallets) {
  console.log(`\n== ${wallet} ==`);
  await runWallet(wallet);
}
