// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit RichTextEditorAutoLinkPlugin

/**
 * @file RichTextEditorAutoLinkPluginAudit.a11y.chromium.spec.ts
 * @input Exact-head "With Auto Link" RichTextEditor story, driven with real
 *   key presses and a real paste event: URLs, scheme-less hosts, email
 *   addresses, code blocks, an edit that breaks a match, Tab, light and dark,
 *   both directions, and a narrow viewport
 * @output Screenshots and fail-closed sensor receipts for the
 *   RichTextEditorAutoLinkPlugin whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a RichTextEditorAutoLinkPlugin audit pull request
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

const EVIDENCE = path.resolve('test-results/richtext-autolink-audit-evidence');
const STORY = 'richtext-richtexteditor--with-auto-link';
const NEW_TAB = {target: '_blank', rel: 'noopener noreferrer'};

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 600};
const NARROW = {width: 320, height: 600};

test.describe.configure({retries: 0});

let OUTPUT = EVIDENCE;
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

/** Every anchor in the editor, with the attributes the plugin writes. */
async function readLinks(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector(
      '#storybook-root [contenteditable="true"]',
    ) as HTMLElement;
    const editorBox = editor.getBoundingClientRect();
    return [...editor.querySelectorAll('a')].map(anchor => {
      const box = anchor.getBoundingClientRect();
      return {
        text: anchor.textContent,
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        rel: anchor.getAttribute('rel'),
        inCode: anchor.closest('code, pre, [data-language]') != null,
        insideEditor:
          box.left >= editorBox.left - 0.5 &&
          box.right <= editorBox.right + 0.5,
      };
    });
  });
}

async function typeInEditor(page: Page, text: string) {
  const editor = page.locator('#storybook-root [contenteditable="true"]');
  await editor.click();
  await page.keyboard.type(text);
  await settle(page);
}

function checkNewTabLink(
  check: Check,
  links: Awaited<ReturnType<typeof readLinks>>,
  text: string,
  href: string,
) {
  const link = links.find(candidate => candidate.text === text);
  check(link != null, `no link for "${text}": ${JSON.stringify(links)}`);
  if (link == null) {
    return;
  }
  check(link.href === href, `"${text}" href ${link.href}, expected ${href}`);
  check(link.target === NEW_TAB.target, `"${text}" target ${link.target}`);
  check(link.rel === NEW_TAB.rel, `"${text}" rel ${link.rel}`);
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `typed__${mode}__${direction}`,
      group: 'typed URL, host and email',
      mode,
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        await typeInEditor(
          page,
          'Visit https://example.com/docs or www.example.org, or write to team@example.com today. ',
        );
        const links = await readLinks(page);
        check(links.length === 3, `${links.length} links`);
        checkNewTabLink(
          check,
          links,
          'https://example.com/docs',
          'https://example.com/docs',
        );
        checkNewTabLink(
          check,
          links,
          'www.example.org',
          'https://www.example.org/',
        );
        checkNewTabLink(
          check,
          links,
          'team@example.com',
          'mailto:team@example.com',
        );
        for (const name of [
          'https://example.com/docs',
          'www.example.org',
          'team@example.com',
        ]) {
          const count = await page
            .getByRole('link', {name, exact: true})
            .count();
          check(count === 1, `link named "${name}": ${count}`);
        }
        const axeResult = await checkAxe(page, check);
        await frame('linked', {links, axe: axeResult});
      },
    });
  }
}

cases.push({
  key: 'paste__light__ltr',
  group: 'paste',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    const editor = page.locator('#storybook-root [contenteditable="true"]');
    await editor.click();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', 'Read https://example.com/guide later');
      document.activeElement?.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await settle(page);
    const links = await readLinks(page);
    check(links.length === 1, `${links.length} links`);
    checkNewTabLink(
      check,
      links,
      'https://example.com/guide',
      'https://example.com/guide',
    );
    await frame('pasted', {links});
  },
});

cases.push({
  key: 'code__light__ltr',
  group: 'code block',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await typeInEditor(page, '``` ');
    await page.keyboard.type('curl https://example.com/api ');
    await settle(page);
    const observed = await page.evaluate(() => {
      const editor = document.querySelector(
        '#storybook-root [contenteditable="true"]',
      ) as HTMLElement;
      const code = editor.querySelector('code');
      return {
        codeText: code?.textContent ?? null,
        anchors: editor.querySelectorAll('a').length,
      };
    });
    check(
      observed.codeText?.includes('https://example.com/api') ?? false,
      `code block text ${observed.codeText}`,
    );
    check(observed.anchors === 0, `${observed.anchors} links in the editor`);
    await frame('code', observed);
  },
});

cases.push({
  key: 'unmatch__light__ltr',
  group: 'edit breaks a match',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await typeInEditor(page, 'https://example.com ');
    const before = await readLinks(page);
    check(before.length === 1, `${before.length} links after typing`);
    await frame('linked', {links: before});
    // Text before the URL with no separator means the text no longer
    // matches, so the link reverts to plain text.
    await page.keyboard.press('Home');
    await page.keyboard.type('x');
    await settle(page);
    const after = await readLinks(page);
    const text = await page
      .locator('#storybook-root [contenteditable="true"]')
      .innerText();
    check(after.length === 0, `${after.length} links after the edit`);
    check(text.trim() === 'xhttps://example.com', `editor text "${text}"`);
    await frame('unlinked', {links: after, text});
  },
});

cases.push({
  key: 'tab__light__ltr',
  group: 'tab stop',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await typeInEditor(page, 'See https://example.com today. ');
    const links = await readLinks(page);
    check(links.length === 1, `${links.length} links`);
    // Tab indents inside the editor; Escape then Tab leaves it. A link
    // inside the editable text adds no tab stop of its own.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      inEditor:
        document.activeElement?.closest(
          '#storybook-root [contenteditable="true"]',
        ) != null,
    }));
    check(!focus.inEditor, `Tab stayed in the editor on ${focus.tag}`);
    check(focus.tag !== 'A', 'Tab moved to a link');
    await frame('tabbed-out', {links, focus});
  },
});

cases.push({
  key: 'trailing__light__ltr',
  group: 'trailing punctuation',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await typeInEditor(page, 'Docs live at https://example.com/docs. Next ');
    const links = await readLinks(page);
    check(links.length === 1, `${links.length} links`);
    // Records where the link ends. The owner has not decided whether a
    // sentence's last period belongs to the link, so this does not fail.
    await frame('linked', {links});
  },
});

cases.push({
  key: 'narrow__light__ltr',
  group: 'narrow',
  mode: 'light',
  direction: 'ltr',
  viewport: NARROW,
  run: async (page, check, frame) => {
    const url = `https://example.com/${'segment-'.repeat(6)}end?token=${'x'.repeat(60)}`;
    await typeInEditor(page, `Long: ${url} done `);
    const links = await readLinks(page);
    check(links.length === 1, `${links.length} links`);
    check(
      links.every(link => link.insideEditor),
      'a link runs past the editor',
    );
    const overflow = await page.evaluate(
      () => (document.scrollingElement?.scrollWidth ?? 0) - innerWidth,
    );
    check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
    await frame('long-url', {links, overflow});
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
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${STORY}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
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
    await page
      .locator('#storybook-root [contenteditable="true"]')
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
    check(sensors.reducedMotion, 'reduced motion not emulated');
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'RichTextEditorAutoLinkPlugin',
    build: storybookSha,
    checkout: checkoutSha,
    story: STORY,
    mode: item.mode,
    theme: 'neutral',
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
