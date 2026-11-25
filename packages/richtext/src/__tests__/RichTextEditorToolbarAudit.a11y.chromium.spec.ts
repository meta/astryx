// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit RichTextEditorToolbar

/**
 * @file RichTextEditorToolbarAudit.a11y.chromium.spec.ts
 * @input Exact-head RichTextEditor stories with the toolbar: rest in light and
 *   dark and both directions, formatting with real key presses and clicks,
 *   the endContent slot, the link popover above, below and at phone width,
 *   and a disabled editor
 * @output Screenshots and fail-closed sensor receipts for the
 *   RichTextEditorToolbar whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a RichTextEditorToolbar audit pull request
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {resetAuditEvidence} from '@astryxdesign/a11y-spec/evidence';

const EVIDENCE = path.resolve('test-results/richtext-toolbar-audit-evidence');
const TOOLBAR_STORY = 'richtext-richtexteditor--with-toolbar';
const LINK_STORY = 'richtext-richtexteditor--with-links';
const NO_ROOM_STORY = 'richtext-richtexteditor--with-links-no-room-above';
const PLAYGROUND_STORY = 'richtext-richtexteditor--playground';
const DISABLED_STORY = 'richtext-richtexteditor--disabled';

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 600};
const WIDE = {width: 1240, height: 900};
const PHONE = {width: 390, height: 700};

test.describe.configure({retries: 0});

let OUTPUT = EVIDENCE;
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

// A case with motion on records the page as a person who allows motion
// sees it, so it does not hold motion still.
let holdsMotion = true;

async function settle(page: Page) {
  if (holdsMotion) {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function pageSensors(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    direction: getComputedStyle(
      document.querySelector('#storybook-root [contenteditable]') as Element,
    ).direction,
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    storybookError: document.body.classList.contains('sb-show-errordisplay'),
  }));
}

async function axe(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return {
    violations: results.violations.flatMap(violation =>
      violation.nodes.map(
        node =>
          `${violation.id} ${node.target.join(' ')}: ${node.failureSummary}`,
      ),
    ),
    passes: results.passes.length,
  };
}

async function checkAxe(page: Page, check: Check) {
  const result = await axe(page);
  check(
    result.violations.length === 0,
    `axe: ${result.violations.join(' | ')}`,
  );
  check(result.passes > 0, 'axe checked nothing');
  return result;
}

/** The toolbar's controls, separators and the undo glyph's mirror. */
async function readToolbar(page: Page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector(
      '#storybook-root [role="toolbar"]',
    ) as HTMLElement;
    const controls = [
      ...toolbar.querySelectorAll<HTMLElement>(
        'button, [role="combobox"], input',
      ),
    ];
    const undo = [...toolbar.querySelectorAll('button')].find(
      button => button.getAttribute('aria-label') === 'Undo',
    );
    const undoGlyph = undo?.querySelector('span[aria-hidden="true"]');
    return {
      name: toolbar.getAttribute('aria-label'),
      tabStops: controls.filter(
        control =>
          control.tabIndex >= 0 &&
          !(control as HTMLButtonElement).disabled &&
          control.getBoundingClientRect().width > 0,
      ).length,
      controls: controls.map(control => ({
        name:
          control.getAttribute('aria-label') ??
          control.textContent?.trim() ??
          null,
        disabled:
          (control as HTMLButtonElement).disabled ||
          control.getAttribute('aria-disabled') === 'true',
        pressed: control.getAttribute('aria-pressed'),
      })),
      separators: [...toolbar.querySelectorAll('[role="separator"]')].map(
        separator => ({
          name: separator.getAttribute('aria-label'),
          height: separator.getBoundingClientRect().height,
          width: separator.getBoundingClientRect().width,
        }),
      ),
      undoTransform: undoGlyph ? getComputedStyle(undoGlyph).transform : null,
    };
  });
}

async function typeAndSelect(page: Page, text: string, word: string) {
  const editor = page.locator('#storybook-root [contenteditable="true"]');
  await editor.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Home');
  for (let press = 0; press < text.indexOf(word); press += 1) {
    await page.keyboard.press('ArrowRight');
  }
  for (let press = 0; press < word.length; press += 1) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  await settle(page);
}

