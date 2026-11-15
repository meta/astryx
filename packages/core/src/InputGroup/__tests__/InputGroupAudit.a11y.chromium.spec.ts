// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit InputGroup

/**
 * @file InputGroupAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/InputGroup stories across sizes, states, themes, modes, and direction
 * @output Screenshots and fail-closed sensor receipts for the InputGroup whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an InputGroup audit pull request
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

const OUTPUT = path.resolve('input-group-audit-evidence');
const VIEWPORT = {width: 640, height: 400};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'action-button-combinations'
  | 'with-prefix-and-suffix'
  | 'with-error-status'
  | 'disabled'
  | 'with-prefix'
  | 'with-description'
  | 'adjacent-inputs';
type Interaction = 'none' | 'focus-first' | 'focus-second';

type GroupSpec = {label: string; size: string; description?: string};

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  interaction: Interaction;
  args?: Record<string, unknown>;
  suffix?: string;
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

// The groups each story renders, in document order.
const STORY: Record<Story, {groups: GroupSpec[]; state?: string}> = {
  'action-button-combinations': {
    groups: [
      {label: 'Prefix action', size: 'sm'},
      {label: 'Text action', size: 'md'},
      {label: 'Selector action', size: 'lg'},
    ],
  },
  'with-prefix-and-suffix': {groups: [{label: 'Website', size: 'md'}]},
  'with-error-status': {
    groups: [{label: 'Price', size: 'md'}],
    state: 'error',
  },
  disabled: {
    groups: [
      {
        label: 'Website',
        size: 'md',
        description: 'The input and action inherit the group disabled state.',
      },
    ],
    state: 'disabled',
  },
  'with-prefix': {groups: [{label: 'Price', size: 'md'}]},
  'adjacent-inputs': {groups: [{label: 'Phone', size: 'md'}]},
  'with-description': {
    groups: [
      {label: 'Username', size: 'md', description: 'Your public display name'},
    ],
  },
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    direction?: Direction;
    interaction?: Interaction;
    modes?: Mode[];
    args?: Record<string, unknown>;
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
      args: options.args,
      suffix: options.suffix,
    });
  }
}

add('action-button-combinations');
add('action-button-combinations', {theme: 'butter', modes: ['light']});
add('action-button-combinations', {
  interaction: 'focus-first',
  modes: ['light'],
});
add('action-button-combinations', {
  interaction: 'focus-second',
  modes: ['light'],
});
add('with-prefix-and-suffix');
add('with-prefix-and-suffix', {theme: 'butter', modes: ['light']});
add('with-prefix-and-suffix', {direction: 'rtl', modes: ['light']});
add('with-error-status');
add('disabled');
add('with-prefix', {
  suffix: 'hidden-label',
  args: {isLabelHidden: true},
  modes: ['light'],
});
add('with-description', {modes: ['light']});
add('adjacent-inputs', {modes: ['light']});
add('adjacent-inputs', {interaction: 'focus-first'});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-inputgroup--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
    function box(element: Element) {
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
    const px = (value: string) => parseFloat(value) || 0;
    const text = (id: string) =>
      document.getElementById(id)?.textContent?.trim() ?? '';
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#storybook-root .astryx-input-group',
      ),
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
      activeTag: document.activeElement?.tagName ?? null,
      groups: groups.map(group => {
        const style = getComputedStyle(group);
        const labelId = group.getAttribute('aria-labelledby') ?? '';
        const label = document.getElementById(labelId);
        const describedBy = (group.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter(Boolean);
        const status = describedBy
          .map(id =>
            document.getElementById(id)?.closest('.astryx-field-status'),
          )
          .find(element => element != null);
        // A visually hidden label sits in a 1px box that clips it.
        let labelHidden = false;
        for (
          let node: Element | null = label;
          node != null && node !== group.parentElement;
          node = node.parentElement
        ) {
          const rect = node.getBoundingClientRect();
          const nodeStyle = getComputedStyle(node);
          if (
            rect.width <= 1 &&
            rect.height <= 1 &&
            (nodeStyle.overflow === 'hidden' || nodeStyle.clip !== 'auto')
          ) {
            labelHidden = true;
            break;
          }
        }
        const children = Array.from(group.children).filter(
          child =>
            !child.matches('[popover], template, dialog') &&
            (child as HTMLElement).checkVisibility(),
        );
        return {
          role: group.getAttribute('role'),
          direction: style.direction,
          labelText: label?.textContent?.trim() ?? null,
          labelBox: label ? box(label) : null,
          describedBy: describedBy.map(text),
          statusBox: status ? box(status) : null,
          statusHasIcon:
            status?.querySelector('.astryx-field-status-icon') != null,
          labelHidden,
          dataSize: group.getAttribute('data-size'),
          dataStatus: group.getAttribute('data-status'),
          ariaDisabled: group.getAttribute('aria-disabled'),
          opacity: style.opacity,
          cursor: style.cursor,
          box: box(group),
          members: children.map(child => {
            const childStyle = getComputedStyle(child);
            const focusable = child.matches('button, input, [tabindex]')
              ? child
              : child.querySelector('button, input, [role="combobox"]');
            return {
              tag: child.tagName,
              className:
                typeof child.className === 'string'
                  ? child.className
                      .split(/\s+/)
                      .filter(name => name.startsWith('astryx-'))
                      .join(' ')
                  : '',
              marked: child.hasAttribute('data-astryx-input-group-item'),
              box: box(child),
              zIndex: childStyle.zIndex,
              radius: {
                topLeft: px(childStyle.borderTopLeftRadius),
                topRight: px(childStyle.borderTopRightRadius),
                bottomRight: px(childStyle.borderBottomRightRadius),
                bottomLeft: px(childStyle.borderBottomLeftRadius),
              },
              focusWithin: child.matches(':focus-within'),
              focusVisible:
                child.matches(':focus-visible') ||
                child.querySelector(':focus-visible') != null,
              outlineStyle: childStyle.outlineStyle,
              outlineWidth: childStyle.outlineWidth,
              disabled:
                focusable == null
                  ? null
                  : (focusable as HTMLButtonElement).disabled ||
                    focusable.getAttribute('aria-disabled') === 'true',
              name: focusable?.getAttribute('aria-label') ?? null,
            };
          }),
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
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root .astryx-input-group').first().waitFor();
    await settle(page);
    if (item.args) {
      await page.evaluate(async args => {
        const channel = (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
              once: (event: string, listener: () => void) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__;
        const storyId = new URLSearchParams(location.search).get('id');
        await new Promise<void>(resolve => {
          channel.once('storyRendered', () => resolve());
          channel.emit('updateStoryArgs', {storyId, updatedArgs: args});
        });
      }, item.args);
      await settle(page);
    }
    // Tab reaches the first group's first member, then its second.
    if (item.interaction === 'focus-first') {
      await page.keyboard.press('Tab');
    }
    if (item.interaction === 'focus-second') {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
    }
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.groups.map(group => group.box)) ===
      JSON.stringify(observed.groups.map(group => group.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 0.6) =>
      Math.abs(actual - expected) <= tolerance;
    const spec = STORY[item.story];

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.viewport.width === VIEWPORT.width &&
        observed.viewport.height === VIEWPORT.height,
      'viewport mismatch',
    );
    check(observed.dpr === 2, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(
      observed.groups.length === spec.groups.length,
      `${observed.groups.length} groups, expected ${spec.groups.length}`,
    );

    observed.groups.forEach((group, index) => {
      const expected = spec.groups[index];
      if (expected == null) {
        return;
      }
      const where = `group ${index} (${expected.label})`;
      check(group.role === 'group', `${where} role ${group.role}`);
      check(
        group.labelText === expected.label,
        `${where} named ${group.labelText}`,
      );
      check(
        group.direction === item.direction,
        `${where} direction ${group.direction}`,
      );
      check(
        group.dataSize === expected.size,
        `${where} data-size ${group.dataSize}`,
      );
      if (expected.description) {
        check(
          group.describedBy[0] === expected.description,
          `${where} described by ${group.describedBy.join(' | ')}`,
        );
      }
      const marked = group.members.filter(member => member.marked);
      check(
        group.members.length >= 2 && marked.length >= 1,
        `${where} has ${group.members.length} members, ${marked.length} joined`,
      );
      // Every joined member fills the row height.
      for (const member of marked) {
        check(
          near(member.box.height, group.box.height),
          `${where} ${member.className} height ${member.box.height} vs row ${group.box.height}`,
        );
      }
      // Only the row's outer corners round.
      const rtl = item.direction === 'rtl';
      group.members.forEach((member, position) => {
        if (!member.marked) {
          return;
        }
        const startTop = rtl ? member.radius.topRight : member.radius.topLeft;
        const startBottom = rtl
          ? member.radius.bottomRight
          : member.radius.bottomLeft;
        const endTop = rtl ? member.radius.topLeft : member.radius.topRight;
        const endBottom = rtl
          ? member.radius.bottomLeft
          : member.radius.bottomRight;
        const isFirst = position === 0;
        const isLast = position === group.members.length - 1;
        if (isFirst) {
          check(
            startTop > 0 && startBottom > 0,
            `${where} first member ${member.className} start corners are square`,
          );
        } else {
          check(
            startTop === 0 && startBottom === 0,
            `${where} ${member.className} rounds toward its start neighbour`,
          );
        }
        if (isLast) {
          check(
            endTop > 0 && endBottom > 0,
            `${where} last member ${member.className} end corners are square`,
          );
        } else {
          check(
            endTop === 0 && endBottom === 0,
            `${where} ${member.className} rounds toward its end neighbour`,
          );
        }
      });
      // The first member sits at the inline start of the row.
      const firstMember = group.members[0];
      const lastMember = group.members[group.members.length - 1];
      if (firstMember && lastMember && group.members.length > 1) {
        check(
          rtl
            ? firstMember.box.left > lastMember.box.left
            : firstMember.box.left < lastMember.box.left,
          `${where} members do not follow ${item.direction} order`,
        );
      }
    });

    if (item.story === 'action-button-combinations') {
      const heights = observed.groups.map(group => group.box.height);
      check(
        heights.length === 3 &&
          heights[0] < heights[1] &&
          heights[1] < heights[2],
        `row heights do not grow sm < md < lg: ${heights.join(', ')}`,
      );
    }

    if (item.interaction !== 'none') {
      const members = observed.groups[0]?.members ?? [];
      const focusedIndex = item.interaction === 'focus-first' ? 0 : 1;
      const focused = members[focusedIndex];
      const z = (value: string | undefined) =>
        value == null || value === 'auto' ? 0 : Number(value);
      // An unfocused member anywhere in the story: the neighbour, and every
      // input in the other groups, which an adjacent input would match.
      const unfocused = observed.groups
        .flatMap(group => group.members)
        .filter(member => member.marked && member !== focused);
      check(
        focused != null && focused.focusWithin && focused.focusVisible,
        `member ${focusedIndex} is not keyboard focused`,
      );
      check(
        focused != null &&
          unfocused.length > 0 &&
          unfocused.every(member => z(focused.zIndex) > z(member.zIndex)),
        `focused member z-index ${focused?.zIndex} is not above every unfocused member: ${unfocused.map(member => `${member.className}=${member.zIndex}`).join(', ')}`,
      );
    }

    if (spec.state === 'error') {
      const group = observed.groups[0];
      check(group?.dataStatus === 'error', `data-status ${group?.dataStatus}`);
      check(
        group?.describedBy.includes('Price is required') ?? false,
        `status message not in the description: ${group?.describedBy.join(' | ')}`,
      );
      check(
        group?.statusBox != null &&
          group.statusBox.top >= group.box.bottom - 0.5,
        'status message is not below the row',
      );
    }

    if (spec.state === 'disabled') {
      const group = observed.groups[0];
      check(
        group?.ariaDisabled === 'true',
        `aria-disabled ${group?.ariaDisabled}`,
      );
      check(group?.opacity === '0.5', `opacity ${group?.opacity}`);
      check(group?.cursor === 'default', `cursor ${group?.cursor}`);
      for (const member of group?.members ?? []) {
        if (member.disabled != null) {
          check(member.disabled, `${member.className} is still operable`);
        }
      }
    }

    if (item.args?.isLabelHidden) {
      check(
        observed.groups[0]?.labelHidden === true,
        `hidden label is visible: ${JSON.stringify(observed.groups[0]?.labelBox)}`,
      );
    }

    const png = await page.screenshot({animations: 'disabled'});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-inputgroup--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        direction: item.direction,
        viewport: VIEWPORT,
        interaction: item.interaction,
        args: item.args ?? null,
        ...spec,
        anatomy:
          'one role="group" row per InputGroup, named by its label and described by its description then status; data-size per group; direct members joined in the row',
        geometry:
          'every joined member fills the row height; only the outer start corners of the first member and the outer end corners of the last member round, mirrored in RTL; row heights grow sm < md < lg',
        state:
          'focus: the keyboard-focused member is above every unfocused member, inputs included; error: data-status error and the message below the row, in the description; disabled: aria-disabled, half opacity, default cursor, members unavailable; hidden label: no visible box, still the group name',
      },
      observed: {
        build: storybookSha,
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
        component: 'core/InputGroup',
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
