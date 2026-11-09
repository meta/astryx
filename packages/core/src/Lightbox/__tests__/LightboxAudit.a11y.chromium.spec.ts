// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Lightbox

/**
 * @file LightboxAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Lightbox stories across themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the Lightbox whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Lightbox audit pull request
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

const OUTPUT = path.resolve('lightbox-audit-evidence');
const WIDE = {width: 1280, height: 800};
const NARROW = {width: 320, height: 640};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story = 'gallery-with-zoom' | 'default' | 'video';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

// The button each story opens the viewer with.
const OPENER: Record<Story, string> = {
  'gallery-with-zoom': 'Open gallery with zoom',
  default: 'Open lightbox',
  video: 'Open video',
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    direction?: Direction;
    modes?: Mode[];
    viewport?: {width: number; height: number};
    suffix?: string;
  } = {},
) {
  const theme = options.theme ?? 'neutral';
  const direction = options.direction ?? 'ltr';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, options.suffix ?? '', theme];
    if (direction === 'rtl') {
      parts.push('rtl');
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      mode,
      theme,
      direction,
      viewport: options.viewport ?? WIDE,
    });
  }
}

add('gallery-with-zoom');
add('gallery-with-zoom', {theme: 'butter', modes: ['light']});
add('gallery-with-zoom', {direction: 'rtl', modes: ['light']});
add('gallery-with-zoom', {
  suffix: 'narrow',
  modes: ['light'],
  viewport: NARROW,
});
add('default');
add('video', {modes: ['light']});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

// The stories' photos are remote. Each is replaced by one local picture, so
// every frame is the same on every run.
const PHOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#5b7f6a"/><rect x="0" y="520" width="1200" height="280" fill="#3d5a48"/><circle cx="900" cy="220" r="110" fill="#e9d8a6"/></svg>`;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-lightbox--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
  await page.waitForTimeout(60);
}

async function observe(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    function box(element: Element | null) {
      if (element == null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        top: round(rect.top),
        right: round(rect.right),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    const dialog = document.querySelector('dialog.astryx-lightbox');
    const isDisabled = (button: HTMLButtonElement) =>
      button.disabled || button.getAttribute('aria-disabled') === 'true';
    const buttonNamed = (name: string) =>
      Array.from(dialog?.querySelectorAll('button') ?? []).find(
        button => button.getAttribute('aria-label') === name,
      ) ?? null;
    const close = buttonNamed('Close');
    const previous = buttonNamed('Previous');
    const next = buttonNamed('Next');
    const zoom = dialog?.querySelector('[aria-pressed]') ?? null;
    const active = document.activeElement;
    const modalRegion = dialog?.querySelector(
      ':scope > [data-astryx-modal-live-region="polite"]',
    );
    const sharedRegion = document.querySelector(
      '[data-astryx-live-region="polite"]',
    );
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      fonts: document.fonts.status,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      dialog:
        dialog == null
          ? null
          : {
              isModal: dialog.matches(':modal'),
              name: dialog.getAttribute('aria-label'),
              targets: Array.from(dialog.classList).filter(name =>
                name.startsWith('astryx-'),
              ),
              direction: getComputedStyle(dialog).direction,
              box: box(dialog),
              text: (dialog as HTMLElement).innerText,
            },
      focusInside: dialog != null && active != null && dialog.contains(active),
      buttons: {
        close: close == null ? null : {box: box(close)},
        previous:
          previous == null
            ? null
            : {box: box(previous), disabled: isDisabled(previous)},
        next:
          next == null ? null : {box: box(next), disabled: isDisabled(next)},
      },
      zoomPressed: zoom?.getAttribute('aria-pressed') ?? null,
      video: dialog?.querySelector('video')?.hasAttribute('controls') ?? null,
      modalRegion: modalRegion?.textContent ?? null,
      sharedRegion: sharedRegion?.textContent ?? null,
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
      viewport: item.viewport,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route(/picsum\.photos/, async route =>
      route.fulfill({contentType: 'image/svg+xml', body: PHOTO}),
    );
    // The video is remote too; without it the frame shows the empty player.
    await page.route(/\.webm$/, async route => route.abort());
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.getByRole('button', {name: OPENER[item.story]}).click();
    await page.locator('dialog.astryx-lightbox[open]').waitFor();
    await settle(page);

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const frames: {state: string; file: string; sha256: string}[] = [];
    const observations: Record<string, unknown> = {};
    async function capture(state: string) {
      await settle(page);
      const png = await page.screenshot({animations: 'disabled'});
      check(png.length > 1000, `${state} screenshot is empty`);
      const file = `${item.key}-${state}.png`;
      fs.writeFileSync(path.join(OUTPUT, file), png);
      frames.push({
        state,
        file,
        sha256: createHash('sha256').update(png).digest('hex'),
      });
    }

    const opened = await observe(page);
    observations.opened = opened;
    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(!opened.storybookError, 'storybook error display');
    check(opened.theme === item.theme, `theme ${opened.theme}`);
    check(opened.mode === item.mode, `mode ${opened.mode}`);
    check(
      opened.viewport.width === item.viewport.width &&
        opened.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(opened.dpr === 2, `dpr ${opened.dpr}`);
    check(opened.reducedMotion, 'reduced motion not applied');
    check(opened.fonts === 'loaded', `fonts ${opened.fonts}`);
    check(opened.dialog != null, 'no open viewer');
    check(opened.dialog?.isModal === true, 'the viewer is not modal');
    check(
      JSON.stringify(opened.dialog?.targets) === '["astryx-lightbox"]',
      `targets ${opened.dialog?.targets.join(' ')}`,
    );
    check(
      opened.dialog?.direction === item.direction,
      `direction ${opened.dialog?.direction}`,
    );
    check(opened.focusInside, 'focus is not inside the open viewer');
    check(opened.buttons.close != null, 'no Close button');

    if (item.story === 'gallery-with-zoom') {
      check(
        opened.dialog?.name === 'Forest path',
        `name ${opened.dialog?.name}`,
      );
      check(
        opened.dialog?.text.includes('1 / 4') === true,
        'counter does not read 1 / 4',
      );
      check(
        opened.buttons.previous?.disabled === true &&
          opened.buttons.next?.disabled === false,
        `at the start, previous ${opened.buttons.previous?.disabled} next ${opened.buttons.next?.disabled}`,
      );
      const close = opened.buttons.close?.box;
      const previous = opened.buttons.previous?.box;
      const next = opened.buttons.next?.box;
      if (previous != null && next != null) {
        // Next sits at the inline end: the right in LTR, the left in RTL.
        check(
          next.left > previous.left === (item.direction === 'ltr'),
          `previous ${previous.left} next ${next.left} in ${item.direction}`,
        );
      }
      for (const [name, target] of Object.entries({close, previous, next})) {
        check(
          target != null && target.width >= 24 && target.height >= 24,
          `${name} target ${JSON.stringify(target)}`,
        );
      }
      await capture('first');

      // Moving to another item announces it with its position, inside the
      // open viewer, where a screen reader hears it.
      await page.keyboard.press(
        item.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight',
      );
      await page.waitForFunction(() =>
        document
          .querySelector('dialog.astryx-lightbox')
          ?.getAttribute('aria-label')
          ?.includes('Mountain lake'),
      );
      await page.waitForTimeout(250);
      const paged = await observe(page);
      observations.paged = paged;
      check(
        paged.dialog?.text.includes('2 / 4') === true,
        'counter does not read 2 / 4 after paging',
      );
      check(
        paged.modalRegion?.includes('Mountain lake, 2 of 4') === true,
        `position message inside the viewer: ${JSON.stringify(paged.modalRegion)}; on the page: ${JSON.stringify(paged.sharedRegion)}`,
      );
      check(
        !(paged.sharedRegion ?? '').includes('Mountain lake'),
        `position message reached the page: ${JSON.stringify(paged.sharedRegion)}`,
      );

      // Keyboard zoom: + zooms in and is announced inside the viewer; 0
      // returns the photo to its fitted size.
      await page.keyboard.press('+');
      await page.waitForTimeout(400);
      const zoomed = await observe(page);
      observations.zoomed = zoomed;
      check(zoomed.zoomPressed === 'true', `zoom ${zoomed.zoomPressed}`);
      check(
        zoomed.modalRegion?.includes('Zoomed in') === true,
        `zoom message inside the viewer: ${JSON.stringify(zoomed.modalRegion)}; on the page: ${JSON.stringify(zoomed.sharedRegion)}`,
      );
      check(
        !(zoomed.sharedRegion ?? '').includes('Zoomed'),
        `zoom message reached the page: ${JSON.stringify(zoomed.sharedRegion)}`,
      );
      check(zoomed.focusInside, 'focus left the viewer while zoomed');
      await capture('zoomed');
      await page.keyboard.press('0');
      await page.waitForTimeout(400);
      const reset = await observe(page);
      observations.reset = reset;
      check(
        reset.zoomPressed === 'false',
        `after 0 the zoom is ${reset.zoomPressed}`,
      );
      await capture('fitted');
    } else if (item.story === 'default') {
      check(
        opened.dialog?.name === 'Forest path',
        `name ${opened.dialog?.name}`,
      );
      check(
        opened.buttons.previous == null && opened.buttons.next == null,
        'a single item shows gallery buttons',
      );
      check(
        opened.dialog?.text.includes('A winding path through the forest') ===
          true,
        'caption missing',
      );
      check(!/\d+ \/ \d+/.test(opened.dialog?.text ?? ''), 'counter shown');
      check(opened.zoomPressed == null, 'zoom target without hasZoom');
      await capture('open');
    } else {
      check(opened.video === true, `video controls ${opened.video}`);
      await capture('open');
    }

    // Escape closes the viewer and focus returns to its opener.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const closed = await page.evaluate(() => ({
      open: document
        .querySelector('dialog.astryx-lightbox')
        ?.hasAttribute('open'),
      focused: document.activeElement?.textContent ?? null,
    }));
    observations.closed = closed;
    check(closed.open !== true, 'Escape did not close the viewer');
    check(
      closed.focused === OPENER[item.story],
      `focus after close: ${closed.focused}`,
    );
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-lightbox--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        direction: item.direction,
        viewport: item.viewport,
        viewer:
          'one modal dialog carrying only the astryx-lightbox target, in the page direction, named by the active item, with focus inside and a Close button',
        gallery:
          item.story === 'gallery-with-zoom'
            ? 'counter 1 / 4; Previous disabled at the start; Next at the inline end; targets at least 24px; paging announces "<alt>, 2 of 4" inside the open viewer and not on the page; + zooms in, is announced inside the viewer and not on the page, and 0 returns to the fitted size'
            : 'not applicable',
        close: 'Escape closes the viewer and focus returns to the opener',
      },
      observed: {build: storybookSha, ...observations, pageErrors},
      frames,
      failures,
      passed: failures.length === 0,
    };
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await context.close();
    expect(failures).toEqual([]);
  });
}

test('manifest is complete', async () => {
  const receipts = cases.map(item => {
    const file = path.join(OUTPUT, `${item.key}.sensors.json`);
    return {
      key: item.key,
      receipt: fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, 'utf8')) as AuditReceipt)
        : null,
    };
  });
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/Lightbox',
        build: checkoutSha,
        cases: cases.map(item => ({
          key: item.key,
          receipt: `${item.key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(
    receipts.filter(({receipt}) => receipt == null).map(({key}) => key),
  ).toEqual([]);
  expect(
    receipts
      .filter(({receipt}) => receipt?.expected.build !== checkoutSha)
      .map(({key}) => key),
  ).toEqual([]);
  expect(
    receipts
      .filter(({receipt}) => receipt?.passed !== true)
      .map(({key, receipt}) => ({case: key, failures: receipt?.failures})),
  ).toEqual([]);
});
