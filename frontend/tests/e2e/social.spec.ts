import { test, expect } from '@playwright/test';
import {
  Actor,
  createActor,
  removeActors,
  testToken,
} from '../helpers/social-actor';
test('players connect, accept, chat live, schedule a game, and approve a community request', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  test.skip(
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') ||
      process.env.PLAYZO_E2E_CLEANUP !== '1',
    'Requires opt-in local development accounts and Docker cleanup.',
  );
  const actors: Actor[] = [];
  const unique = Date.now().toString(36);
  try {
    const token = await testToken();
    const sender = await createActor(browser, token, actors);
    const receiver = await createActor(browser, token, actors);
    await sender.page.reload();
    const player = sender.page.locator(`[data-player-id="${receiver.id}"]`);
    await player.getByRole('button', { name: 'Connect', exact: true }).click();
    await sender.page
      .getByLabel('Introductory message (optional)')
      .fill(`Weekend badminton? ${unique}`);
    await sender.page
      .getByRole('button', { name: 'Send connection request', exact: true })
      .click();
    await expect(
      player.getByRole('button', { name: 'Requested', exact: true }),
    ).toBeVisible();
    await receiver.page.goto('/requests');
    await expect(
      receiver.page.getByText(`Weekend badminton? ${unique}`, { exact: true }),
    ).toBeVisible();
    await receiver.page
      .getByRole('button', { name: 'Accept & chat', exact: true })
      .click();
    await expect(receiver.page).toHaveURL(/\/messages\?conversation=/);
    await expect(
      receiver.page.getByText('Live updates', { exact: true }),
    ).toBeVisible();
    await player
      .getByRole('link', { name: 'Message', exact: true })
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(async () => {
        await sender.page.reload();
      });
    await sender.page
      .locator(`[data-player-id="${receiver.id}"]`)
      .getByRole('link', { name: 'Message', exact: true })
      .click();
    await expect(
      sender.page.getByText('Live updates', { exact: true }),
    ).toBeVisible();
    await sender.page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill(`Saturday at six? ${unique}`);
    await sender.page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      receiver.page
        .getByRole('log', { name: 'Message history' })
        .getByText(`Saturday at six? ${unique}`, { exact: true }),
    ).toBeVisible();
    await receiver.page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill(`Yes, let’s book a court. ${unique}`);
    await receiver.page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(
      sender.page
        .getByRole('log', { name: 'Message history' })
        .getByText(`Yes, let’s book a court. ${unique}`, { exact: true }),
    ).toBeVisible();
    await sender.page
      .getByRole('button', { name: 'Plan a game', exact: true })
      .click();
    await sender.page.getByLabel('Game title').fill(`Social game ${unique}`);
    await sender.page.getByLabel('Venue', { exact: true }).fill('Test court');
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    await sender.page
      .getByLabel('Date and time')
      .fill(tomorrow.toISOString().slice(0, 16));
    await sender.page
      .getByRole('button', { name: 'Create game & invite', exact: true })
      .click();
    await expect(sender.page.getByRole('dialog')).not.toBeVisible();
    await receiver.page.goto('/requests');
    const invite = receiver.page
      .locator('[data-slot="card"]')
      .filter({ hasText: `Social game ${unique}` });
    await invite
      .getByRole('button', { name: 'Accept & chat', exact: true })
      .click();
    await expect(receiver.page).toHaveURL(/\/messages\?conversation=/);
    await expect(
      receiver.page.getByRole('heading', {
        name: `Social game ${unique}`,
        exact: true,
      }),
    ).toBeVisible();
    await sender.page.goto('/groups');
    await sender.page
      .getByRole('button', { name: 'Create community', exact: true })
      .click();
    await sender.page
      .getByLabel('Community name')
      .fill(`Social community ${unique}`);
    await sender.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create community', exact: true })
      .click();
    await expect(sender.page.getByRole('dialog')).not.toBeVisible();
    await receiver.page.goto('/groups');
    const community = receiver.page
      .locator('[data-slot="card"]')
      .filter({ hasText: `Social community ${unique}` });
    await community
      .getByRole('button', { name: 'Request to join', exact: true })
      .click();
    await expect(
      community.getByRole('button', { name: 'Request pending', exact: true }),
    ).toBeVisible();
    await sender.page.goto('/requests');
    await sender.page
      .locator('[data-slot="card"]')
      .filter({ hasText: `Social community ${unique}` })
      .getByRole('button', { name: 'Accept & chat', exact: true })
      .click();
    await expect(
      sender.page.getByRole('heading', {
        name: `Social community ${unique}`,
        exact: true,
      }),
    ).toBeVisible();
    await receiver.page.goto('/groups');
    await receiver.page
      .locator('[data-slot="card"]')
      .filter({ hasText: `Social community ${unique}` })
      .getByRole('link', { name: 'Open community chat' })
      .click();
    await expect(
      receiver.page.getByRole('heading', {
        name: `Social community ${unique}`,
        exact: true,
      }),
    ).toBeVisible();
    await sender.page.goto(`/messages?player=${receiver.id}`);
    await expect(
      sender.page.getByRole('button', { name: 'Plan a game', exact: true }),
    ).toBeVisible();
    await sender.page.screenshot({
      path: testInfo.outputPath('private-chat-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await sender.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await sender.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const composer = await sender.page
      .getByRole('textbox', { name: 'Message', exact: true })
      .boundingBox();
    const mobileNavigation = await sender.page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .boundingBox();
    expect(
      composer &&
        mobileNavigation &&
        composer.y + composer.height <= mobileNavigation.y,
    ).toBeTruthy();
    await sender.page.screenshot({
      path: testInfo.outputPath('private-chat-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await receiver.page.goto(`/messages?player=${sender.id}`);
    await expect(
      receiver.page.getByText('Live updates', { exact: true }),
    ).toBeVisible();
    await sender.page
      .getByRole('button', { name: 'Block Playzo Test', exact: true })
      .click();
    await sender.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Block player', exact: true })
      .click();
    await expect(
      receiver.page.getByRole('heading', {
        name: 'This conversation isn’t available',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await removeActors(actors);
  }
});
