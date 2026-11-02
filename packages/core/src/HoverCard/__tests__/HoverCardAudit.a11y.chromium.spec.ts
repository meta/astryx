// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit HoverCard

/**
 * @file HoverCardAudit.a11y.chromium.spec.ts
 * @input Exact-head HoverCard open states across themes, modes, direction, and viewport, plus a real hover and keyboard pass
 * @output Screenshots and fail-closed sensor receipts for the HoverCard whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a HoverCard audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('hover-card-audit-evidence');
const OPEN_STORY_ID = 'core-hovercard--open-states';
const INTERACTIVE_STORY_ID = 'core-hovercard--interactive-content';
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 900};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter';

type AuditCase = {
  key: string;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      viewport: options.viewport ?? WIDE,
    });
  }
}

addPair('open-default');
addPair('open-custom-theme', {theme: 'butter'});
addPair('open-rtl', {direction: 'rtl'});
addPair('open-narrow', {viewport: NARROW});

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(
  storyId: string,
  mode: Mode,
  theme: Theme,
  direction: Direction,
) {
  return `${server.origin}/iframe.html?id=${storyId}&viewMode=story&globals=colorMode:${mode};astryxTheme:${theme};direction:${direction}`;
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

async function observeEnvironment(page: Page) {
  return page.evaluate(() => {
    const directions = Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-hover-card'),
    ).map(card => getComputedStyle(card).direction);
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      direction:
        directions.length > 0 && new Set(directions).size === 1
          ? directions[0]
          : directions.join(',') || null,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
      runningAnimations: document
        .getAnimations()
        .filter(animation => animation.playState === 'running').length,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
    };
  });
}

async function observeCards(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    function box(element: Element | null) {
      if (element == null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    function isOpen(element: Element) {
      try {
        return element.matches(':popover-open');
      } catch {
        return false;
      }
    }
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-hover-card'),
    ).map(card => {
      const body = card.firstElementChild as HTMLElement | null;
      const bodyStyle = body ? getComputedStyle(body) : null;
      return {
        id: card.id,
        role: card.getAttribute('role'),
        ariaLabel: card.getAttribute('aria-label'),
        open: isOpen(card),
        targetClasses: Array.from(card.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        box: box(card),
        background: getComputedStyle(card).backgroundColor,
        padding: bodyStyle
          ? [
              bodyStyle.paddingBlockStart,
              bodyStyle.paddingInlineEnd,
              bodyStyle.paddingBlockEnd,
              bodyStyle.paddingInlineStart,
            ]
          : null,
        text: card.textContent?.trim() ?? '',
      };
    });
    const textTrigger = Array.from(
      document.querySelectorAll<HTMLElement>('span[tabindex="0"]'),
    ).find(span => span.textContent === 'Jane Doe');
    const textStyle = textTrigger ? getComputedStyle(textTrigger) : null;
    const buttonTrigger = Array.from(
      document.querySelectorAll<HTMLElement>('button'),
    ).find(
      button =>
        button.textContent?.trim() === 'Jane Doe' &&
        button.closest('.astryx-hover-card') == null,
    );
    return {
      cards,
      textTrigger: textTrigger
        ? {
            box: box(textTrigger),
            describedBy: textTrigger.getAttribute('aria-describedby'),
            hasPopup: textTrigger.getAttribute('aria-haspopup'),
            expanded: textTrigger.getAttribute('aria-expanded'),
            decorationLine: textStyle?.textDecorationLine ?? null,
            decorationStyle: textStyle?.textDecorationStyle ?? null,
          }
        : null,
      buttonTrigger: buttonTrigger
        ? {
            box: box(buttonTrigger),
            hasPopup: buttonTrigger.getAttribute('aria-haspopup'),
            expanded: buttonTrigger.getAttribute('aria-expanded'),
            controls: buttonTrigger.getAttribute('aria-controls'),
            describedBy: buttonTrigger.getAttribute('aria-describedby'),
          }
        : null,
    };
  });
}

function imageInfo(png: Buffer, file: string) {
  return {
    file,
    sha256: createHash('sha256').update(png).digest('hex'),
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

function writeReceipt(key: string, png: Buffer, receipt: object) {
  fs.writeFileSync(path.join(OUTPUT, `${key}.png`), png);
  fs.writeFileSync(
    path.join(OUTPUT, `${key}.sensors.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
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
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(
      storyUrl(OPEN_STORY_ID, item.mode, item.theme, item.direction),
      {waitUntil: 'load'},
    );
    await page.locator('#storybook-root').waitFor();
    await expect(page.locator('.astryx-hover-card')).toHaveCount(2);
    await page.locator('[role="dialog"]').waitFor();

    await settle(page);
    const first = await observeCards(page);
    await page.waitForTimeout(100);
    await settle(page);
    const environment = await observeEnvironment(page);
    const observed = await observeCards(page);
    const geometryStable =
      JSON.stringify(first.cards.map(card => card.box)) ===
      JSON.stringify(observed.cards.map(card => card.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number) =>
      Math.abs(actual - expected) <= 2;

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!environment.storybookError, 'storybook error display');
    check(environment.theme === item.theme, `theme ${environment.theme}`);
    check(environment.mode === item.mode, `mode ${environment.mode}`);
    check(
      environment.direction === item.direction,
      `direction ${environment.direction}`,
    );
    check(
      environment.viewport.width === item.viewport.width &&
        environment.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(environment.dpr === 1, `dpr ${environment.dpr}`);
    check(environment.reducedMotion, 'reduced motion not applied');
    check(environment.fonts === 'loaded', `fonts ${environment.fonts}`);
    check(environment.runningAnimations === 0, 'animations still running');
    check(geometryStable, 'geometry changed between samples');
    check(!environment.documentOverflow, 'document scrolls horizontally');

    const group = observed.cards.find(card => card.role === 'group');
    const dialog = observed.cards.find(card => card.role === 'dialog');
    const text = observed.textTrigger;
    const button = observed.buttonTrigger;
    check(group != null, 'no group card');
    check(dialog != null, 'no dialog card');
    check(text != null, 'no text trigger');
    check(button != null, 'no button trigger');

    for (const card of observed.cards) {
      const id = card.role ?? 'unknown';
      // one open surface carrying only the hover-card target, padded on
      // every logical edge.
      check(card.open, `${id}: card is not open in the top layer`);
      check(
        JSON.stringify(card.targetClasses) ===
          JSON.stringify(['astryx-hover-card']),
        `${id}: targets ${card.targetClasses.join(' ')}`,
      );
      const padding = card.padding ?? [];
      check(
        padding.length === 4 &&
          padding.every(value => Number.parseFloat(value) > 0) &&
          new Set(padding).size === 1,
        `${id}: padding ${padding.join(' ')}`,
      );
      check(
        card.background !== 'rgba(0, 0, 0, 0)',
        `${id}: card paints no surface`,
      );
      if (card.box != null) {
        check(
          card.box.left >= -0.5 &&
            card.box.right <= environment.viewport.width + 0.5,
          `${id}: card leaves the viewport inline`,
        );
      }
    }

    if (group != null && text != null && group.box && text.box) {
      // without a label the card is a group that describes its trigger.
      check(group.ariaLabel == null, 'group: has an aria-label');
      check(text.describedBy === group.id, 'text trigger: not described');
      check(text.hasPopup == null, 'text trigger: advertises a popup');
      check(text.expanded == null, 'text trigger: aria-expanded on a span');
      // the default hover cue on a text trigger.
      check(
        text.decorationLine === 'underline' &&
          text.decorationStyle === 'dashed',
        `text trigger: decoration ${text.decorationLine} ${text.decorationStyle}`,
      );
      check(group.box.top >= text.box.bottom - 0.5, 'group: not below');
    }

    if (dialog != null && button != null && dialog.box && button.box) {
      // with a label the card is a named dialog its button advertises.
      check(dialog.ariaLabel === 'Jane Doe profile', 'dialog: wrong name');
      check(button.hasPopup === 'dialog', 'button: aria-haspopup');
      check(button.expanded === 'true', 'button: aria-expanded');
      check(
        (button.controls ?? '').split(' ').includes(dialog.id),
        'button: aria-controls does not name the dialog',
      );
      check(button.describedBy == null, 'button: described by the dialog');
      check(dialog.box.top >= button.box.bottom - 0.5, 'dialog: not below');
      if (item.viewport === WIDE) {
        // alignment="start" follows the inherited direction.
        check(
          item.direction === 'rtl'
            ? near(dialog.box.right, button.box.right)
            : near(dialog.box.left, button.box.left),
          'dialog: not aligned to the trigger inline start',
        );
      }
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
    writeReceipt(item.key, png, {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: OPEN_STORY_ID,
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        viewport: item.viewport,
        semantics:
          'unlabelled card is a group that describes its text trigger; labelled card is a dialog named "Jane Doe profile" that its button advertises with aria-haspopup, aria-expanded, and aria-controls',
        surface:
          'each open card carries only astryx-hover-card, paints a surface, has equal non-zero padding on every logical edge, sits below its trigger, and stays inside the viewport',
        alignment:
          'at 1024px the labelled card starts at its trigger inline start, mirrored in RTL',
      },
      observed: {
        build: storybookSha,
        ...environment,
        ...observed,
        geometryStable,
        pageErrors,
      },
      image: imageInfo(png, `${item.key}.png`),
      failures,
      passed: failures.length === 0,
    });
    await context.close();
  });
}

test('hover-and-keyboard', async ({browser}) => {
  const key = 'hover-and-keyboard';
  const context = await browser.newContext({
    viewport: WIDE,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(storyUrl(INTERACTIVE_STORY_ID, 'light', 'neutral', 'ltr'), {
    waitUntil: 'load',
  });
  await page.locator('#storybook-root').waitFor();
  await settle(page);

  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      failures.push(message);
    }
  };
  const steps: Record<string, unknown> = {};
  const trigger = page.getByRole('button', {
    name: 'Hover for interactive content',
  });
  const card = page.locator('.astryx-hover-card');
  const cardOpen = async () =>
    card.evaluateAll(nodes =>
      nodes.some(node => {
        try {
          return node.matches(':popover-open');
        } catch {
          return false;
        }
      }),
    );

  // hovering the trigger opens the card after the delay.
  await page.mouse.move(5, 5);
  await trigger.hover();
  await expect.poll(cardOpen, {timeout: 3000}).toBe(true);
  steps.hoverOpens = await cardOpen();
  steps.describedBy = await trigger.getAttribute('aria-describedby');
  steps.cardId = await card.first().getAttribute('id');
  steps.cardRole = await card.first().getAttribute('role');
  check(steps.hoverOpens === true, 'hover did not open the card');
  check(steps.cardRole === 'group', `card role ${String(steps.cardRole)}`);
  check(
    steps.describedBy === steps.cardId,
    'trigger is not described by the card',
  );
  await settle(page);
  const png = await page.screenshot({animations: 'disabled', fullPage: true});

  // moving from the trigger into the card keeps it open.
  await page.getByRole('button', {name: 'Follow'}).hover();
  await page.waitForTimeout(600);
  steps.openWhileOnCard = await cardOpen();
  check(steps.openWhileOnCard === true, 'card closed while pointer on it');

  // leaving the card closes it after the hide delay.
  await page.mouse.move(5, 5);
  await expect.poll(cardOpen, {timeout: 3000}).toBe(false);
  steps.closesAfterLeave = !(await cardOpen());
  check(steps.closesAfterLeave === true, 'card stayed open after leave');

  // keyboard focus opens it, Tab reaches its actions, and
  // Escape closes it and returns focus to the trigger without reopening.
  await trigger.focus();
  await expect.poll(cardOpen, {timeout: 3000}).toBe(true);
  steps.focusOpens = true;
  await page.keyboard.press('Tab');
  steps.tabReachesAction = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? null,
  );
  check(
    steps.tabReachesAction === 'Follow',
    `Tab moved focus to ${String(steps.tabReachesAction)}`,
  );
  await page.keyboard.press('Escape');
  await expect.poll(cardOpen, {timeout: 3000}).toBe(false);
  await page.waitForTimeout(600);
  steps.escapeClosed = !(await cardOpen());
  steps.focusAfterEscape = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? null,
  );
  check(steps.escapeClosed === true, 'Escape did not keep the card closed');
  check(
    steps.focusAfterEscape === 'Hover for interactive content',
    `focus after Escape on ${String(steps.focusAfterEscape)}`,
  );

  check(storybookSha === checkoutSha, 'storybook build mismatch');
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  check(png.length > 1000, 'screenshot is empty');
  writeReceipt(key, png, {
    schemaVersion: 1,
    expected: {
      build: checkoutSha,
      storyId: INTERACTIVE_STORY_ID,
      mode: 'light',
      direction: 'ltr',
      theme: 'neutral',
      viewport: WIDE,
      behavior:
        'hover opens a group card that describes its trigger; it stays open while the pointer is on the card and closes after the pointer leaves; focus opens it, Tab reaches its first action, and Escape closes it and returns focus to the trigger without reopening',
      image: 'the hover-opened card',
    },
    observed: {
      build: storybookSha,
      ...(await observeEnvironment(page)),
      steps,
      pageErrors,
    },
    image: imageInfo(png, `${key}.png`),
    failures,
    passed: failures.length === 0,
  });
  await context.close();
});

test('manifest is complete', async () => {
  const keys = [...cases.map(item => item.key), 'hover-and-keyboard'];
  const receiptFiles = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  const receipts = receiptFiles.map(
    (file): AuditReceipt =>
      JSON.parse(
        fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
      ) as AuditReceipt,
  );
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/HoverCard',
        build: checkoutSha,
        frames: keys.map(key => ({
          key,
          image: `${key}.png`,
          receipt: `${key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(receiptFiles).toHaveLength(keys.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
