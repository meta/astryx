// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit LinkProvider

/**
 * @file LinkProviderAudit.a11y.chromium.spec.ts
 * @input Exact-head Link pattern story with a router LinkProvider, across modes and direction
 * @output Screenshots and fail-closed sensor receipts for the LinkProvider whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a LinkProvider audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('link-provider-audit-evidence');
const VIEWPORT = {width: 640, height: 400};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';

type AuditCase = {
  key: string;
  mode: Mode;
  direction: Direction;
};

const cases: AuditCase[] = [
  {key: 'provider-router-light', mode: 'light', direction: 'ltr'},
  {key: 'provider-router-dark', mode: 'dark', direction: 'ltr'},
  {key: 'provider-router-rtl-light', mode: 'light', direction: 'rtl'},
];

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=a11y-link-pattern--provider-router&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(40);
}

async function observe(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#storybook-root') as Element;
    const link = root.querySelector('[data-a11y-link]');
    const rect = link?.getBoundingClientRect();
    return {
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      fonts: document.fonts.status,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      nextSibling: link?.nextElementSibling?.textContent ?? null,
      link:
        link == null
          ? null
          : {
              tag: link.tagName.toLowerCase(),
              router: link.hasAttribute('data-a11y-link-router'),
              href: link.getAttribute('href'),
              to: link.getAttribute('to'),
              classes: Array.from(link.classList).filter(name =>
                name.startsWith('astryx-'),
              ),
              text: link.textContent,
              direction: getComputedStyle(link).direction,
              focused: document.activeElement === link,
              box:
                rect == null ? null : {width: rect.width, height: rect.height},
            },
      navigations:
        (window as Window & {__a11yLinkNavigations?: number})
          .__a11yLinkNavigations ?? 0,
      location: location.pathname,
    };
  });
}

test.beforeAll(async () => {
  fs.mkdirSync(OUTPUT, {recursive: true});
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expected = process.env.ASTRYX_HEAD_SHA;
  if (expected && expected !== checkoutSha) {
    throw new Error(
      `checkout ${checkoutSha} does not match expected head ${expected}`,
    );
  }
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const response = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!response.ok) {
    throw new Error(`Storybook build has no SHA stamp (${response.status})`);
  }
  storybookSha = (await response.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      `Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
    );
  }
});

test.afterAll(async () => {
  await server?.close();
});

for (const item of cases) {
  test(item.key, async ({browser}) => {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(String(error)));
      await page.goto(storyUrl(item), {waitUntil: 'load'});
      await page.locator('#storybook-root [data-a11y-link]').waitFor();
      await settle(page);
      const rest = await observe(page);

      // A keyboard user reaches the router link and activates it; the router
      // takes over the navigation and the page stays where it is.
      await page.keyboard.press('Tab');
      await settle(page);
      const focused = await observe(page);
      const name = await page.getByRole('link', {name: 'Projects'}).count();
      await page.keyboard.press('Enter');
      await settle(page);
      const activated = await observe(page);

      const failures: string[] = [];
      const check = (condition: boolean, message: string) => {
        if (!condition) {
          failures.push(message);
        }
      };
      check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
      check(!rest.storybookError, 'storybook error display');
      check(rest.mode === item.mode, `mode ${rest.mode}`);
      check(rest.dpr === 2, `dpr ${rest.dpr}`);
      check(rest.fonts === 'loaded', `fonts ${rest.fonts}`);
      check(rest.nextSibling === 'After', `next sibling ${rest.nextSibling}`);
      check(rest.link != null, 'no link');
      if (rest.link != null) {
        check(rest.link.tag === 'a', `link element ${rest.link.tag}`);
        check(rest.link.router, 'the provider component did not render');
        check(rest.link.href === '/projects', `href ${rest.link.href}`);
        check(rest.link.to === '/projects', `to ${rest.link.to}`);
        check(
          JSON.stringify(rest.link.classes) === '["astryx-link"]',
          `targets ${rest.link.classes.join(' ')}`,
        );
        check(
          rest.link.direction === item.direction,
          `direction ${rest.link.direction}`,
        );
      }
      check(name === 1, `${name} links named Projects`);
      check(focused.link?.focused === true, 'Tab did not reach the link');
      check(
        activated.navigations === rest.navigations + 1,
        `router navigations ${rest.navigations} -> ${activated.navigations}`,
      );
      check(
        activated.location === rest.location,
        `page navigated to ${activated.location}`,
      );

      const screenshot = await page
        .locator('#storybook-root')
        .screenshot({animations: 'disabled'});
      const screenshotPath = path.join(OUTPUT, `${item.key}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      const receipt = {
        component: 'LinkProvider',
        build: storybookSha,
        checkout: checkoutSha,
        story: 'a11y-link-pattern--provider-router',
        mode: item.mode,
        direction: item.direction,
        viewport: VIEWPORT,
        pageErrors,
        screenshot: {
          file: path.basename(screenshotPath),
          sha256: createHash('sha256').update(screenshot).digest('hex'),
        },
        observed: {rest, focused, activated},
        passed: failures.length === 0,
        failures,
      };
      fs.writeFileSync(
        path.join(OUTPUT, `${item.key}.json`),
        `${JSON.stringify(receipt, null, 2)}\n`,
      );
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