/** The open link popover's box beside the toolbar and the Link button. */
async function readPopover(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const toolbar = document.querySelector(
      '#storybook-root [role="toolbar"]',
    ) as HTMLElement;
    const linkButton = [...toolbar.querySelectorAll('button')].find(
      button => button.getAttribute('aria-label') === 'Link',
    ) as HTMLElement;
    const field = dialog?.querySelector('input') as HTMLElement | null;
    const buttons = [...(dialog?.querySelectorAll('button') ?? [])];
    const box = (element: Element | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          }
        : null;
    };
    return {
      name: dialog?.getAttribute('aria-label') ?? null,
      dialog: box(dialog),
      toolbar: box(toolbar),
      linkButton: box(linkButton),
      field: box(field),
      buttons: buttons.map(button => ({
        name: button.getAttribute('aria-label'),
        box: box(button),
      })),
      viewport: {width: innerWidth, height: innerHeight},
    };
  });
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `rest__${mode}__${direction}`,
      group: 'rest',
      story: TOOLBAR_STORY,
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const toolbar = await readToolbar(page);
        check(toolbar.name === 'Text formatting', `name ${toolbar.name}`);
        check(toolbar.tabStops === 1, `${toolbar.tabStops} tab stops`);
        check(
          toolbar.separators.every(separator => separator.height >= 16),
          `separator heights ${toolbar.separators.map(s => s.height)}`,
        );
        const mirrored = (toolbar.undoTransform ?? '').startsWith('matrix(-1');
        check(
          mirrored === (direction === 'rtl'),
          `undo glyph transform ${toolbar.undoTransform}`,
        );
        const axeResult = await checkAxe(page, check);
        await frame('rest', {toolbar, axe: axeResult});
      },
    });
  }
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `format__light__${direction}`,
    group: 'formatting',
    story: TOOLBAR_STORY,
    mode: 'light',
    direction,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await typeAndSelect(page, 'Ship the launch notes', 'launch');
      const bold = page.getByRole('button', {name: 'Bold', exact: true});
      await bold.click();
      await settle(page);
      check(
        (await bold.getAttribute('aria-pressed')) === 'true',
        'Bold not pressed after the click',
      );
      const strong = await page
        .locator('#storybook-root [contenteditable="true"] strong')
        .allTextContents();
      check(strong.join('') === 'launch', `bold text ${strong.join('|')}`);
      await frame('bold', {strong});

      await page
        .getByRole('combobox', {name: 'Block format', exact: true})
        .click();
      await page.getByRole('option', {name: 'Heading 1', exact: true}).click();
      await settle(page);
      const heading = await page
        .locator('#storybook-root [contenteditable="true"] h1')
        .count();
      check(heading === 1, `${heading} h1 blocks`);
      const toolbar = await readToolbar(page);
      check(
        toolbar.controls.some(
          control => control.name === 'Undo' && !control.disabled,
        ),
        'Undo stays disabled after an edit',
      );

      // Arrow keys move focus along the toolbar's one tab stop.
      await bold.focus();
      await page.keyboard.press(
        direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight',
      );
      const next = await page.evaluate(() =>
        document.activeElement?.getAttribute('aria-label'),
      );
      check(next === 'Italic', `the next arrow key focused ${next}`);
      const axeResult = await checkAxe(page, check);
      await frame('heading', {heading, toolbar, next, axe: axeResult});
    },
  });
}

const endContentCases: {
  key: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
}[] = [
  {key: 'light__ltr', mode: 'light', direction: 'ltr', viewport: WIDE},
  {key: 'dark__ltr', mode: 'dark', direction: 'ltr', viewport: WIDE},
  {key: 'light__rtl', mode: 'light', direction: 'rtl', viewport: WIDE},
  {key: 'dark__rtl', mode: 'dark', direction: 'rtl', viewport: WIDE},
  {
    key: 'light__ltr__motion',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
    motion: 'no-preference',
  },
  {key: 'light__ltr__phone', mode: 'light', direction: 'ltr', viewport: PHONE},
];

for (const variant of endContentCases) {
  cases.push({
    key: `end-content__${variant.key}`,
    group: 'end content',
    story: PLAYGROUND_STORY,
    mode: variant.mode,
    direction: variant.direction,
    viewport: variant.viewport,
    motion: variant.motion,
    run: async (page, check, frame) => {
      // At phone width the action row scrolls; bring its end into view.
      await page.evaluate(() => {
        const row = document.querySelector(
          '#storybook-root [role="toolbar"] [role="group"]',
        );
        row?.scrollBy({
          left: row.scrollWidth * (document.dir === 'rtl' ? -1 : 1),
        });
        row?.querySelector('[role="separator"]:last-of-type')?.scrollIntoView({
          inline: 'center',
          block: 'nearest',
        });
      });
      await settle(page);
      const toolbar = await readToolbar(page);
      check(
        toolbar.separators.length >= 3,
        `${toolbar.separators.length} separators`,
      );
      const heights = toolbar.separators.map(separator => separator.height);
      check(
        heights.every(height => height >= 16),
        `separator heights ${heights.join(', ')}`,
      );
      check(
        Math.max(...heights) - Math.min(...heights) <= 1,
        `separators differ in height: ${heights.join(', ')}`,
      );
      await frame('rest', {toolbar});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `popover-above__${mode}__ltr`,
    group: 'link popover placement',
    story: LINK_STORY,
    mode,
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      await typeAndSelect(page, 'Ship the launch notes today.', 'launch');
      await page.keyboard.press('ControlOrMeta+k');
      await page.getByRole('dialog').waitFor();
      await settle(page);
      const popover = await readPopover(page);
      check(popover.name === 'Insert link', `dialog ${popover.name}`);
      check(
        popover.dialog != null &&
          popover.toolbar != null &&
          popover.dialog.bottom <= popover.toolbar.top + 1,
        `popover ${JSON.stringify(popover.dialog)} is not above the toolbar ${JSON.stringify(popover.toolbar)}`,
      );
      const axeResult = await checkAxe(page, check);
      await frame('open', {popover, axe: axeResult});
    },
  });
}

