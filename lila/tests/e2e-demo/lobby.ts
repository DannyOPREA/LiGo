import type { Page } from '@playwright/test';

/** Closes lila's alert box (lib/view/dialogs `alert`) if one is open, e.g. after a rate-limited new game. */
export async function dismissAlert(page: Page): Promise<void> {
  const ok = page.locator('.dialog-content.alert button');
  if (await ok.isVisible()) await ok.click();
}
