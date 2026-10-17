import { test, expect } from '@playwright/test';
test('public pages and failed-link recovery work on desktop and mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /A little less/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.getByRole('link', { name: 'Get started' }).click();
    await expect(
      page.getByRole('heading', { name: 'Find your people.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    expect(await page.locator('input[type=tel]').count()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.goto('/sign-up/verify?__clerk_status=client_mismatch');
    await expect(
      page.getByText('The previous email link could not be completed.', {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Account navigation' })
      .getByRole('link', { name: 'Sign in', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(
      page.getByRole('heading', { name: 'Forgot your password?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to sign-in' }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