cases.push({
  key: 'popover-below__light__ltr',
  group: 'link popover placement',
  story: NO_ROOM_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await typeAndSelect(page, 'Ship the launch notes today.', 'launch');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('dialog').waitFor();
    await settle(page);
    const popover = await readPopover(page);
    check(
      popover.dialog != null &&
        popover.linkButton != null &&
        popover.dialog.top >= popover.linkButton.bottom - 1,
      `popover ${JSON.stringify(popover.dialog)} is not below the Link button ${JSON.stringify(popover.linkButton)}`,
    );
    await frame('open', {popover});
  },
});

cases.push({
  key: 'popover-phone__light__ltr',
  group: 'link popover placement',
  story: LINK_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: PHONE,
  run: async (page, check, frame) => {
    await typeAndSelect(page, 'Ship the notes.', 'notes');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('dialog').waitFor();
    await settle(page);
    const popover = await readPopover(page);
    const dialog = popover.dialog;
    check(dialog != null && dialog.width <= 320.5, `width ${dialog?.width}`);
    check(
      dialog != null && dialog.left >= 0 && dialog.right <= PHONE.width,
      `popover leaves the screen: ${JSON.stringify(dialog)}`,
    );
    const rowCenter = (box: {top: number; height: number} | null) =>
      box == null ? NaN : box.top + box.height / 2;
    const fieldCenter = rowCenter(popover.field);
    check(
      popover.buttons.length > 0 &&
        popover.buttons.every(
          button => Math.abs(rowCenter(button.box) - fieldCenter) <= 4,
        ),
      `field and buttons are not on one row: ${JSON.stringify(popover.buttons)}`,
    );
    await frame('open', {popover});
  },
});

cases.push({
  key: 'disabled__light__ltr',
  group: 'disabled',
  story: DISABLED_STORY,
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const toolbar = await readToolbar(page);
    const enabled = toolbar.controls.filter(control => !control.disabled);
    check(
      enabled.length === 0,
      `enabled controls: ${enabled.map(control => control.name).join(', ')}`,
    );
    await frame('rest', {toolbar});
  },
});

test.beforeAll(async () => {
  OUTPUT = resetAuditEvidence(EVIDENCE, test.info());
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  holdsMotion = (item.motion ?? 'reduce') === 'reduce';
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.motion ?? 'reduce',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
  const frame: FrameSink = async (state, observed) => {
    const screenshot = await page.screenshot({animations: 'disabled'});
    const file = `${item.key}__${state}.png`;
    fs.writeFileSync(path.join(OUTPUT, file), screenshot);
    frames.push({
      state,
      observed,
      file,
      sha256: createHash('sha256').update(screenshot).digest('hex'),
    });
  };
  try {
    await page.goto(url, {waitUntil: 'load'});
    await page.locator('#storybook-root [role="toolbar"]').first().waitFor();
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.reducedMotion === ((item.motion ?? 'reduce') === 'reduce'),
      `reduced motion ${sensors.reducedMotion}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'RichTextEditorToolbar',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: 'neutral',
    direction: item.direction,
    viewport: item.viewport,
    reducedMotion: item.motion ?? 'reduce',
    sensors,
    pageErrors,
    frames,
    passed: failures.length === 0,
    failures,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${item.key}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return failures.map(failure => `${item.key}: ${failure}`);
}

for (const group of [...new Set(cases.map(item => item.group))]) {
  test(group, async ({browser}) => {
    const context = await browser.newContext({deviceScaleFactor: 2});
    try {
      const page = await context.newPage();
      const failures: string[] = [];
      for (const item of cases.filter(c => c.group === group)) {
        failures.push(...(await runCase(page, item)));
      }
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
