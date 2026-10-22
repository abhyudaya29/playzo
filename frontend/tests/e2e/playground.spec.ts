import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

test('email-code signup, profile saving, and persistent workspace navigation', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),
    'Requires a Clerk development instance.',
  );
  test.skip(
    process.env.PLAYZO_E2E_CLEANUP !== '1',
    'Opt in to disposable-account tests with local Docker cleanup.',
  );
  const secret = process.env.CLERK_SECRET_KEY!;
  const headers = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };
  const testing = await fetch('https://api.clerk.com/v1/testing_tokens', {
    method: 'POST',
    headers,
  });
  expect(testing.ok).toBeTruthy();
  const { token } = (await testing.json()) as { token: string };
  const host = Buffer.from(
    process.env
      .NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!.split('_')
      .slice(2)
      .join('_'),
    'base64',
  )
    .toString()
    .replace(/\$$/, '');
  await context.route(`https://${host}/**`, (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('__clerk_testing_token', token);
    return route.continue({ url: url.toString() });
  });
  const suffix = randomBytes(5).toString('hex');
  const email = `playzo-e2e+clerk_test_${suffix}@example.com`;
  const password = `Q7!${randomBytes(18).toString('base64url')}`;
  let clerkId = '';
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  let failProfile = true;
  await context.route(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/users/me`,
    (route) => {
      if (failProfile && route.request().method() === 'GET') {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Temporary profile service failure' }),
        });
      }
      return route.continue();
    },
  );
  try {
    await page.goto('/sign-up');
    await page.getByLabel('First name').fill('Playzo');
    await page.getByLabel('Last name').fill('Test');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const verification = page.waitForRequest(
      (request) =>
        request.url().includes('prepare_verification') &&
        request.method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    expect((await verification).postData()).toContain('email_code');
    await expect(
      page.getByRole('heading', { name: 'Check your inbox.' }),
    ).toBeVisible();
    await page.getByLabel('Email verification code').fill('424242');
    await page
      .getByRole('button', { name: 'Verify email and continue' })
      .click();
    await expect(page).toHaveURL(/\/onboarding$/);
    clerkId = await page.evaluate(
      () =>
        (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user
          .id,
    );
    await expect(
      page.getByText('Temporary profile service failure'),
    ).toBeVisible();
    failProfile = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('radio', { name: 'Male', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('radio', { name: /Join individually/ }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('Playzo Test');
    await page.getByLabel('Phone number (optional)').fill('98765 43210');
    await page.getByLabel('Nickname (optional)').fill('Court Captain');
    await page.getByLabel('Age (optional)', { exact: true }).fill('28');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('PIN code').fill('201014');
    await page.getByLabel('Locality', { exact: true }).fill('Indirapuram');
    await page.getByLabel('City', { exact: true }).fill('Ghaziabad');
    await page.getByLabel('State', { exact: true }).fill('Uttar Pradesh');
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 28.6415, longitude: 77.3737 });
    await page
      .getByRole('button', { name: 'Use my location', exact: true })
      .click();
    await expect(
      page.getByText('Location captured.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByRole('checkbox', { name: 'Badminton', exact: true })
      .check();
    await page.getByRole('radio', { name: 'Pro', exact: true }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page
      .getByRole('button', { name: 'Making a comeback', exact: true })
      .click();
    await page.getByLabel('Languages you speak (optional)').fill('Hindi');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page
      .getByRole('button', { name: 'Review my profile', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your player profile, all together.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Playzo Test');
    await expect(page.getByLabel('Locality', { exact: true })).toHaveValue(
      'Indirapuram',
    );
    await expect(
      page.getByRole('radio', { name: 'Pro', exact: true }),
    ).toBeChecked();
    const discover = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/discover/players?') &&
        response.request().method() === 'GET',
    );
    const save = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/users/me/onboarding') &&
        response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
    expect((await save).status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: /Find your next game, Playzo/ }),
    ).toBeVisible();
    expect((await discover).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Players near you', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .evaluate((element) =>
        element.setAttribute('data-persistent-test', 'yes'),
      );
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Your profile' })
      .click();
    await expect(page.getByLabel('Nickname (optional)')).toHaveValue(
      'Court Captain',
    );
    await expect(
      page.getByLabel('Age (optional)', { exact: true }),
    ).toHaveValue('28');
    await expect(
      page.getByRole('button', { name: 'Making a comeback', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Remove Hindi', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Pro', exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel('Phone number (optional)')).toHaveValue(
      '+919876543210',
    );
    await expect(page.getByLabel('Locality', { exact: true })).toHaveValue(
      'Indirapuram',
    );
    await expect(
      page.getByRole('checkbox', { name: 'Badminton', exact: true }),
    ).toBeChecked();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Communities' })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toHaveAttribute('data-persistent-test', 'yes');
    await page
      .getByRole('button', { name: 'Create community', exact: true })
      .click();
    await page.getByLabel('Community name').fill(`E2E community ${suffix}`);
    await page
      .getByLabel('About your community')
      .fill('Disposable browser test community.');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create community', exact: true })
      .click();
    await expect(
      page.getByText(`E2E community ${suffix}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Games', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Host a game', exact: true })
      .first()
      .click();
    await page.getByLabel('Game title').fill(`E2E game ${suffix}`);
    await page.getByLabel('Venue', { exact: true }).fill('Test court');
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    await page
      .getByLabel('Date and time')
      .fill(tomorrow.toISOString().slice(0, 16));
    await page
      .getByRole('button', { name: 'Publish game', exact: true })
      .click();
    await expect(
      page.getByText(`E2E game ${suffix}`, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('games-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Profile' })
      .click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel('Full name')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath('profile-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.evaluate(async () => {
      await (
        window as unknown as { Clerk: { signOut: () => Promise<void> } }
      ).Clerk.signOut();
    });
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Clerk can require a fresh email code for Device Trust.
    await page
      .waitForURL(/\/dashboard$/, { timeout: 10000 })
      .catch(async () => {
        await page.getByLabel('Email verification code').fill('424242');
        await page
          .getByRole('button', { name: 'Verify and sign in', exact: true })
          .click();
      });
    await expect(page).toHaveURL(/\/dashboard$/);
    // Exercise the custom reset-code flow as well as ordinary password login.
    await page.evaluate(async () => {
      await (
        window as unknown as { Clerk: { signOut: () => Promise<void> } }
      ).Clerk.signOut();
    });
    await page.goto('/sign-in');
    await page
      .getByRole('button', { name: 'Forgot password?', exact: true })
      .click();
    await page.getByLabel('Email address').fill(email);
    await page
      .getByRole('button', { name: 'Send reset code', exact: true })
      .click();
    await page.getByLabel('Email verification code').fill('424242');
    await page
      .getByLabel('New password', { exact: true })
      .fill(`Z9!${randomBytes(18).toString('base64url')}`);
    await page
      .getByRole('button', { name: 'Reset password', exact: true })
      .click();
    await page
      .waitForURL(/\/dashboard$/, { timeout: 10000 })
      .catch(async () => {
        await page.getByLabel('Email verification code').fill('424242');
        await page
          .getByRole('button', { name: 'Verify and sign in', exact: true })
          .click();
      });
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(consoleErrors).toEqual([]);
  } finally {
    if (!clerkId)
      clerkId = await page
        .evaluate(() => {
          const clerk = (
            window as unknown as {
              Clerk?: {
                user?: { id: string };
                client?: { signUp?: { createdUserId: string } };
              };
            }
          ).Clerk;
          return clerk?.user?.id || clerk?.client?.signUp?.createdUserId || '';
        })
        .catch(() => '');
    if (clerkId) {
      const accountResponse = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`,
        { headers },
      );
      const account = (await accountResponse.json()) as {
        email_addresses: { email_address: string }[];
      };
      expect(
        account.email_addresses.some((item) => item.email_address === email),
      ).toBeTruthy();
      execFileSync(
        'docker',
        ['compose', 'exec', '-T', 'api', 'python', '-', clerkId],
        {
          cwd: resolve(process.cwd(), '..'),
          input: readFileSync(
            resolve(process.cwd(), '../backend/tests/cleanup_e2e.py'),
          ),
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      const deleted = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`,
        { method: 'DELETE', headers },
      );
      expect(deleted.ok).toBeTruthy();
    }
  }
});
