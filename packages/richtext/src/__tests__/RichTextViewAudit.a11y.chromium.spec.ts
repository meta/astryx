// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit RichTextView

/**
 * @file RichTextViewAudit.a11y.chromium.spec.ts
 * @input The exact-head "Markdown serializers" story, which renders one
 *   Markdown document in a RichTextEditor and in a RichTextView, filled with a
 *   document that has a heading, a link, task items in English, Hebrew and
 *   digits only, a fenced code block and a wide table; and the "View:
 *   digit-only task items" story
 * @output Screenshots and fail-closed sensor receipts for the RichTextView
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a RichTextView audit pull request
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

const EVIDENCE = path.resolve('test-results/rich-text-view-audit-evidence');
const STORY = 'richtext-richtexteditor--markdown-serializers';
const DIGIT_TASKS_STORY = 'richtext-richtexteditor--view-digit-tasks';

// The view's root: the element that holds the read-only content editable.
const VIEW = 'div:has(> [data-lexical-editor][contenteditable="false"])';

const DOCUMENT = [
  '# Release notes',
  '',
  'Read the [launch plan](https://example.com/plan) before **Friday**.',
  '',
  '- [ ] Draft the notes',
  '- [x] שלח את הגרסה',
  '- [ ] 2026',
  '',
  '```js',
  'const launch = true;',
  '```',
  '',
  '| Region | Owner | Status | Start | End | Budget | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| North America | Platform team | In progress | January | March | Approved | Waiting on the final review |',
  '',
].join('\n');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  // Stories other than the serializer story render their own content.
  story?: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 1000, height: 1400};
const PHONE = {width: 390, height: 1400};

test.describe.configure({retries: 0});

let OUTPUT = EVIDENCE;
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;
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
  return page.evaluate(view => {
    const root = document.querySelector(view);
    return {
      mode: document.documentElement.getAttribute('data-theme'),
      direction: root == null ? null : getComputedStyle(root).direction,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      fonts: document.fonts.status,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      storybookError: document.body.classList.contains('sb-show-errordisplay'),
    };
  }, VIEW);
}

async function checkAxe(page: Page, check: Check) {
  const results = await new AxeBuilder({page})
    .include(VIEW)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.flatMap(violation =>
    violation.nodes.map(
      node =>
        `${violation.id} ${node.target.join(' ')}: ${node.failureSummary}`,
    ),
  );
  check(violations.length === 0, `axe: ${violations.join(' | ')}`);
  check(results.passes.length > 0, 'axe checked nothing');
  return {violations, passes: results.passes.length};
}

/** Roles, task checkboxes, the code block's copy button and the table. */
async function readView(page: Page) {
  return page.evaluate(view => {
    const root = document.querySelector(view) as HTMLElement;
    const content = root.querySelector('[data-lexical-editor]') as HTMLElement;
    const box = (element: Element | null) => {
      if (element == null) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const items = [...content.querySelectorAll('li')];
    const tasks = [
      ...root.querySelectorAll<HTMLElement>('[data-richtext-task-checkbox]'),
    ].map(holder => {
      const input = holder.querySelector('input') as HTMLInputElement | null;
      const owner = items.find(
        item => item.getAttribute('aria-owns') === holder.id,
      );
      return {
        name:
          input?.getAttribute('aria-label') ??
          input?.labels?.[0]?.textContent?.trim() ??
          null,
        checked: input?.checked ?? null,
        readOnly:
          input?.getAttribute('aria-readonly') === 'true' ||
          input?.readOnly === true,
        tabIndex: input?.tabIndex ?? null,
        box: box(holder),
        item: box(owner ?? null),
        itemText: owner?.textContent?.trim() ?? null,
        itemDirection: owner == null ? null : getComputedStyle(owner).direction,
      };
    });
    const copy = root.querySelector<HTMLButtonElement>(
      'button[aria-label]:not([data-richtext-task-checkbox] *)',
    );
    const code = content.querySelector('code, pre');
    const group = root.querySelector<HTMLElement>('[role="group"][aria-label]');
    return {
      contentRole: content.getAttribute('role'),
      contentEditable: content.getAttribute('contenteditable'),
      textboxes: root.querySelectorAll('[role="textbox"]').length,
      heading: content.querySelector('h1')?.textContent ?? null,
      link: (() => {
        const anchor = content.querySelector('a');
        return anchor == null
          ? null
          : {text: anchor.textContent, href: anchor.getAttribute('href')};
      })(),
      tasks,
      copy:
        copy == null
          ? null
          : {name: copy.getAttribute('aria-label'), box: box(copy)},
      code: box(code),
      table:
        group == null
          ? null
          : {
              name: group.getAttribute('aria-label'),
              tabIndex: group.tabIndex,
              overflows: group.scrollWidth > group.clientWidth,
              box: box(group),
            },
      pageOverflow:
        document.scrollingElement == null
          ? null
          : document.scrollingElement.scrollWidth - innerWidth,
    };
  }, VIEW);
}

type ViewReading = Awaited<ReturnType<typeof readView>>;

function sideOf(task: ViewReading['tasks'][number]): 'left' | 'right' | null {
  if (task.box == null || task.item == null) {
    return null;
  }
  const center = task.box.left + task.box.width / 2;
  return center < task.item.left + task.item.width / 2 ? 'left' : 'right';
}

function checkDocument(
  reading: ViewReading,
  direction: Direction,
  check: Check,
) {
  check(reading.textboxes === 0, `textboxes ${reading.textboxes}`);
  check(reading.contentRole == null, `content role ${reading.contentRole}`);
  check(
    reading.contentEditable === 'false',
    `contenteditable ${reading.contentEditable}`,
  );
  check(reading.heading === 'Release notes', `heading ${reading.heading}`);
  check(
    reading.link?.href === 'https://example.com/plan',
    `link ${JSON.stringify(reading.link)}`,
  );
  check(reading.tasks.length === 3, `task checkboxes ${reading.tasks.length}`);
  for (const task of reading.tasks) {
    check(
      task.name === task.itemText,
      `checkbox name ${task.name} for ${task.itemText}`,
    );
    check(task.readOnly, `checkbox for ${task.itemText} is not read-only`);
    check(task.tabIndex === -1, `checkbox tabIndex ${task.tabIndex}`);
  }
  const [english, hebrew, digits] = reading.tasks;
  // A block's own text decides its direction; text that decides nothing
  // follows the document.
  check(
    english?.itemDirection === 'ltr' && sideOf(english) === 'left',
    `English task ${english?.itemDirection} ${sideOf(english)}`,
  );
  check(
    hebrew?.itemDirection === 'rtl' && sideOf(hebrew) === 'right',
    `Hebrew task ${hebrew?.itemDirection} ${sideOf(hebrew)}`,
  );
  check(
    digits?.itemDirection === direction &&
      sideOf(digits) === (direction === 'rtl' ? 'right' : 'left'),
    `digit task ${digits?.itemDirection} ${sideOf(digits)}`,
  );
  check(
    reading.copy?.name === 'Copy code',
    `copy button ${reading.copy?.name}`,
  );
  check(
    reading.copy?.box != null &&
      reading.copy.box.width >= 24 &&
      reading.copy.box.height >= 24,
    `copy button ${JSON.stringify(reading.copy?.box)}`,
  );
  const copyBox = reading.copy?.box;
  const code = reading.code;
  check(
    copyBox != null &&
      code != null &&
      copyBox.top >= code.top - 1 &&
      copyBox.bottom <= code.bottom + 1 &&
      copyBox.left >= code.left - 1 &&
      copyBox.right <= code.right + 1,
    `copy button ${JSON.stringify(copyBox)} is not inside its code block ${JSON.stringify(code)}`,
  );
  check(reading.table?.name === 'Table', `table group ${reading.table?.name}`);
  check(
    reading.pageOverflow != null && reading.pageOverflow <= 0,
    `page scrolls sideways by ${reading.pageOverflow}`,
  );
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `rest__${mode}__${direction}`,
      group: 'rest',
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const reading = await readView(page);
        checkDocument(reading, direction, check);
        const axe = await checkAxe(page, check);
        await frame('rest', {reading, axe});
      },
    });
  }
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `phone__light__${direction}`,
    group: 'phone width',
    mode: 'light',
    direction,
    viewport: PHONE,
    motion: 'no-preference',
    run: async (page, check, frame) => {
      const reading = await readView(page);
      checkDocument(reading, direction, check);
      // A table wider than the view scrolls inside its named group, which
      // then takes a tab stop.
      check(reading.table?.overflows === true, 'table does not overflow');
      check(reading.table?.tabIndex === 0, `group ${reading.table?.tabIndex}`);
      const axe = await checkAxe(page, check);
      await frame('rest', {reading, axe});
    },
  });
}

