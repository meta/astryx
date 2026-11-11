// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Item

/**
 * @file ItemAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Item stories across states, densities, alignment, themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the Item whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an Item audit pull request
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

const OUTPUT = path.resolve('item-audit-evidence');
const WIDE = {width: 640, height: 480};
const TALL = {width: 640, height: 1400};
const NARROW = {width: 320, height: 480};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'states'
  | 'compact-menu'
  | 'spacious-rows'
  | 'align-first-line'
  | 'contact-list';
type Interaction = 'none' | 'tab' | 'hover-rest' | 'hover-disabled';

type RowState = {
  label: string;
  highlighted?: boolean;
  selected?: boolean;
  disabled?: boolean;
};

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  interaction: Interaction;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

// The rows of the States story, in document order.
const STATE_ROWS: RowState[] = [
  {label: 'Rest'},
  {label: 'Highlighted', highlighted: true},
  {label: 'Selected', selected: true},
  {label: 'Disabled', disabled: true},
  {label: 'Selected and disabled', selected: true, disabled: true},
];

// The density each story's rows use.
const DENSITY: Partial<Record<Story, string>> = {
  states: 'balanced',
  'compact-menu': 'compact',
  'spacious-rows': 'spacious',
  'contact-list': 'balanced',
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    direction?: Direction;
    interaction?: Interaction;
    modes?: Mode[];
    viewport?: {width: number; height: number};
    suffix?: string;
  } = {},
) {
  const theme = options.theme ?? 'neutral';
  const direction = options.direction ?? 'ltr';
  const interaction = options.interaction ?? 'none';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, options.suffix ?? '', theme];
    if (direction === 'rtl') {
      parts.push('rtl');
    }
    if (interaction !== 'none') {
      parts.push(interaction);
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      mode,
      theme,
      direction,
      interaction,
      viewport: options.viewport ?? WIDE,
    });
  }
}

add('states');
add('states', {theme: 'butter', modes: ['light']});
add('states', {direction: 'rtl', modes: ['light']});
add('states', {interaction: 'tab'});
add('states', {interaction: 'hover-rest', modes: ['light']});
add('states', {interaction: 'hover-disabled', modes: ['light']});
add('compact-menu', {modes: ['light']});
add('spacious-rows', {modes: ['light']});
add('align-first-line', {viewport: TALL});
add('contact-list', {suffix: 'narrow', viewport: NARROW, modes: ['light']});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-item--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
    const round = (value: number) => Math.round(value * 10) / 10;
    const px = (value: string) => parseFloat(value) || 0;
    function box(rect: DOMRect) {
      return {
        left: round(rect.left),
        top: round(rect.top),
        right: round(rect.right),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    // Resolve the row tokens in the row's own theme scope, through a probe
    // that takes its paint from the same custom properties.
    function resolveTokens(host: Element) {
      const probe = document.createElement('div');
      probe.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'background-color:var(--color-accent-muted)',
        'color:var(--color-overlay-hover)',
        'padding-top:var(--spacing-1)',
        'padding-right:var(--spacing-2)',
        'padding-bottom:var(--spacing-3)',
        'outline-style:solid',
        'outline-width:var(--focus-outline-width)',
      ].join(';');
      host.appendChild(probe);
      const style = getComputedStyle(probe);
      const tokens = {
        selected: style.backgroundColor,
        highlighted: style.color,
        spacing1: px(style.paddingTop),
        spacing2: px(style.paddingRight),
        spacing3: px(style.paddingBottom),
        focusOutlineWidth: px(style.outlineWidth),
      };
      probe.remove();
      return tokens;
    }
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('#storybook-root .astryx-item'),
    );
    const active = document.activeElement as HTMLElement | null;
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
      // The preview sets the story direction on a wrapper inside the root.
      documentDirection: (() => {
        const frame = document.querySelector('#storybook-root [dir]');
        return frame ? getComputedStyle(frame).direction : null;
      })(),
      documentOverflow: round(
        document.documentElement.scrollWidth - innerWidth,
      ),
      active: {
        tag: active?.tagName ?? null,
        rowIndex: active ? rows.findIndex(row => row.contains(active)) : -1,
        focusVisible: active?.matches(':focus-visible') ?? false,
      },
      rows: rows.map(row => {
        const style = getComputedStyle(row);
        const action = row.querySelector<HTMLElement>(
          ':scope > button, :scope > a',
        );
        // The text cell is the row's growing child: its action, or a plain
        // span. The label is its first child.
        const content =
          action ??
          (Array.from(row.children).find(
            child => getComputedStyle(child).flexGrow === '1',
          ) as HTMLElement | undefined) ??
          null;
        const label = content?.firstElementChild ?? null;
        const labelStyle = label ? getComputedStyle(label) : null;
        // How many lines the label takes with no clamp: an unclamped copy at
        // the same width.
        let labelNaturalLines = 0;
        if (label != null && labelStyle != null && label.parentElement) {
          const copy = label.cloneNode(true) as HTMLElement;
          copy.style.cssText = `display:block;-webkit-line-clamp:unset;overflow:visible;white-space:normal;position:absolute;visibility:hidden;inline-size:${label.getBoundingClientRect().width}px`;
          label.parentElement.appendChild(copy);
          labelNaturalLines = Math.round(
            copy.getBoundingClientRect().height / px(labelStyle.lineHeight),
          );
          copy.remove();
        }
        return {
          text: label?.textContent?.trim() ?? '',
          caseName:
            row.closest<HTMLElement>('[data-first-line-case]')?.dataset
              .firstLineCase ?? null,
          labelHeight: label ? round(label.getBoundingClientRect().height) : 0,
          labelLineHeight: labelStyle ? px(labelStyle.lineHeight) : 0,
          labelOverflows: label
            ? label.scrollHeight > label.clientHeight
            : false,
          labelNaturalLines,
          direction: style.direction,
          // A story may set its own direction on a case wrapper.
          expectedDirection: row.closest('[dir]')?.getAttribute('dir') ?? 'ltr',
          box: box(row.getBoundingClientRect()),
          data: {
            density: row.getAttribute('data-density'),
            align: row.getAttribute('data-align'),
            highlighted: row.getAttribute('data-highlighted'),
            selected: row.getAttribute('data-selected'),
            disabled: row.getAttribute('data-disabled'),
          },
          ariaCurrent: row.getAttribute('aria-current'),
          ariaSelected: row.getAttribute('aria-selected'),
          ariaDisabled: row.getAttribute('aria-disabled'),
          actionTag: action?.tagName ?? null,
          actionDisabled:
            action == null
              ? null
              : (action as HTMLButtonElement).disabled ||
                action.getAttribute('aria-disabled') === 'true',
          background: style.backgroundColor,
          contentOpacity: content ? getComputedStyle(content).opacity : null,
          cursor: style.cursor,
          pointerEvents: style.pointerEvents,
          outlineStyle: style.outlineStyle,
          outlineWidth: px(style.outlineWidth),
          padding: {
            blockStart: px(style.paddingBlockStart),
            blockEnd: px(style.paddingBlockEnd),
            inlineStart: px(style.paddingInlineStart),
            inlineEnd: px(style.paddingInlineEnd),
          },
          tokens: resolveTokens(row),
        };
      }),
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
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root .astryx-item').first().waitFor();
    await settle(page);
    // The pointer starts outside every row.
    await page.mouse.move(item.viewport.width - 1, item.viewport.height - 1);
    const rest = await observe(page);
    if (item.interaction === 'tab') {
      await page.keyboard.press('Tab');
    }
    if (item.interaction === 'hover-rest') {
      await page.getByText('Rest', {exact: true}).hover();
    }
    if (item.interaction === 'hover-disabled') {
      // The disabled row takes no pointer events, so move the pointer over
      // it instead of asking Playwright to hover an element it cannot hit.
      const target = await page
        .getByText('Disabled', {exact: true})
        .boundingBox();
      if (target == null) {
        throw new Error('the disabled row label has no box');
      }
      await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
    }
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.rows.map(row => row.box)) ===
      JSON.stringify(observed.rows.map(row => row.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 0.6) =>
      Math.abs(actual - expected) <= tolerance;

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(observed.dpr === 2, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(observed.rows.length > 0, 'no rows');
    check(
      observed.documentDirection === item.direction,
      `document direction ${observed.documentDirection}`,
    );
    check(
      observed.documentOverflow <= 0,
      `document scrolls sideways by ${observed.documentOverflow}px`,
    );

    const density = DENSITY[item.story];
    observed.rows.forEach((row, index) => {
      const where = `row ${index} (${row.text})`;
      check(
        row.direction === row.expectedDirection,
        `${where} ${row.direction}, expected ${row.expectedDirection}`,
      );
      if (density != null) {
        check(
          row.data.density === density,
          `${where} density ${row.data.density}`,
        );
        const block =
          density === 'compact'
            ? row.tokens.spacing1
            : density === 'spacious'
              ? row.tokens.spacing3
              : row.tokens.spacing2;
        const inline =
          density === 'spacious' ? row.tokens.spacing3 : row.tokens.spacing2;
        check(
          near(row.padding.blockStart, block) &&
            near(row.padding.blockEnd, block),
          `${where} block padding ${row.padding.blockStart}/${row.padding.blockEnd}, expected ${block}`,
        );
        check(
          near(row.padding.inlineStart, inline) &&
            near(row.padding.inlineEnd, inline),
          `${where} inline padding ${row.padding.inlineStart}/${row.padding.inlineEnd}, expected ${inline}`,
        );
      }
      if (item.story === 'align-first-line') {
        check(
          row.data.align === 'first-line',
          `${where} align ${row.data.align}`,
        );
        // labelLines={2}: the label shows two lines and clips the rest.
        if (row.caseName === 'clamped') {
          check(
            row.labelNaturalLines > 2,
            `${where} fixture does not exceed two lines (${row.labelNaturalLines})`,
          );
          check(
            row.labelHeight <= 2 * row.labelLineHeight + 0.5 &&
              row.labelHeight > row.labelLineHeight + 0.5 &&
              row.labelOverflows,
            `${where} clamped label ${row.labelHeight}px at ${row.labelLineHeight}px lines, overflows ${row.labelOverflows}`,
          );
        }
      }
    });

    if (item.story === 'states') {
      check(
        JSON.stringify(observed.rows.map(row => row.text)) ===
          JSON.stringify(STATE_ROWS.map(row => row.label)),
        `rows ${JSON.stringify(observed.rows.map(row => row.text))}`,
      );
      STATE_ROWS.forEach((expected, index) => {
        const row = observed.rows[index];
        const before = rest.rows[index];
        if (row == null || before == null) {
          return;
        }
        const where = `row ${index} (${expected.label})`;
        // Each state rides the item target.
        check(
          row.data.highlighted ===
            (expected.highlighted === true ? 'highlighted' : null),
          `${where} data-highlighted ${row.data.highlighted}`,
        );
        check(
          row.data.selected ===
            (expected.selected === true ? 'selected' : null),
          `${where} data-selected ${row.data.selected}`,
        );
        check(
          row.data.disabled ===
            (expected.disabled === true ? 'disabled' : null),
          `${where} data-disabled ${row.data.disabled}`,
        );
        // Selection reaches assistive technology on a role-less row.
        check(
          row.ariaCurrent === (expected.selected === true ? 'true' : null),
          `${where} aria-current ${row.ariaCurrent}`,
        );
        check(
          row.ariaSelected == null,
          `${where} aria-selected ${row.ariaSelected}`,
        );
        // Paint at rest.
        if (expected.selected === true) {
          check(
            before.background === before.tokens.selected,
            `${where} background ${before.background}, expected ${before.tokens.selected}`,
          );
        } else if (expected.highlighted === true) {
          check(
            before.background === before.tokens.highlighted,
            `${where} background ${before.background}, expected ${before.tokens.highlighted}`,
          );
        }
        // Disabled: no action, dimmed content, no pointer response.
        check(row.actionTag === 'BUTTON', `${where} action ${row.actionTag}`);
        check(
          row.actionDisabled === (expected.disabled === true),
          `${where} action disabled ${row.actionDisabled}`,
        );
        check(
          row.ariaDisabled === (expected.disabled === true ? 'true' : null),
          `${where} aria-disabled ${row.ariaDisabled}`,
        );
        check(
          row.contentOpacity === (expected.disabled === true ? '0.5' : '1'),
          `${where} content opacity ${row.contentOpacity}`,
        );
        if (expected.disabled === true) {
          check(
            row.pointerEvents === 'none',
            `${where} pointer-events ${row.pointerEvents}`,
          );
        } else {
          check(row.cursor === 'pointer', `${where} cursor ${row.cursor}`);
        }
      });
      if (item.interaction === 'tab') {
        check(
          observed.active.tag === 'BUTTON' &&
            observed.active.rowIndex === 0 &&
            observed.active.focusVisible,
          `first Tab stop ${JSON.stringify(observed.active)}, expected the first row's button`,
        );
        const focused = observed.rows[0];
        check(
          focused != null &&
            focused.outlineStyle !== 'none' &&
            near(focused.outlineWidth, focused.tokens.focusOutlineWidth, 0.01),
          `focused row outline ${focused?.outlineStyle} ${focused?.outlineWidth}`,
        );
      }
      if (item.interaction === 'hover-rest') {
        const hovered = observed.rows[0];
        check(
          hovered != null && hovered.background !== rest.rows[0]?.background,
          `hovered rest row background ${hovered?.background} did not change`,
        );
      }
      if (item.interaction === 'hover-disabled') {
        const hovered = observed.rows[3];
        check(
          hovered != null && hovered.background === rest.rows[3]?.background,
          `hovered disabled row background changed to ${hovered?.background}`,
        );
      }
    }

    if (item.viewport === NARROW) {
      observed.rows.forEach((row, index) => {
        check(
          row.box.right <= item.viewport.width + 0.5 && row.box.left >= -0.5,
          `row ${index} leaves the viewport: ${JSON.stringify(row.box)}`,
        );
      });
    }

    const png = await page.screenshot({animations: 'disabled', fullPage: true});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-item--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        direction: item.direction,
        viewport: item.viewport,
        interaction: item.interaction,
        rows: item.story === 'states' ? STATE_ROWS : null,
        density: density ?? null,
        states:
          'states: data-highlighted, data-selected and data-disabled on the astryx-item root match each row; a selected role-less row has aria-current="true"; selected rows paint accent-muted and highlighted rows overlay-hover at rest, resolved in the row scope',
        disabled:
          'disabled rows: a native disabled button, aria-disabled on the root, content at half opacity, pointer-events none; enabled interactive rows answer with a pointer cursor',
        padding:
          'block padding spacing-1 (compact), spacing-2 (balanced), spacing-3 (spacious); inline padding spacing-2, spacing-3 when spacious',
        focus:
          "tab: the first Tab stop is the first row's button, focus-visible, and the row root draws an outline of the theme focus outline width",
        hover:
          'hover-rest: the rest row paints a hover background; hover-disabled: the disabled row paints nothing new',
        layout:
          'no sideways document scroll; at 320px every row stays inside the viewport; align-first-line: the labelLines={2} label shows two lines and clips the rest',
      },
      observed: {
        build: storybookSha,
        rest,
        ...observed,
        geometryStable,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      failures,
      passed: failures.length === 0,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await context.close();
    expect(failures).toEqual([]);
  });
}

test('manifest is complete', async () => {
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
        component: 'core/Item',
        build: checkoutSha,
        frames: cases.map(item => ({
          key: item.key,
          image: `${item.key}.png`,
          receipt: `${item.key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(receiptFiles).toHaveLength(cases.length);
  // A receipt left by an earlier build does not count.
  expect(
    receipts
      .filter(receipt => receipt.expected.build !== checkoutSha)
      .map(receipt => receipt.expected),
  ).toEqual([]);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
