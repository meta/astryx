// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file StateInvalidation.interaction.browser.spec.ts
 * @input A built story with Astryx's whole stylesheet, a region the spec adds
 *   (a row and a panel with 2,000 descendants each, and app rules keyed to
 *   one class in each), real hover and focus, and a Chromium rendering trace
 * @output A proof that Astryx's stylesheet lets an app's keyed hover and
 *   focus-within rules restyle only what they match
 * @position An interaction proof for the relation keying in
 *   @astryxdesign/build (keyed-relations.js), on the interaction harness
 */

// Chromium keeps one invalidation set for each pseudo-class, for the whole
// document. One rule whose relation ends in a bare `*`, from any stylesheet,
// makes the set restyle the whole subtree of each element whose state changes.
// Astryx's rules name their subject, so the app's keyed rules stay cheap.

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  traceRendering,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A mouse hovers; the phone profile would make the pointer a finger.
test.use({hasTouch: false, isMobile: false});

// The most elements one style recalculation may restyle for a state change:
// the element, its matched descendant, and room for an engine's own boxes.
// A whole-subtree restyle counts the region's 2,000 descendants.
const RESTYLED_PER_CHANGE = 5;

/** Adds the row, the panel and their app rules, outside the story. */
async function addRegion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = [
      '.relation-row, .relation-panel { position: fixed; left: 0; width: 300px; height: 120px; overflow: hidden; }',
      '.relation-row { top: 0; } .relation-panel { top: 140px; }',
      '.relation-row:hover .relation-match { color: rgb(200, 0, 0); }',
      '.relation-panel:focus-within .relation-match { color: rgb(0, 0, 200); }',
    ].join('\n');
    document.head.append(style);
    for (const name of ['relation-row', 'relation-panel']) {
      const region = document.createElement('div');
      region.className = name;
      if (name === 'relation-panel') {
        const field = document.createElement('input');
        field.setAttribute('aria-label', 'Relation field');
        region.append(field);
      }
      for (let i = 0; i < 1000; i++) {
        const item = region.appendChild(document.createElement('div'));
        const text = item.appendChild(document.createElement('span'));
        text.textContent = `${name} ${i}`;
        if (i === 10) {
          text.className = 'relation-match';
        }
      }
      document.body.append(region);
    }
  });
}

/**
 * Astryx's rules that read an ancestor's `state` in a relation, so a proof
 * that they restyle nothing extra is not vacuous.
 */
async function astryxRelationRules(page: Page, state: string): Promise<number> {
  return page.evaluate(state => {
    const pattern = new RegExp(`:(where|is)\\([^{]*:${state}[\\s>~+]`);
    let count = 0;
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && pattern.test(rule.selectorText)) {
          count++;
        }
        if ('cssRules' in rule && !(rule instanceof CSSStyleRule)) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules);
      } catch {
        // A sheet from another origin cannot be read.
      }
    }
    return count;
  }, state);
}

/** The most elements one style recalculation restyled while `body` ran. */
async function mostRestyled(page: Page, body: () => Promise<void>) {
  const trace = await traceRendering(page, async () => {
    await body();
    await page.evaluate(
      async () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  });
  return Math.max(
    0,
    ...trace.events
      .filter(event => event.name === 'UpdateLayoutTree')
      .map(event => event.elements ?? 0),
  );
}

test.beforeEach(async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await openStory(page, storybook(), 'core-checkboxinput--default');
  await addRegion(page);
  await page.mouse.move(350, 400);
});

test("an app's keyed hover rule restyles what it matches, not the row's 2,000 descendants", async ({
  page,
}) => {
  expect(await astryxRelationRules(page, 'hover')).toBeGreaterThan(0);
  const match = page.locator('.relation-row .relation-match');
  const restyled = await mostRestyled(page, async () =>
    page.mouse.move(150, 60),
  );
  // The hover reached the row: its rule painted the match.
  await expect(match).toHaveCSS('color', 'rgb(200, 0, 0)');
  expect(restyled).toBeLessThanOrEqual(RESTYLED_PER_CHANGE);
});

test("an app's keyed focus-within rule restyles what it matches, as focus comes and goes", async ({
  page,
}) => {
  expect(await astryxRelationRules(page, 'focus-within')).toBeGreaterThan(0);
  const match = page.locator('.relation-panel .relation-match');
  const field = page.getByRole('textbox', {name: 'Relation field'});
  const entering = await mostRestyled(page, async () => field.focus());
  await expect(match).toHaveCSS('color', 'rgb(0, 0, 200)');
  const leaving = await mostRestyled(page, async () => field.blur());
  await expect(match).not.toHaveCSS('color', 'rgb(0, 0, 200)');
  expect(Math.max(entering, leaving)).toBeLessThanOrEqual(RESTYLED_PER_CHANGE);
});
