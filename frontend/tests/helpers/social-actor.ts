import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export type Actor = {
  context: BrowserContext;
  page: Page;
  email: string;
  clerkId: string;
  id: string;
};
export async function testToken() {
  const response = await fetch('https://api.clerk.com/v1/testing_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  expect(response.ok).toBeTruthy();
  return ((await response.json()) as { token: string }).token;
}
export async function createActor(
  browser: Browser,
  token: string,
  actors: Actor[],
) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 1000 },
    permissions: ['geolocation'],
    geolocation: { latitude: 28.6415, longitude: 77.3737 },
  });
  const page = await context.newPage();
  const actor: Actor = {
    context,
    page,
    email: `playzo-e2e+clerk_test_${randomBytes(5).toString('hex')}@example.com`,
    clerkId: '',
    id: '',
  };
  actors.push(actor);
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
  await page.goto('/sign-up');
  await page.getByLabel('First name').fill('Playzo');
  await page.getByLabel('Last name').fill('Test');
  await page.getByLabel('Email address').fill(actor.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill(`Q7!${randomBytes(18).toString('base64url')}`);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page.getByLabel('Email verification code').fill('424242');
  await page.getByRole('button', { name: 'Verify email and continue' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  actor.clerkId = await page.evaluate(
    () =>
      (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user.id,
  );
  await page.getByRole('radio', { name: 'Male', exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: /Join individually/ }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Full name').fill('Playzo Test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('PIN code').fill('201014');
  await page.getByLabel('Locality', { exact: true }).fill('Indirapuram');
  await page.getByLabel('City', { exact: true }).fill('Ghaziabad');
  await page.getByLabel('State', { exact: true }).fill('Uttar Pradesh');
  await page
    .getByRole('button', { name: 'Use my location', exact: true })
    .click();
  await expect(
    page.getByText('Location captured.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Badminton', exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  actor.id = await page.evaluate(async () => {
    const clerk = (
      window as unknown as {
        Clerk: { session: { getToken: () => Promise<string> } };
      }
    ).Clerk;
    const token = await clerk.session.getToken();
    const response = await fetch('http://localhost:8000/api/v1/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await response.json()).id;
  });
  return actor;
}
export async function removeActors(actors: Actor[]) {
  const headers = { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` };
  for (const actor of actors) {
    if (!actor.clerkId)
      actor.clerkId = await actor.page
        .evaluate(
          () =>
            (
              window as unknown as {
                Clerk?: {
                  user?: { id: string };
                  client?: { signUp?: { createdUserId: string } };
                };
              }
            ).Clerk?.user?.id ||
            (
              window as unknown as {
                Clerk?: { client?: { signUp?: { createdUserId: string } } };
              }
            ).Clerk?.client?.signUp?.createdUserId ||
            '',
        )
        .catch(() => '');
    await actor.context.close();
    if (!actor.clerkId) continue;
    const response = await fetch(
      `https://api.clerk.com/v1/users/${actor.clerkId}`,
      { headers },
    );
    const user = (await response.json()) as {
      email_addresses: { email_address: string }[];
    };
    expect(
      user.email_addresses.some((entry) => entry.email_address === actor.email),
    ).toBeTruthy();
    execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'api', 'python', '-', actor.clerkId],
      {
        cwd: resolve(process.cwd(), '..'),
        input: readFileSync('../backend/tests/cleanup_e2e.py'),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    expect(
      (
        await fetch(`https://api.clerk.com/v1/users/${actor.clerkId}`, {
          method: 'DELETE',
          headers,
        })
      ).ok,
    ).toBeTruthy();
  }
}
