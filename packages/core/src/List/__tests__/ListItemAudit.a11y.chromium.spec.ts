// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit ListItem

/**
 * @file ListItemAudit.a11y.chromium.spec.ts
 * @input Exact-head List stories, driven through ListItem row states, across modes and direction
 * @output Screenshots and fail-closed sensor receipts for the ListItem whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a ListItem audit pull request
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

const OUTPUT = path.resolve('list-item-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};

type Check = (condition: boolean, message: string) => void;

type Frame = {state: string; observed: unknown};

type AuditCase = {
  key: string;
  story: string;
  ready: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

type FrameSink = (state: string, observed: unknown) => Promise<void>;

const SMALL = {width: 640, height: 420};

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

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

async function pageSensors(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    theme:
      document
        .querySelector('#storybook-root [data-astryx-theme]')
        ?.getAttribute('data-astryx-theme') ?? null,
    direction: getComputedStyle(
      document.querySelector('#storybook-root [dir]') as Element,
    ).direction,
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/** One row's paint, semantics, and focus facts, found by its label. */
async function rowFacts(page: Page, label: string) {
  return page.evaluate(text => {
    const row = Array.from(
      document.querySelectorAll('#storybook-root li'),
    ).find(li => li.textContent?.startsWith(text)) as HTMLElement;
    const control = row.querySelector('button, a');
    const style = getComputedStyle(row);
    const box = row.getBoundingClientRect();
    return {
      tag: row.tagName.toLowerCase(),
      classes: Array.from(row.classList).filter(name =>
        name.startsWith('astryx-'),
      ),
      background: style.backgroundColor,
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      ariaCurrent: row.getAttribute('aria-current'),
      ariaDisabled: row.getAttribute('aria-disabled'),
      control:
        control == null
          ? null
          : {
              tag: control.tagName.toLowerCase(),
              name: control.textContent || control.getAttribute('aria-label'),
              disabled: (control as HTMLButtonElement).disabled === true,
              ariaDisabled: control.getAttribute('aria-disabled'),
              href: control.getAttribute('href'),
              target: control.getAttribute('target'),
              rel: control.getAttribute('rel'),
              cursor: getComputedStyle(control).cursor,
              focused: document.activeElement === control,
              focusVisible: control.matches(':focus-visible'),
            },
      box: {left: box.left, right: box.right, top: box.top, height: box.height},
    };
  }, label);
}

function alphaOf(color: string) {
  const rgba = /rgba\([^)]*,\s*([\d.]+)\)/.exec(color);
  if (rgba) {
    return Number(rgba[1]);
  }
  return color.startsWith('rgb(') ? 1 : 0;
}

const cases: AuditCase[] = [];

