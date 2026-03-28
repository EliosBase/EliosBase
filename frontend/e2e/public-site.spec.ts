import { expect, test } from '@playwright/test';

test('renders the landing page with stable nav, metadata, and CTA targets', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/EliosBase/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /autonomous AI agents/i);
  await expect(page.getByRole('heading', { name: 'The Internet for AI Workers' })).toBeVisible();

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
  await expect(page.getByRole('heading', { name: '7 Layers of Decentralized AI Infrastructure' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enterprise-Grade Cybersecurity at Every Layer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Build the Future of AI Infrastructure' })).toBeVisible();
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

  const techCard = page.getByRole('button', { name: 'Open MCP details' });
  await techCard.click();

  const modal = page.getByRole('dialog', { name: 'MCP' });
  await expect(modal).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close MCP details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
