// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Layout

/**
 * @file LayoutHeaderFooterEdges.a11y.browser.spec.ts
 * @input Built Storybook: the Layout Header States and Footer States stories
 * @output Per-case checks of the region inset, the inset it publishes, its
 *   divider line, and the collapse of the content beside it, in Chromium and
 *   WebKit
 * @position Regular Layout regressions that run on every Layout change; the
 *   header and footer audits keep their wider screenshot evidence
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

type Edge = 'inlineStart' | 'inlineEnd' | 'blockStart' | 'blockEnd';
const EDGES: Edge[] = ['inlineStart', 'inlineEnd', 'blockStart', 'blockEnd'];
type Step = 0 | 2 | 4 | 6;
type Insets = Record<Edge, Step>;

type Expectation = {
  // The padding the inner wrapper applies, as spacing steps. Not checked when
  // absent.
  insets?: Insets;
  hasDivider: boolean;
  // The content's padding on the edge beside the region, as a spacing step:
  // 0 when it collapses against a region without a divider.
  contentEdge: Step;
};

type Region = {
  name: 'header' | 'footer';
  story: string;
  caseAttribute: string;
  // The edge of the region that carries its divider line, and the content
  // edge beside it.
  lineEdge: 'BlockEnd' | 'BlockStart';
  contentEdge: 'paddingBlockStart' | 'paddingBlockEnd';
  cases: Record<string, Expectation>;
};

const HEADER_AUTOMATIC: Insets = {
  inlineStart: 6,
  inlineEnd: 6,
  blockStart: 6,
  blockEnd: 4,
};
const FOOTER_AUTOMATIC: Insets = {
  inlineStart: 6,
  inlineEnd: 6,
  blockStart: 4,
  blockEnd: 6,
};
const EVEN = (step: Step): Insets => ({
  inlineStart: step,
  inlineEnd: step,
  blockStart: step,
  blockEnd: step,
});

function commonCases(automatic: Insets): Record<string, Expectation> {
  return {
    automatic: {insets: automatic, hasDivider: false, contentEdge: 0},
    divider: {insets: automatic, hasDivider: true, contentEdge: 4},
    'layout-default': {insets: automatic, hasDivider: true, contentEdge: 4},
    'explicit-off': {insets: automatic, hasDivider: false, contentEdge: 0},
    'padding-2': {insets: EVEN(2), hasDivider: true, contentEdge: 4},
    'full-bleed': {insets: EVEN(0), hasDivider: true, contentEdge: 4},
    height: {insets: automatic, hasDivider: true, contentEdge: 4},
    'content-width': {insets: automatic, hasDivider: true, contentEdge: 4},
    // The outer region has no divider, but the collapse stops at the nested
    // Layout: the nested content keeps its spacing beside its divided region.
    // LayoutContent is not a padding container, so the nested region takes
    // the step-4 default on every edge.
    nested: {insets: EVEN(4), hasDivider: true, contentEdge: 4},
    // A caller's data-divider="false" does not replace the reflected value.
    'caller-attribute': {insets: automatic, hasDivider: false, contentEdge: 0},
  };
}

const REGIONS: Region[] = [
  {
    name: 'header',
    story: 'core-layout--header-states',
    caseAttribute: 'data-header-case',
    lineEdge: 'BlockEnd',
    contentEdge: 'paddingBlockStart',
    cases: {
      ...commonCases(HEADER_AUTOMATIC),
      'padding-block-end': {
        insets: {...HEADER_AUTOMATIC, blockEnd: 0},
        hasDivider: true,
        contentEdge: 4,
      },
    },
  },
  {
    name: 'footer',
    story: 'core-layout--footer-states',
    caseAttribute: 'data-footer-case',
    lineEdge: 'BlockStart',
    contentEdge: 'paddingBlockEnd',
    cases: commonCases(FOOTER_AUTOMATIC),
  },
];

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => storybook?.close());

async function measure(page: Page, region: Region) {
  return page.evaluate(
    ({caseAttribute, lineEdge, contentEdge}) => {
      const px = (value: string) => parseFloat(value) || 0;
      // Resolves a length expression to pixels in the element's own scope.
      function resolve(element: Element, expression: string) {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;width:${expression}`;
        element.appendChild(probe);
        const width = px(getComputedStyle(probe).width);
        probe.remove();
        return width;
      }
      function color(element: Element, expression: string) {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;color:${expression}`;
        element.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }
      const root = document.querySelector('#storybook-root') as Element;
      const steps: Record<number, number> = {
        0: 0,
        2: resolve(root, 'var(--spacing-2)'),
        4: resolve(root, 'var(--spacing-4)'),
        6: resolve(root, 'var(--spacing-6)'),
      };
      const regions = Array.from(
        document.querySelectorAll(`#storybook-root [${caseAttribute}]`),
      ).map(element => {
        const style = getComputedStyle(element);
        const inner = element.firstElementChild as Element;
        const innerStyle = getComputedStyle(inner);
        const layout = element.closest('.astryx-layout');
        const content = Array.from(
          layout?.querySelectorAll('.astryx-layout-content') ?? [],
        ).find(candidate => candidate.closest('.astryx-layout') === layout);
        return {
          name: element.getAttribute(caseAttribute) as string,
          dataDivider: element.getAttribute('data-divider'),
          line: {
            width: px(
              style.getPropertyValue(
                `border-${lineEdge === 'BlockEnd' ? 'block-end' : 'block-start'}-width`,
              ),
            ),
            style: style.getPropertyValue(
              `border-${lineEdge === 'BlockEnd' ? 'block-end' : 'block-start'}-style`,
            ),
            color: style.getPropertyValue(
              `border-${lineEdge === 'BlockEnd' ? 'block-end' : 'block-start'}-color`,
            ),
            expectedColor: color(element, 'var(--color-border)'),
          },
          applied: {
            inlineStart: px(innerStyle.paddingInlineStart),
            inlineEnd: px(innerStyle.paddingInlineEnd),
            blockStart: px(innerStyle.paddingBlockStart),
            blockEnd: px(innerStyle.paddingBlockEnd),
          },
          published: {
            inlineStart: resolve(
              inner,
              'var(--container-padding-inline-start, 0px)',
            ),
            inlineEnd: resolve(
              inner,
              'var(--container-padding-inline-end, 0px)',
            ),
            blockStart: resolve(
              inner,
              'var(--container-padding-block-start, 0px)',
            ),
            blockEnd: resolve(inner, 'var(--container-padding-block-end, 0px)'),
          },
          contentEdge:
            content == null ? null : px(getComputedStyle(content)[contentEdge]),
        };
      });
      return {steps, regions};
    },
    {
      caseAttribute: region.caseAttribute,
      lineEdge: region.lineEdge,
      contentEdge: region.contentEdge,
    },
  );
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

for (const region of REGIONS) {
  test(`Layout${region.name === 'header' ? 'Header' : 'Footer'}: inset, publication, line and collapse in every case`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1024, height: 900});
    await page.goto(
      `${storybook.origin}/iframe.html?id=${region.story}&viewMode=story`,
    );
    await page
      .locator(`#storybook-root [${region.caseAttribute}]`)
      .first()
      .waitFor();
    const {steps, regions} = await measure(page, region);
    const seen = new Set(regions.map(item => item.name));
    expect([...seen].sort()).toEqual(Object.keys(region.cases).sort());

    const failures: string[] = [];
    const check = (ok: boolean, message: string) => {
      if (!ok) {
        failures.push(message);
      }
    };
    for (const item of regions) {
      const expected = region.cases[item.name];
      const where = `${region.name} ${item.name}`;
      // The inner wrapper publishes exactly the padding it applies.
      for (const edge of EDGES) {
        check(
          near(item.applied[edge], item.published[edge]),
          `${where} ${edge} applies ${item.applied[edge]} but publishes ${item.published[edge]}`,
        );
      }
      if (expected.insets != null) {
        for (const edge of EDGES) {
          const want = steps[expected.insets[edge]];
          check(
            near(item.applied[edge], want),
            `${where} ${edge} applies ${item.applied[edge]}, expected ${want}`,
          );
        }
      }
      // A line exists exactly when data-divider is "true", and it is a 1px
      // solid --color-border line on the edge that faces the content.
      check(
        (item.dataDivider === 'true') === expected.hasDivider,
        `${where} data-divider ${item.dataDivider}, expected ${expected.hasDivider}`,
      );
      check(
        item.line.width > 0 === expected.hasDivider,
        `${where} line ${item.line.width}px, expected divider ${expected.hasDivider}`,
      );
      if (expected.hasDivider) {
        check(
          near(item.line.width, 1) &&
            item.line.style === 'solid' &&
            item.line.color === item.line.expectedColor,
          `${where} line ${JSON.stringify(item.line)}`,
        );
      }
      // The content beside a region without a divider collapses its edge.
      const wantEdge = steps[expected.contentEdge];
      check(
        item.contentEdge != null && near(item.contentEdge, wantEdge),
        `${where} content edge ${item.contentEdge}, expected ${wantEdge}`,
      );
    }
    expect(failures).toEqual([]);
  });
}
