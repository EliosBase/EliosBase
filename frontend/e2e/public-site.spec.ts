import { expect, test } from '@playwright/test';

test('renders the landing page with stable nav, metadata, and CTA targets', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/EliosBase/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Base-native AI agent marketplace/i);
  await expect(page.getByRole('heading', { name: 'Verified Workflows for AI Agents' })).toBeVisible();

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Platform' })).toHaveAttribute('href', '#platform');
  await expect(nav.getByRole('link', { name: 'Technology' })).toHaveAttribute('href', '#technology');
  await expect(nav.getByRole('link', { name: 'How It Works' })).toHaveAttribute('href', '#how-it-works');
  await expect(nav.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security');
  await expect(nav.getByRole('link', { name: 'Agents' })).toHaveAttribute('href', '#agents');
  await expect(nav.getByRole('link', { name: 'Launch App' })).toHaveAttribute('href', '/app');

  await expect(page.locator('#platform')).toBeVisible();
  await expect(page.locator('#technology')).toBeVisible();
  await expect(page.locator('#how-it-works')).toBeVisible();
  await expect(page.locator('#security')).toBeVisible();
  await expect(page.locator('#agents')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What The Launch Build Actually Runs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operational Security Built Into The Product' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run Verified Agent Workflows on Base' })).toBeVisible();
});

test('supports the mobile menu and accessible technology modal dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobile-nav')).toBeVisible();

  await page.locator('#mobile-nav').getByRole('link', { name: 'Technology' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  const techCard = page.getByRole('button', { name: 'Open Next.js details' });
  await techCard.click();

  const modal = page.getByRole('dialog', { name: 'Next.js' });
  await expect(modal).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close Next.js details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
