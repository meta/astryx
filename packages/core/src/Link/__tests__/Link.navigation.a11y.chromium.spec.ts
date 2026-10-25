// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Link.navigation.a11y.chromium.spec.ts
 * @input Built Storybook navigation fixture and real Chromium activation
 * @output Blocked-scheme and accepted-navigation evidence across every sink
 * @position Browser proof for the shared navigation-destination contract
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
const storyId = 'core-link-navigation--destinations';

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page, href: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
  );
  await expect(page.getByTestId('navigation-fixture')).toBeVisible();
  await page.evaluate(
    ({storyId, href}) => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: {
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      channel.emit('updateStoryArgs', {storyId, updatedArgs: {href}});
    },
    {storyId, href},
  );
  await expect(page.getByTestId('navigation-fixture')).toHaveAttribute(
    'data-destination',
    href,
  );
}

const blocked = [
  'javascript:window.__navigationExecuted=true',
  'vbscript:MsgBox(1)',
  'data:text/html,<script>window.__navigationExecuted=true</script>',
  ' \u0000JaVa\tsCrIpT:window.__navigationExecuted=true',
];

for (const href of blocked) {
  test(`rejected ${JSON.stringify(href)} is inert across native, router, Markdown, and imperative paths`, async ({
    page,
    context,
  }) => {
    await mount(page, href);
    const originalUrl = page.url();
    await page.evaluate(() => {
      (
        window as unknown as {__navigationExecuted: boolean}
      ).__navigationExecuted = false;
    });
    const pagesBefore = context.pages().length;
    for (const id of [
      'native',
      'provider',
      'as',
      'structured',
      'citation',
      'download',
    ]) {
      const target = page.getByTestId(id);
      await expect(target).not.toHaveAttribute('href');
      await expect(target).not.toHaveAttribute('data-router');
      await target.click();
      await target.click({button: 'middle'});
    }
    await expect(page.getByTestId('markdown').locator('a')).toHaveCount(0);
    await expect(page.getByTestId('delegated').locator('a[href]')).toHaveCount(
      0,
    );
    for (const id of ['imperative', 'imperative-blank', 'delegated']) {
      const target =
        id === 'delegated'
          ? page.getByText('Delegated card surface', {exact: true})
          : page.getByTestId(id);
      await target.click();
      await target.click({modifiers: ['Control']});
      await target.click({modifiers: ['Meta']});
      await target.click({button: 'middle'});
    }
    // Drain browser activation tasks before checking that no sink fired.
    await page.evaluate(
      async () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(page.url()).toBe(originalUrl);
    expect(context.pages()).toHaveLength(pagesBefore);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as {__navigationExecuted: boolean})
            .__navigationExecuted,
      ),
    ).toBe(false);
  });
}

test('ordinary schemes keep native attributes, custom routing, and downloads', async ({
  page,
}) => {
  for (const href of [
    '#fragment',
    '/relative',
    'https://example.com/docs',
    'http://example.com/docs',
    'mailto:a@example.com',
    'tel:+1234567890',
    'custom:document',
    'data:text/plain,download',
  ]) {
    await mount(page, href);
    for (const id of [
      'native',
      'provider',
      'as',
      'structured',
      'citation',
      'download',
    ]) {
      await expect(page.getByTestId(id)).toHaveAttribute('href', href);
    }
    for (const id of ['provider', 'as', 'structured']) {
      await expect(page.getByTestId(id)).toHaveAttribute('data-router', 'true');
    }
    await expect(page.getByTestId('download')).toHaveAttribute(
      'download',
      'note.txt',
    );
    await expect(page.getByTestId('markdown').locator('a')).toHaveAttribute(
      'href',
      href,
    );
  }
});

for (const id of [
  'native',
  'provider',
  'as',
  'structured',
  'imperative',
  'delegated',
]) {
  test(`${id} retains real same-tab navigation`, async ({page}) => {
    const href = '/navigation-destination?source=' + id;
    await page.route('**/navigation-destination?*', async route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Destination reached</h1>',
      }),
    );
    await mount(page, href);
    const target =
      id === 'delegated'
        ? page.getByText('Delegated card surface', {exact: true})
        : page.getByTestId(id);
    await target.click();
    await expect(page).toHaveURL(`${storybook.origin}${href}`);
    await expect(
      page.getByRole('heading', {name: 'Destination reached'}),
    ).toBeVisible();
  });
}

for (const activation of ['blank', 'control', 'meta', 'middle'] as const) {
  test(`imperative ${activation} retains real new-tab navigation`, async ({
    page,
    context,
  }) => {
    const href = `${storybook.origin}/navigation-destination?source=${activation}`;
    await context.route('**/navigation-destination?*', async route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Destination reached</h1>',
      }),
    );
    await mount(page, href);
    const originalUrl = page.url();
    const opened = context.waitForEvent('page');
    await page
      .getByTestId(activation === 'blank' ? 'imperative-blank' : 'imperative')
      .click({
        button: activation === 'middle' ? 'middle' : 'left',
        modifiers:
          activation === 'control'
            ? ['Control']
            : activation === 'meta'
              ? ['Meta']
              : [],
      });
    const popup = await opened;
    await expect(popup).toHaveURL(href);
    await expect(
      popup.getByRole('heading', {name: 'Destination reached'}),
    ).toBeVisible();
    expect(page.url()).toBe(originalUrl);
    await popup.close();
  });
}

test('native anchors retain real downloads and same-document fragments', async ({
  page,
}) => {
  await mount(page, 'data:text/plain,download');
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('download').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('note.txt');
  expect(await download.failure()).toBeNull();
  await mount(page, '#destination');
  await page.getByTestId('native').click();
  await expect(page).toHaveURL(/#destination$/);
});

test('native anchors retain real middle-click and external target navigation', async ({
  page,
  context,
}) => {
  const href = 'https://example.com/navigation-destination';
  await context.route(href, async route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>External destination</h1>',
    }),
  );
  for (const id of ['native', 'citation']) {
    await mount(page, href);
    const opened = context.waitForEvent('page');
    await page
      .getByTestId(id)
      .click({button: id === 'native' ? 'middle' : 'left'});
    const popup = await opened;
    await expect(popup).toHaveURL(href);
    await expect(
      popup.getByRole('heading', {name: 'External destination'}),
    ).toBeVisible();
    await popup.close();
  }
});
