// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetDragRestyle.interaction.browser.spec.ts
 * @input The built "Tall sheet" BottomSheet story, real touch input (Chromium
 *   CDP) and the interaction harness's rendering trace
 * @output A proof of the style work a touch drag does. A move restyles the
 *   dialog and the panel, never the sheet's content. A failure names each
 *   oversized restyle's element count and the invalidations before it.
 * @position An interaction proof beside
 *   BottomSheetDetent.interaction.browser.spec.ts, on the same harness.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  restyleSources,
  touchDriver,
  traceRendering,
  waitForRest,
  withStorybook,
  writeEvidence,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The proof fails on CI runners only, with each move restyling the sheet's
// content. On a failure CI keeps the Playwright trace, a screenshot and the
// drag's restyles with their invalidations, so the next failure shows the
// cause.
test.use({trace: 'retain-on-failure', screenshot: 'only-on-failure'});

// The most elements one style recalculation may restyle between two moves.
// A move restyles the dialog, its backdrop, the panel and the edge tint. The
// limit leaves room for an engine's own boxes. A restyle of the sheet's
// content counts every element in it. The count decides, not the node an
// invalidation names: an inherited write on the dialog restyles the content
// below it, and its invalidation names only the dialog.
const RESTYLED_PER_MOVE = 6;

interface OpenSheet {
  driver: TouchDriver;
  sheet: Locator;
  handle: {x: number; y: number};
}

interface ScrimRule {
  readonly selector: string;
  readonly value: string;
  readonly origin: string;
  readonly layers: ReadonlyArray<string>;
  readonly stylesheet: string | null;
}

/**
 * Every rule that sets the scrim's opacity on the sheet and on its first
 * content element, with its origin, layers and stylesheet, as the DevTools
 * protocol matches them. It names the rule that wins over the sheet's reset
 * when the reset does not apply.
 */
async function scrimRules(
  page: Page,
): Promise<Record<string, ReadonlyArray<ScrimRule>>> {
  const cdp = await page.context().newCDPSession(page);
  const stylesheets = new Map<string, string>();
  cdp.on('CSS.styleSheetAdded', ({header}) => {
    stylesheets.set(header.styleSheetId, header.sourceURL || header.origin);
  });
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const {root} = await cdp.send('DOM.getDocument', {depth: -1});
  const rulesFor = async (selector: string): Promise<ScrimRule[]> => {
    const {nodeId} = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (nodeId === 0) {
      return [];
    }
    const matched = await cdp.send('CSS.getMatchedStylesForNode', {nodeId});
    const rules: ScrimRule[] = [];
    for (const {rule} of matched.matchedCSSRules ?? []) {
      for (const property of rule.style.cssProperties) {
        if (property.name === '--_sheet-scrim-opacity') {
          rules.push({
            selector: rule.selectorList.text,
            value: property.value,
            origin: rule.origin,
            layers: (rule.layers ?? []).map(layer => layer.text),
            stylesheet:
              rule.styleSheetId == null
                ? null
                : (stylesheets.get(rule.styleSheetId) ?? rule.styleSheetId),
          });
        }
      }
    }
    for (const property of matched.inlineStyle?.cssProperties ?? []) {
      if (property.name === '--_sheet-scrim-opacity') {
        rules.push({
          selector: 'style attribute',
          value: property.value,
          origin: 'inline',
          layers: [],
          stylesheet: null,
        });
      }
    }
    return rules;
  };
  const rules = {
    sheet: await rulesFor('dialog[open] .astryx-bottom-sheet'),
    content: await rulesFor('dialog[open] .astryx-bottom-sheet > *'),
  };
  await cdp.detach().catch(() => {});
  return rules;
}

async function openSheet(page: Page): Promise<OpenSheet> {
  await openStory(page, storybook(), 'core-bottomsheet--tall-sheet');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open nearby places'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const sheet = page
    .getByRole('dialog', {name: 'Nearby places'})
    .locator('.astryx-bottom-sheet')
    .first();
  await expect(sheet).toBeVisible();
  await waitForRest(sheet);
  const rect = await sheet.boundingBox();
  if (rect == null) {
    throw new Error('no sheet');
  }
  return {
    driver,
    sheet,
    handle: {x: rect.x + rect.width / 2, y: rect.y + 12},
  };
}

test("a move of a drag restyles the dialog and the panel, not the sheet's content", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, sheet, handle} = await openSheet(page);
  // The proof needs content that a restyle of the whole sheet would count.
  const contentElements = await sheet.evaluate(
    element => element.querySelectorAll('*').length,
  );
  expect(contentElements).toBeGreaterThan(4 * RESTYLED_PER_MOVE);
  let steady = {from: 0, to: 0};
  const trace = await traceRendering(
    page,
    async () => {
      const played = await driver.play(
        drag(
          handle,
          {x: handle.x, y: handle.y + 240},
          {durationMs: 600, hz: 60, restMs: 150},
        ),
      );
      const moves = played.filter(event => event.type === 'touchMove');
      // The steady part of the drag: its first moves commit the drag's start,
      // and the lift commits its release.
      steady = {
        from: moves[4].returnedAt,
        to: moves[moves.length - 1].dispatchedAt,
      };
      await waitForRest(sheet);
    },
    {keepEvents: true, trackInvalidations: true},
  );
  const sources = restyleSources(trace, steady.from, steady.to);
  // The scrim's opacity as the dialog, the sheet and the sheet's first
  // content element compute it, read after the trace. The sheet ends the
  // property's inheritance, so its content computes no value. A value there
  // means the dialog's writes reach the content.
  const scrimOpacity = await sheet.evaluate(element => {
    const read = (node: Element | null) =>
      node == null
        ? null
        : getComputedStyle(node).getPropertyValue('--_sheet-scrim-opacity');
    return {
      dialog: read(element.closest('dialog')),
      sheet: read(element),
      content: read(element.firstElementChild),
    };
  });
  const restyled = sources.map(source => source.elements);
  const oversized = sources.filter(
    source => source.elements > RESTYLED_PER_MOVE,
  );
  const rules = oversized.length > 0 ? await scrimRules(page) : null;
  const explained = JSON.stringify(
    {
      restyled,
      sheetElements: contentElements,
      scrimOpacity,
      scrimRules: rules,
      // The first three; restyle-sources.json keeps them all.
      oversized: oversized.slice(0, 3).map(source => ({
        elements: source.elements,
        after: source.invalidations,
      })),
    },
    null,
    1,
  );
  if (oversized.length > 0) {
    await writeEvidence(
      'bottomsheet-drag-restyle',
      {
        'rendering-events.json': JSON.stringify({steady, events: trace.events}),
        'restyle-sources.json': JSON.stringify(
          {steady, scrimOpacity, rules, sources},
          null,
          1,
        ),
      },
      test.info(),
    );
  }
  // The drag wrote the scrim: a move's recalculation restyles the dialog too.
  expect(Math.max(...restyled), explained).toBeGreaterThan(1);
  expect(Math.max(...restyled), explained).toBeLessThanOrEqual(
    RESTYLED_PER_MOVE,
  );
});