cases.push({
  key: 'keyboard__light__ltr',
  group: 'keyboard',
  mode: 'light',
  direction: 'ltr',
  viewport: PHONE,
  run: async (page, check, frame) => {
    // Tab order from the view's first stop, its link: the table group while
    // it overflows, the copy button after the content, then out of the view.
    // The task checkboxes, drawn after the copy button, take no tab stop.
    await page.locator(`${VIEW} a`).first().focus();
    const stops: string[] = [];
    for (let index = 0; index < 4; index++) {
      stops.push(
        await page.evaluate(view => {
          const active = document.activeElement as HTMLElement | null;
          if (active == null) {
            return 'none';
          }
          if (!document.querySelector(view)?.contains(active)) {
            return 'outside';
          }
          return `${active.tagName.toLowerCase()}:${active.getAttribute('aria-label') ?? active.textContent?.trim() ?? ''}`;
        }, VIEW),
      );
      await page.keyboard.press('Tab');
    }
    check(
      stops[0] === 'a:launch plan' &&
        stops[1] === 'div:Table' &&
        stops[2] === 'button:Copy code' &&
        stops[3] === 'outside',
      `tab stops ${stops.join(' > ')}`,
    );
    await page.locator(`${VIEW} button[aria-label="Copy code"]`).focus();
    await settle(page);
    await frame('copy-focus', {stops});
  },
});

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `digit-tasks__light__${direction}`,
    group: 'digit tasks',
    story: DIGIT_TASKS_STORY,
    mode: 'light',
    direction,
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      // The RTL audit's overlay-side reading: where the first checkbox's
      // center falls across its list item, as a fraction of the item width.
      const side = await page.evaluate(view => {
        const root = document.querySelector(view) as HTMLElement;
        const holder = root.querySelector('[data-richtext-task-checkbox]');
        const item = root.querySelector('[data-lexical-editor] li');
        if (holder == null || item == null) {
          return null;
        }
        const box = holder.getBoundingClientRect();
        const line = item.getBoundingClientRect();
        return (box.left + box.width / 2 - line.left) / line.width;
      }, VIEW);
      check(
        side != null && (direction === 'rtl' ? side > 0.5 : side < 0.5),
        `checkbox side fraction ${side}`,
      );
      await frame('rest', {side});
    },
  });
}

cases.push({
  key: 'value-change__light__ltr',
  group: 'value change',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await page.locator('textarea').fill('# Updated title\n\nNew body text.');
    await settle(page);
    const text = await page
      .locator(VIEW)
      .evaluate(root => root.textContent ?? '');
    check(text.includes('Updated title'), `view text ${text}`);
    check(!text.includes('Release notes'), 'the old document is still shown');
    await frame('updated', {text});
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
  const story = item.story ?? STORY;
  const url = `${server.origin}/iframe.html?id=${story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
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
    const screenshot = await page
      .locator(VIEW)
      .screenshot({animations: 'disabled'});
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
    if (item.story == null) {
      await page.locator('textarea').fill(DOCUMENT);
    }
    await page
      .locator(`${VIEW} [data-richtext-task-checkbox]`)
      .first()
      .waitFor();
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
    component: 'RichTextView',
    build: storybookSha,
    checkout: checkoutSha,
    story,
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