for (const [mode, direction] of [
  ['light', 'ltr'],
  ['dark', 'ltr'],
  ['light', 'rtl'],
] as const) {
  cases.push({
    key: `interactive-states-${direction === 'rtl' ? 'rtl-' : ''}${mode}`,
    story: 'core-list--interactive',
    ready: '#storybook-root li',
    mode,
    direction,
    viewport: SMALL,
    run: async (page, check, frame) => {
      const rest = await rowFacts(page, 'Sent');
      const selected = await rowFacts(page, 'Inbox');
      check(rest.tag === 'li', `row element ${rest.tag}`);
      check(
        rest.classes.includes('astryx-list-item') &&
          rest.classes.includes('astryx-item'),
        `row targets ${rest.classes.join(' ')}`,
      );
      check(rest.control?.tag === 'button', `row control ${rest.control?.tag}`);
      check(
        selected.ariaCurrent === 'true',
        `selected row aria-current ${selected.ariaCurrent}`,
      );
      check(
        rest.ariaCurrent == null,
        `unselected row aria-current ${rest.ariaCurrent}`,
      );
      check(
        alphaOf(rest.background) === 0,
        `resting row paints ${rest.background}`,
      );
      // The start icon sits at the row's inline start in either direction.
      const iconSide = await page.evaluate(() => {
        const row = Array.from(
          document.querySelectorAll('#storybook-root li'),
        ).find(li => li.textContent?.startsWith('Sent')) as HTMLElement;
        const icons = Array.from(row.querySelectorAll('svg')).map(svg =>
          svg.getBoundingClientRect(),
        );
        const box = row.getBoundingClientRect();
        const centers = icons.map(r => (r.left + r.right) / 2 - box.left);
        // The end chevron, or an ancestor inside the row, carries the mirror.
        const svgs = Array.from(row.querySelectorAll('svg'));
        let node: Element | null =
          svgs.length > 0 ? svgs[svgs.length - 1] : null;
        let endMirrored = false;
        while (node != null && node !== row) {
          if (getComputedStyle(node).transform.startsWith('matrix(-1')) {
            endMirrored = true;
          }
          node = node.parentElement;
        }
        return {
          first: centers.length > 0 ? centers[0] : null,
          last: centers.length > 0 ? centers[centers.length - 1] : null,
          width: box.width,
          endMirrored,
        };
      });
      const startIcon =
        direction === 'rtl'
          ? Math.max(iconSide.first ?? 0, iconSide.last ?? 0)
          : Math.min(iconSide.first ?? 0, iconSide.last ?? 0);
      check(
        direction === 'rtl'
          ? startIcon > iconSide.width / 2
          : startIcon < iconSide.width / 2,
        `start icon at ${startIcon} of ${iconSide.width}`,
      );
      check(
        iconSide.endMirrored === (direction === 'rtl'),
        `end chevron mirrored ${iconSide.endMirrored} in ${direction}`,
      );
      await frame('rest', {rest, selected, iconSide});

      await page.getByRole('button', {name: 'Sent'}).hover();
      await settle(page);
      const hovered = await rowFacts(page, 'Sent');
      const hoverAlpha = alphaOf(hovered.background);
      check(
        hoverAlpha > 0 && hoverAlpha < 1,
        `hover paints ${hovered.background}, not a translucent overlay`,
      );
      await frame('hover', {hovered});

      await page.mouse.down();
      await settle(page);
      const pressed = await rowFacts(page, 'Sent');
      const pressedAlpha = alphaOf(pressed.background);
      check(
        pressedAlpha > hoverAlpha && pressedAlpha < 1,
        `press paints ${pressed.background} over hover ${hovered.background}`,
      );
      check(
        Math.abs(pressed.box.height - rest.box.height) < 0.5,
        `press changed the row height ${rest.box.height} -> ${pressed.box.height}`,
      );
      await frame('pressed', {pressed});
      await page.mouse.up();
      // A click outside the list moves the focus start back to the page, so
      // Tab reaches the first row.
      await page.mouse.click(2, 2);

      await page.keyboard.press('Tab');
      await settle(page);
      const focused = await rowFacts(page, 'Inbox');
      check(
        focused.control?.focused === true,
        'Tab did not reach the first row',
      );
      check(
        focused.control?.focusVisible === true,
        'the first row is not :focus-visible',
      );
      check(
        /^solid ([2-9]|\d{2,})(\.\d+)?px$/.test(focused.outline),
        `focused row ring ${focused.outline}`,
      );
      await frame('focus-visible', {focused});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `disabled-${mode}`,
    story: 'core-list--disabled-items',
    ready: '#storybook-root li',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const rest = await rowFacts(page, 'Unavailable');
      check(
        rest.ariaDisabled === 'true',
        `row aria-disabled ${rest.ariaDisabled}`,
      );
      check(
        rest.control?.disabled === false,
        'the disabled row control is native disabled',
      );
      check(
        rest.control?.ariaDisabled === 'true',
        `control aria-disabled ${rest.control?.ariaDisabled}`,
      );
      // A disabled row takes no pointer events, so the pointer is moved over
      // it rather than hovering it as a target.
      await page.mouse.move(
        (rest.box.left + rest.box.right) / 2,
        rest.box.top + rest.box.height / 2,
      );
      await settle(page);
      const hovered = await rowFacts(page, 'Unavailable');
      const underPointer = await page.evaluate(
        ([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit ? getComputedStyle(hit).cursor : null;
        },
        [
          (rest.box.left + rest.box.right) / 2,
          rest.box.top + rest.box.height / 2,
        ] as const,
      );
      check(
        alphaOf(hovered.background) === 0,
        `disabled row paints ${hovered.background} under the pointer`,
      );
      // The row is never hit-tested, so the pointer shows what the list
      // under it shows: never an interactive cursor.
      check(
        underPointer === 'default' || underPointer === 'auto',
        `the pointer over the disabled row shows ${underPointer}`,
      );
      await frame('hover', {rest, hovered, underPointer});
      // The disabled row stays in the tab order: Available, then Unavailable.
      await page.mouse.move(2, 2);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await settle(page);
      const focused = await rowFacts(page, 'Unavailable');
      check(focused.control?.focused === true, 'Tab skipped the disabled row');
      await frame('focus-visible', {focused});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  for (const listStyle of ['disc', 'circle', 'decimal'] as const) {
    cases.push({
      key: `marker-${listStyle}-${mode}`,
      // Rows with a description are two lines tall, so a marker centered on
      // the whole row misses the label's first line.
      story: `core-list--ordered-list&args=listStyle:${listStyle}`,
      ready: '#storybook-root li',
      mode,
      direction: 'ltr',
      viewport: SMALL,
      run: async (page, check, frame) => {
        const markers = await page.evaluate(() =>
          Array.from(document.querySelectorAll('#storybook-root li')).map(
            li => {
              const walker = document.createTreeWalker(
                li,
                NodeFilter.SHOW_TEXT,
              );
              const text = walker.nextNode();
              const range = document.createRange();
              if (text) {
                range.selectNodeContents(text);
              }
              const line = range.getClientRects()[0];
              const spans = Array.from(li.querySelectorAll('span'));
              // The bullet is the small square box; the number is the span
              // whose ::before content is the list counter.
              const marker =
                spans.find(span =>
                  getComputedStyle(span, '::before').content.includes(
                    'counter(',
                  ),
                ) ??
                spans.find(span => {
                  const r = span.getBoundingClientRect();
                  return r.width > 0 && r.width <= 8 && r.width === r.height;
                }) ??
                null;
              const box = marker?.getBoundingClientRect();
              const row = li.getBoundingClientRect();
              return {
                text: text?.textContent ?? null,
                lineTop: line?.top ?? null,
                lineBottom: line?.bottom ?? null,
                rowCenter: row.top + row.height / 2,
                markerCenter: box ? box.top + box.height / 2 : null,
                markerBefore: marker
                  ? getComputedStyle(marker, '::before').content
                  : null,
              };
            },
          ),
        );
        for (const item of markers) {
          check(
            item.markerCenter != null &&
              item.lineTop != null &&
              item.lineBottom != null &&
              item.markerCenter > item.lineTop &&
              item.markerCenter < item.lineBottom &&
              item.markerCenter < item.rowCenter,
            `${item.text}: marker center ${item.markerCenter} off the first line ${item.lineTop}-${item.lineBottom} (row center ${item.rowCenter})`,
          );
          if (listStyle === 'decimal') {
            check(
              item.markerBefore?.includes('counter(astryx-list)') === true,
              `${item.text}: number marker ${item.markerBefore}`,
            );
          }
        }
        await frame('rest', {markers});
      },
    });
  }
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `links-${mode}`,
    story: 'core-list--links',
    ready: '#storybook-root li a',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const docs = await rowFacts(page, 'Documentation');
      const external = await rowFacts(page, 'GitHub');
      check(
        docs.control?.tag === 'a' && docs.control.href === '/docs',
        `docs link ${JSON.stringify(docs.control)}`,
      );
      check(
        external.control?.target === '_blank',
        `external target ${external.control?.target}`,
      );
      check(
        (external.control?.rel ?? '').includes('noopener') &&
          (external.control?.rel ?? '').includes('noreferrer'),
        `external rel ${external.control?.rel}`,
      );
      const links = await page.getByRole('link').count();
      check(links === 3, `${links} links for 3 rows`);
      await frame('rest', {docs, external, links});
    },
  });
}

/**
 * The test that runs a case. Cases that share a test share one browser
 * context, so a run needs one browser context per group.
 */
function groupOf(key: string): string {
  return ['interactive-states', 'disabled', 'marker', 'links'].find(prefix =>
    key.startsWith(prefix),
  ) as string;
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(item.ready).first().waitFor();
  await settle(page);

  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  const sensors = await pageSensors(page);
  check(!sensors.storybookError, 'storybook error display');
  check(sensors.mode === item.mode, `mode ${sensors.mode}`);
  check(sensors.theme === 'neutral', `theme ${sensors.theme}`);
  check(sensors.direction === item.direction, `direction ${sensors.direction}`);
  check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
  check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);

  const frames: (Frame & {file: string; sha256: string})[] = [];
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
  await item.run(page, check, frame);
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

  const receipt = {
    component: 'ListItem',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    direction: item.direction,
    viewport: item.viewport,
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

for (const group of [...new Set(cases.map(item => groupOf(item.key)))]) {
  test(group, async ({browser}) => {
    const context = await browser.newContext({deviceScaleFactor: 2});
    try {
      const page = await context.newPage();
      const failures: string[] = [];
      for (const item of cases.filter(c => groupOf(c.key) === group)) {
        failures.push(...(await runCase(page, item)));
      }
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
