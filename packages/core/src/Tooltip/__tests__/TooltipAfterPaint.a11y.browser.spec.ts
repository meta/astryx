// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Tooltip

/**
 * @file TooltipAfterPaint.a11y.browser.spec.ts
 * @input The `Core/Tooltip` Default story in a built Storybook, in Chromium
 *   and WebKit
 * @output Real-browser proof of component:Tooltip FR2 and FR14: the trigger
 *   carries no `aria-describedby` before the tooltip's layer loads, the
 *   reference never names a missing element, axe passes before and after the
 *   load, and after it Chromium's accessibility tree describes the trigger by
 *   the tooltip text, with no input
 * @position Run with `pnpm test:a11y-contract`. The load waits for a real
 *   paint and idle period, which only a real engine produces.
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-tooltip--default';

async function axeViolations(page: Page): Promise<string[]> {
  // A story is a page fragment with no landmarks or heading.
  const results = await new AxeBuilder({page})
    .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
    .analyze();
  return results.violations.map(
    violation =>
      `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
  );
}

interface ReferenceRecord {
  readonly hasReference: boolean;
  readonly dangling: boolean;
}

test('the trigger names its tooltip only once the tooltip layer exists, and the accessibility tree reads the description', async ({
  page,
  browserName,
}) => {
  // Records every state of the trigger's reference from the first parse on.
  await page.addInitScript(() => {
    const log: {hasReference: boolean; dangling: boolean}[] = [];
    (window as unknown as {__referenceLog: typeof log}).__referenceLog = log;
    const record = () => {
      for (const button of Array.from(document.querySelectorAll('button'))) {
        if (button.textContent !== 'Hover me') {
          continue;
        }
        const ids = (button.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter(Boolean);
        log.push({
          hasReference: ids.length > 0,
          dangling: ids.some(id => document.getElementById(id) == null),
        });
      }
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const trigger = page.getByRole('button', {name: 'Hover me'});
  await expect(trigger).toBeVisible();
  // Whatever the load's progress, the page passes axe: before the load the
  // trigger names nothing.
  expect(await axeViolations(page)).toEqual([]);

  // No input: the load lands on its own after first paint.
  await expect(trigger).toHaveAttribute('aria-describedby', /\S/, {
    timeout: 5000,
  });
  const log = await page.evaluate(
    () =>
      (window as unknown as {__referenceLog: ReferenceRecord[]}).__referenceLog,
  );
  expect(log.length).toBeGreaterThan(0);
  expect(log[0]?.hasReference).toBe(false);
  expect(log.filter(entry => entry.dangling)).toEqual([]);

  const id = await trigger.getAttribute('aria-describedby');
  const tooltip = page.locator(`[id="${id}"]`);
  await expect(tooltip).toHaveAttribute('role', 'tooltip');
  const text = (await tooltip.textContent())?.trim() ?? '';
  expect(text).not.toBe('');

  expect(await axeViolations(page)).toEqual([]);

  // Chromium's accessibility tree: the trigger's computed description. WebKit
  // has no protocol for it; axe and the reference checks above cover it.
  if (browserName !== 'chromium') {
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const {root} = (await cdp.send('DOM.getDocument', {depth: 0})) as unknown as {
    root: {nodeId: number};
  };
  const {nodeId} = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: `button[aria-describedby="${id}"]`,
  });
  expect(nodeId).not.toBe(0);
  const {nodes} = (await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  })) as unknown as {nodes: ReadonlyArray<{description?: {value?: string}}>};
  const description = nodes[0]?.description?.value;
  expect(description).toBe(text);
});
