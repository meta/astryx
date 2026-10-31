// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for RTL contextual decorations and applicability coverage.
 */

import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {describe, expect, it} from 'vitest';
import componentPackages from '../../scripts/component-packages.cjs';
import {
  AUDITED_PACKAGE_NAMES,
  AUDITED_STORY_PREFIXES,
  buildAuditedComponentRoster,
  buildComponentCoverage,
  buildD1Target,
  buildStoryComponentRoutes,
  classifyDirectionalDecorationPair,
  classifyLogicalGroupedCorners,
  classifyLogicalInlinePair,
  collectDirectionalDecorations,
  filterStoryRoutesByPackages,
  orderD1StoryCandidates,
  resolveD1Applicability,
  storyIdsForComponentFilters,
  unresolvedComponentFilters,
  validateStoryRtlAuditParameters,
  withD1CompletionIdentity,
} from '../../apps/storybook/rtl-audit/rtl-audit-coverage.mjs';

const {
  componentPackage,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = componentPackages;

const IDENTITY = [1, 0, 0, 1];
const MIRROR = [-1, 0, 0, 1];

function decoration(glyph, policy, matrix = IDENTITY) {
  return {glyph, policy, matrix};
}

describe('collectDirectionalDecorations', () => {
  it('detects a slash used between repeated list items', () => {
    const dom = new JSDOM(`
      <ol>
        <li><span aria-hidden="true">/</span><a>Home</a></li>
        <li><span aria-hidden="true">/</span><a>Docs</a></li>
      </ol>
      <p>Control: and/or · 08/24 · /settings</p>
    `);
    const found = collectDirectionalDecorations({
      root: dom.window.document,
      requireVisible: false,
    });
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({glyph: '/', policy: 'explicit'});
  });

  it('follows a nested glyph element that carries the mirror transform', () => {
    const dom = new JSDOM(`
      <ol>
        <li><span aria-hidden="true"><span style="transform: matrix(-1, 0, 0, 1, 0, 0)">→</span></span><a>Home</a></li>
        <li><span aria-hidden="true"><span style="transform: matrix(-1, 0, 0, 1, 0, 0)">→</span></span><a>Docs</a></li>
      </ol>
    `);
    const found = collectDirectionalDecorations({
      root: dom.window.document,
      requireVisible: false,
    });
    expect(found[0].matrix).toEqual(MIRROR);
  });

  it('ignores the same slash without a directional decoration context', () => {
    const dom = new JSDOM('<p aria-hidden="true">/</p><p>and/or</p>');
    expect(
      collectDirectionalDecorations({
        root: dom.window.document,
        requireVisible: false,
      }),
    ).toEqual([]);
  });
});

describe('classifyDirectionalDecorationPair', () => {
  it('fails a bare contextual arrow', () => {
    expect(
      classifyDirectionalDecorationPair(
        decoration('→', 'explicit'),
        decoration('→', 'explicit'),
      ),
    ).toMatchObject({verdict: 'fail'});
  });

  it('passes a mirrored contextual arrow', () => {
    expect(
      classifyDirectionalDecorationPair(
        decoration('→', 'explicit'),
        decoration('→', 'explicit', MIRROR),
      ),
    ).toMatchObject({verdict: 'pass'});
  });

  it('passes an unchanged Unicode-mirrored angle quote', () => {
    expect(
      classifyDirectionalDecorationPair(
        decoration('›', 'auto-bidi'),
        decoration('›', 'auto-bidi'),
      ),
    ).toMatchObject({verdict: 'pass'});
  });

  it('fails an explicitly mirrored Unicode-mirrored angle quote', () => {
    expect(
      classifyDirectionalDecorationPair(
        decoration('›', 'auto-bidi'),
        decoration('›', 'auto-bidi', MIRROR),
      ),
    ).toMatchObject({verdict: 'fail'});
  });
});

describe('D1 story applicability', () => {
  const defaultStory = {
    id: 'lab-svgicon--default',
    importPath: './stories/SVGIcon.stories.tsx',
    sourceOrder: 10,
  };
  const registryFixture = {
    id: 'lab-svgicon--default-registry-icons',
    importPath: './stories/SVGIconRegistry.stories.tsx',
    sourceOrder: 10,
  };

  it.each([
    [registryFixture, defaultStory],
    [defaultStory, registryFixture],
  ])(
    'selects the same representative when Storybook order changes',
    (...stories) => {
      expect(orderD1StoryCandidates(stories).map(story => story.id)).toEqual([
        defaultStory.id,
        registryFixture.id,
      ]);
    },
  );

  it('preserves source export order for stories in one file', () => {
    const later = {
      id: 'core-example--later',
      importPath: './stories/Example.stories.tsx',
      sourceOrder: 200,
    };
    const earlier = {...later, id: 'core-example--earlier', sourceOrder: 100};
    expect(orderD1StoryCandidates([later, earlier])).toEqual([earlier, later]);
  });

  it('discloses exclusions ordered after the selected representative', () => {
    const rationale =
      'Reference glyphs preserve caller-supplied geometry as data.';
    const resolved = resolveD1Applicability(
      'lab/SVGIcon',
      [registryFixture, defaultStory],
      new Map([
        [defaultStory.id, {}],
        [registryFixture.id, {D1: {applicable: false, reason: rationale}}],
      ]),
    );

    expect(resolved.selectedCandidate).toEqual(defaultStory);
    expect(resolved.declaredExclusions).toEqual([
      {
        component: 'lab/SVGIcon',
        storyId: registryFixture.id,
        dimension: 'D1',
        reason: rationale,
      },
    ]);
  });

  it('fails closed when one candidate has no resolved metadata', () => {
    expect(() =>
      resolveD1Applicability(
        'lab/SVGIcon',
        [defaultStory, registryFixture],
        new Map([[defaultStory.id, {}]]),
      ),
    ).toThrow(
      `${registryFixture.id} resolved rtlAudit metadata was not collected`,
    );
  });

  it('keeps completion identity stable when metadata selects another candidate', () => {
    const excludedFirst = {
      ...registryFixture,
      importPath: './stories/ASVGIconRegistry.stories.tsx',
    };
    const target = buildD1Target('lab/SVGIcon', [defaultStory, excludedFirst]);
    const completed = withD1CompletionIdentity(
      {
        component: 'lab/SVGIcon',
        storyId: defaultStory.id,
        verdict: 'N-A',
        skippedStories: [
          {storyId: excludedFirst.id, reason: 'Reference fixture.'},
        ],
      },
      target.id,
    );

    expect(target).toMatchObject({
      comp: 'lab/SVGIcon',
      id: excludedFirst.id,
    });
    expect(completed).toMatchObject({
      component: 'lab/SVGIcon',
      storyId: excludedFirst.id,
      selectedStoryId: defaultStory.id,
    });
    expect(`${target.comp}::${target.id}`).toBe(
      `${completed.component}::${completed.storyId}`,
    );
  });

  it('keeps all-excluded completion identity non-null and deterministic', () => {
    const target = buildD1Target('lab/SVGIcon', [
      registryFixture,
      defaultStory,
    ]);
    const completed = withD1CompletionIdentity(
      {
        component: 'lab/SVGIcon',
        storyId: null,
        verdict: 'N-A',
        skippedStories: [
          {storyId: defaultStory.id, reason: 'First fixture.'},
          {storyId: registryFixture.id, reason: 'Second fixture.'},
        ],
      },
      target.id,
    );

    expect(completed.storyId).toBe(defaultStory.id);
    expect(completed).not.toHaveProperty('selectedStoryId');
    expect(`${target.comp}::${target.id}`).toBe(
      `${completed.component}::${completed.storyId}`,
    );
  });

  it('requires a reason for a story-level D1 exclusion', () => {
    expect(
      validateStoryRtlAuditParameters(
        {
          D1: {
            applicable: false,
            reason: '  Reference glyphs preserve caller-supplied geometry.  ',
          },
        },
        registryFixture.id,
      ),
    ).toEqual({
      D1: {
        applicable: false,
        reason: 'Reference glyphs preserve caller-supplied geometry.',
      },
    });
    expect(() =>
      validateStoryRtlAuditParameters(
        {D1: {applicable: false, reason: '  '}},
        registryFixture.id,
      ),
    ).toThrow('needs a non-empty reason');
  });

  it('rejects mistyped dimensions instead of silently ignoring them', () => {
    expect(() =>
      validateStoryRtlAuditParameters(
        {D7: {applicable: false, reason: 'Typo.'}},
        registryFixture.id,
      ),
    ).toThrow('unknown dimension D7');
  });
});

function logicalMeasurement(overrides = {}) {
  return {
    count: 1,
    visible: true,
    width: 320,
    height: 120,
    direction: 'ltr',
    writingMode: 'horizontal-tb',
    inlineStart: 8,
    inlineEnd: 24,
    top: 4,
    right: 24,
    bottom: 12,
    left: 8,
    ...overrides,
  };
}

describe('classifyLogicalInlinePair', () => {
  it('passes asymmetric logical edges on a horizontal inline axis', () => {
    expect(
      classifyLogicalInlinePair(
        logicalMeasurement(),
        logicalMeasurement({direction: 'rtl', left: 24, right: 8}),
      ),
    ).toMatchObject({
      verdict: 'pass',
      reason:
        'logical start/end stay stable and resolved left/right sides swap for horizontal-tb',
    });
  });

  it('passes asymmetric logical edges on a vertical inline axis', () => {
    expect(
      classifyLogicalInlinePair(
        logicalMeasurement({
          writingMode: 'vertical-rl',
          top: 8,
          right: 4,
          bottom: 24,
          left: 12,
        }),
        logicalMeasurement({
          direction: 'rtl',
          writingMode: 'vertical-rl',
          top: 24,
          right: 4,
          bottom: 8,
          left: 12,
        }),
      ),
    ).toMatchObject({
      verdict: 'pass',
      reason:
        'logical start/end stay stable and resolved top/bottom sides swap for vertical-rl',
    });
  });

  it('fails a hidden zero-size subject even when its values mirror', () => {
    expect(
      classifyLogicalInlinePair(
        logicalMeasurement({visible: false, width: 0, height: 0}),
        logicalMeasurement({
          direction: 'rtl',
          visible: false,
          width: 0,
          height: 0,
          left: 24,
          right: 8,
        }),
      ),
    ).toMatchObject({
      verdict: 'fail',
      reason: 'logical inline-edge subject is not one visible non-zero box',
    });
  });

  it('fails horizontal logical edges that stay on physical sides', () => {
    expect(
      classifyLogicalInlinePair(
        logicalMeasurement(),
        logicalMeasurement({direction: 'rtl'}),
      ),
    ).toMatchObject({verdict: 'fail'});
  });

  it('fails vertical writing that swaps left/right instead of top/bottom', () => {
    expect(
      classifyLogicalInlinePair(
        logicalMeasurement({
          writingMode: 'vertical-rl',
          top: 8,
          right: 4,
          bottom: 24,
          left: 12,
        }),
        logicalMeasurement({
          direction: 'rtl',
          writingMode: 'vertical-rl',
          top: 8,
          right: 12,
          bottom: 24,
          left: 4,
        }),
      ),
    ).toMatchObject({
      verdict: 'fail',
      reason:
        'logical start/end did not mirror on the top/bottom inline axis for vertical-rl',
    });
  });

  it('fails when the writing mode changes between directions', () => {
    expect(
      classifyLogicalInlinePair(
        logicalMeasurement(),
        logicalMeasurement({
          direction: 'rtl',
          writingMode: 'vertical-rl',
          top: 24,
          right: 4,
          bottom: 8,
          left: 12,
        }),
      ),
    ).toMatchObject({
      verdict: 'fail',
      reason:
        'logical inline-edge writing mode is missing or changed between directions',
    });
  });
});

function groupedCornerMeasurement(direction = 'ltr', physicalSide = 'left') {
  const full = 28;
  const inset = 6;
  const left = physicalSide === 'left';
  const corners = (topInset, bottomInset) => ({
    topLeft: left && topInset ? inset : full,
    topRight: !left && topInset ? inset : full,
    bottomRight: !left && bottomInset ? inset : full,
    bottomLeft: left && bottomInset ? inset : full,
  });
  return {
    direction,
    writingMode: 'horizontal-tb',
    boxes: [
      {
        visible: true,
        width: 180,
        height: 44,
        corners: corners(false, true),
      },
      {
        visible: true,
        width: 180,
        height: 44,
        corners: corners(true, true),
      },
      {
        visible: true,
        width: 180,
        height: 44,
        corners: corners(true, false),
      },
    ],
  };
}

describe('classifyLogicalGroupedCorners', () => {
  it('passes an inline-start group that mirrors left to right', () => {
    expect(
      classifyLogicalGroupedCorners(
        groupedCornerMeasurement('ltr', 'left'),
        groupedCornerMeasurement('rtl', 'right'),
        'inline-start',
      ),
    ).toMatchObject({
      verdict: 'pass',
      ltr: {physicalSide: 'left', insetRadius: 6, fullRadius: 28},
      rtl: {physicalSide: 'right', insetRadius: 6, fullRadius: 28},
    });
  });

  it('passes an inline-end group that mirrors right to left', () => {
    expect(
      classifyLogicalGroupedCorners(
        groupedCornerMeasurement('ltr', 'right'),
        groupedCornerMeasurement('rtl', 'left'),
        'inline-end',
      ),
    ).toMatchObject({
      verdict: 'pass',
      ltr: {physicalSide: 'right'},
      rtl: {physicalSide: 'left'},
    });
  });

  it('fails grouped corners that stay on the LTR physical side', () => {
    expect(
      classifyLogicalGroupedCorners(
        groupedCornerMeasurement('ltr', 'left'),
        groupedCornerMeasurement('rtl', 'left'),
        'inline-start',
      ),
    ).toMatchObject({verdict: 'fail'});
  });

  it('fails when any grouped subject is missing or hidden', () => {
    const rtl = groupedCornerMeasurement('rtl', 'right');
    rtl.boxes[1] = null;
    expect(
      classifyLogicalGroupedCorners(
        groupedCornerMeasurement('ltr', 'left'),
        rtl,
        'inline-start',
      ),
    ).toMatchObject({
      verdict: 'fail',
      reason:
        'grouped-corner subjects must be three visible horizontal LTR/RTL boxes',
    });
  });
});

describe('buildComponentCoverage', () => {
  it('classifies measured, verified N/A, unexplained gaps, and stale declarations', () => {
    const coverage = buildComponentCoverage({
      components: [
        'core/Breadcrumbs',
        'core/Button',
        'core/Text',
        'core/Pagination',
      ],
      decorationResults: [
        {
          component: 'core/Breadcrumbs',
          storyId: 'core-breadcrumbs--default',
          verdict: 'pass',
        },
      ],
      autoResults: [
        {
          component: 'core/Pagination',
          storyId: 'core-pagination--default',
          verdict: 'pass',
        },
      ],
      verifiedNa: [
        {
          component: 'core/Text',
          reason: 'Text has no direction-sensitive visual or behavior.',
        },
        {component: 'core/Pagination', reason: 'stale reason'},
      ],
    });

    expect(coverage).toMatchObject({
      total: 4,
      measured: 1,
      verifiedNa: 1,
      gaps: 1,
      staleVerifiedNa: 1,
    });
    expect(
      Object.fromEntries(
        coverage.results.map(result => [result.component, result.status]),
      ),
    ).toEqual({
      'core/Breadcrumbs': 'measured',
      'core/Button': 'coverage-gap',
      'core/Pagination': 'stale-verified-na',
      'core/Text': 'verified-na',
    });
  });

  it('keeps missing stories and audit errors as coverage gaps', () => {
    const coverage = buildComponentCoverage({
      components: ['core/MissingStory', 'core/BrokenAudit'],
      autoResults: [
        {
          component: 'core/BrokenAudit',
          storyId: 'core-broken--default',
          verdict: 'ERROR',
        },
      ],
      curatedResults: [
        {
          component: 'core/MissingStory',
          storyId: 'core-missing--default',
          rollup: 'MISSING-STORY',
        },
      ],
    });
    expect(coverage.measured).toBe(0);
    expect(coverage.gaps).toBe(2);
  });

  it('keeps same-named Core and Lab components distinct', () => {
    const coverage = buildComponentCoverage({
      components: ['core/Chat', 'lab/Chat'],
    });
    expect(coverage.results.map(result => result.component)).toEqual([
      'core/Chat',
      'lab/Chat',
    ]);
    expect(coverage.gaps).toBe(2);
  });
});

describe('buildAuditedComponentRoster', () => {
  it('uses an umbrella Storybook surface without adding an unknown duplicate', () => {
    expect(
      buildAuditedComponentRoster({
        sourceComponents: ['core/ChatComposer', 'core/ChatMessage'],
        storyComponents: ['core/chat', 'core/chatcomposer'],
        filters: ['chat'],
      }),
    ).toEqual(['core/chat']);
  });

  it('retains an unknown entry when neither source nor stories match', () => {
    expect(
      buildAuditedComponentRoster({
        sourceComponents: ['core/Button'],
        storyComponents: ['core/button'],
        filters: ['missing'],
      }),
    ).toEqual(['unknown/missing']);
  });
});

describe('audited package and story routing', () => {
  const publicComponentsByPackage = Object.fromEntries(
    AUDITED_PACKAGE_NAMES.map(packageName => {
      const pkg = componentPackage(packageName);
      const components =
        pkg.layout === 'flat'
          ? flatPackageComponentNames(process.cwd(), pkg)
          : nestedPackageComponentNames(process.cwd(), pkg);
      return [packageName, components];
    }),
  );
  const chartsComponents = publicComponentsByPackage.charts;
  const richTextComponents = publicComponentsByPackage.richtext;
  const vegaComponents = publicComponentsByPackage.vega;

  it('uses the canonical registry for all five component packages', () => {
    expect(chartsComponents).toEqual([
      'Chart',
      'ChartAxis',
      'ChartGrid',
      'ChartLegend',
      'ChartSwatch',
      'ChartTooltip',
    ]);
    expect(richTextComponents).toEqual([
      'RichTextEditor',
      'RichTextEditorAutoLinkPlugin',
      'RichTextEditorToolbar',
      'RichTextView',
    ]);
    expect(vegaComponents).toEqual(['VegaChart']);
    expect(AUDITED_PACKAGE_NAMES).toEqual([
      'core',
      'lab',
      'charts',
      'richtext',
      'vega',
    ]);
    expect(AUDITED_STORY_PREFIXES).toEqual([
      'core-',
      'lab-',
      'charts-',
      'richtext-',
      'vega-',
    ]);
  });

  it('routes public owners across all five packages without losing aliases', () => {
    const routes = buildStoryComponentRoutes({
      stories: [
        {id: 'core-button--default', title: 'Core/Button'},
        {id: 'lab-chart--bar-chart', title: 'Lab/Chart'},
        {id: 'charts-chart--playground', title: 'Charts/Chart'},
        {id: 'charts-bar--simple', title: 'Charts/Bar'},
        {
          id: 'charts-chrome-legend--default',
          title: 'Charts/Chrome/Legend',
        },
        {
          id: 'charts-chrome-axes-grids--playground',
          title: 'Charts/Chrome/Axes & Grids',
        },
        {
          id: 'charts-chrome-swatch--gallery',
          title: 'Charts/Chrome/Swatch',
        },
        {
          id: 'charts-chrome-tooltip--default',
          title: 'Charts/Chrome/Tooltip',
        },
        {
          id: 'richtext-richtexteditor--default',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'richtext-richtexteditor--with-toolbar',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'richtext-richtexteditor--with-auto-link',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'richtext-richtexteditor--markdown-serializers',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'vega-vegachart--radial-plot',
          title: 'Vega/VegaChart',
        },
      ],
      targets: [
        {
          component: 'lab/Chart',
          storyId: 'lab-chart--bar-chart',
        },
        {
          component: 'ChartLegend',
          storyId: 'charts-chrome-legend--default',
        },
        {
          component: 'richtext/RichTextEditor',
          storyId: 'richtext-richtexteditor--default',
        },
        {
          component: 'richtext/RichTextEditorToolbar',
          storyId: 'richtext-richtexteditor--with-toolbar',
        },
        {
          component: 'richtext/RichTextEditorAutoLinkPlugin',
          storyId: 'richtext-richtexteditor--with-auto-link',
        },
        {
          component: 'richtext/RichTextView',
          storyId: 'richtext-richtexteditor--markdown-serializers',
        },
      ],
      publicComponentsByPackage,
    });

    expect(routes).toEqual([
      {id: 'core-button--default', component: 'core/Button'},
      {id: 'lab-chart--bar-chart', component: 'lab/Chart'},
      {id: 'charts-chart--playground', component: 'charts/Chart'},
      {id: 'charts-bar--simple', component: 'charts/Chart'},
      {
        id: 'charts-chrome-legend--default',
        component: 'charts/ChartLegend',
      },
      {
        id: 'charts-chrome-axes-grids--playground',
        component: 'charts/ChartAxis',
      },
      {
        id: 'charts-chrome-axes-grids--playground',
        component: 'charts/ChartGrid',
      },
      {
        id: 'charts-chrome-swatch--gallery',
        component: 'charts/ChartSwatch',
      },
      {
        id: 'charts-chrome-tooltip--default',
        component: 'charts/ChartTooltip',
      },
      {
        id: 'richtext-richtexteditor--default',
        component: 'richtext/RichTextEditor',
      },
      {
        id: 'richtext-richtexteditor--with-toolbar',
        component: 'richtext/RichTextEditorToolbar',
      },
      {
        id: 'richtext-richtexteditor--with-auto-link',
        component: 'richtext/RichTextEditorAutoLinkPlugin',
      },
      {
        id: 'richtext-richtexteditor--markdown-serializers',
        component: 'richtext/RichTextView',
      },
      {
        id: 'vega-vegachart--radial-plot',
        component: 'vega/VegaChart',
      },
    ]);

    const routesWithUnknown = [
      ...routes,
      {id: 'core-mystery--default', component: 'unknown/mystery'},
    ];
    const shardRoutes = Object.fromEntries(
      AUDITED_PACKAGE_NAMES.map(packageName => [
        packageName,
        filterStoryRoutesByPackages(routesWithUnknown, [packageName]),
      ]),
    );
    const routeKey = route => `${route.id}::${route.component}`;
    const assigned = Object.values(shardRoutes).flat().map(routeKey).sort();
    expect(assigned).toEqual(routesWithUnknown.map(routeKey).sort());
    expect(shardRoutes.richtext.map(routeKey)).toContain(
      'richtext-richtexteditor--with-toolbar::richtext/RichTextEditorToolbar',
    );
    expect(shardRoutes.lab.map(routeKey)).not.toContain(
      'richtext-richtexteditor--with-toolbar::richtext/RichTextEditorToolbar',
    );
    expect(shardRoutes.core.map(routeKey)).toContain(
      'core-mystery--default::unknown/mystery',
    );

    const groupedOwners = [
      'charts/ChartAxis',
      'charts/ChartGrid',
      'charts/ChartLegend',
      'charts/ChartSwatch',
      'charts/ChartTooltip',
      'richtext/RichTextEditorAutoLinkPlugin',
      'richtext/RichTextEditorToolbar',
      'richtext/RichTextView',
    ];
    expect(storyIdsForComponentFilters(routes, groupedOwners)).toEqual([
      'charts-chrome-legend--default',
      'charts-chrome-axes-grids--playground',
      'charts-chrome-swatch--gallery',
      'charts-chrome-tooltip--default',
      'richtext-richtexteditor--with-toolbar',
      'richtext-richtexteditor--with-auto-link',
      'richtext-richtexteditor--markdown-serializers',
    ]);
    expect(unresolvedComponentFilters(routes, groupedOwners)).toEqual([]);
    expect(unresolvedComponentFilters(routes, ['charts/MissingOwner'])).toEqual(
      ['charts/MissingOwner'],
    );

    expect(
      buildAuditedComponentRoster({
        sourceComponents: [
          'core/Button',
          'lab/Chart',
          ...chartsComponents.map(component => `charts/${component}`),
          ...richTextComponents.map(component => `richtext/${component}`),
          ...vegaComponents.map(component => `vega/${component}`),
        ],
        storyComponents: routes.map(route => route.component),
        filters: [
          'Button',
          'Chart',
          ...chartsComponents.slice(1),
          ...richTextComponents,
          ...vegaComponents,
        ],
      }),
    ).toEqual([
      'core/Button',
      'lab/Chart',
      ...chartsComponents.map(component => `charts/${component}`),
      ...richTextComponents.map(component => `richtext/${component}`),
      ...vegaComponents.map(component => `vega/${component}`),
    ]);
    expect(
      buildAuditedComponentRoster({
        sourceComponents: [
          ...chartsComponents.map(component => `charts/${component}`),
          ...richTextComponents.map(component => `richtext/${component}`),
        ],
        storyComponents: routes.map(route => route.component),
        filters: groupedOwners,
      }),
    ).toEqual(groupedOwners);
  });

  it('routes every public Rich Text owner to a story that renders it', () => {
    const targets = JSON.parse(
      fs.readFileSync(
        new URL('../../apps/storybook/rtl-audit/targets.json', import.meta.url),
        'utf8',
      ),
    );
    const routes = buildStoryComponentRoutes({
      stories: [
        {
          id: 'richtext-richtexteditor--default',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'richtext-richtexteditor--with-toolbar',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'richtext-richtexteditor--with-auto-link',
          title: 'RichText/RichTextEditor',
        },
        {
          id: 'richtext-richtexteditor--markdown-serializers',
          title: 'RichText/RichTextEditor',
        },
      ],
      targets,
      publicComponentsByPackage,
    });
    const owners = richTextComponents.map(component => `richtext/${component}`);
    expect(unresolvedComponentFilters(routes, owners)).toEqual([]);
    expect(storyIdsForComponentFilters(routes, owners)).toEqual([
      'richtext-richtexteditor--default',
      'richtext-richtexteditor--with-toolbar',
      'richtext-richtexteditor--with-auto-link',
      'richtext-richtexteditor--markdown-serializers',
    ]);
  });

  it('classifies measured Chart owners and verified direction-neutral owners without gaps', () => {
    const coverage = buildComponentCoverage({
      components: chartsComponents.map(component => `charts/${component}`),
      curatedResults: [
        {
          component: 'charts/Chart',
          storyId: 'charts-chart--playground',
          rollup: 'RTL-ready',
        },
        {
          component: 'charts/ChartLegend',
          storyId: 'charts-chrome-legend--default',
          rollup: 'RTL-ready',
        },
      ],
      verifiedNa: ['ChartAxis', 'ChartGrid', 'ChartSwatch', 'ChartTooltip'].map(
        component => ({
          component: `charts/${component}`,
          reason: 'Direction-neutral chart-space rendering.',
        }),
      ),
    });

    expect(coverage).toMatchObject({
      total: 6,
      measured: 2,
      verifiedNa: 4,
      gaps: 0,
      staleVerifiedNa: 0,
    });
  });

  it('classifies Rich Text and Vega owners without gaps or package aliases', () => {
    const components = [
      ...richTextComponents.map(component => `richtext/${component}`),
      ...vegaComponents.map(component => `vega/${component}`),
    ];
    const coverage = buildComponentCoverage({
      components,
      curatedResults: [
        {
          component: 'richtext/RichTextEditor',
          storyId: 'richtext-richtexteditor--error-status',
          rollup: 'RTL-ready',
        },
        {
          component: 'richtext/RichTextEditorToolbar',
          storyId: 'richtext-richtexteditor--with-toolbar',
          rollup: 'RTL-ready',
        },
      ],
      verifiedNa: [
        'richtext/RichTextEditorAutoLinkPlugin',
        'richtext/RichTextView',
        'vega/VegaChart',
      ].map(component => ({
        component,
        reason: 'Direction-neutral rendering.',
      })),
    });

    expect(coverage).toMatchObject({
      total: 5,
      measured: 2,
      verifiedNa: 3,
      gaps: 0,
      staleVerifiedNa: 0,
    });
    expect(coverage.results.map(result => result.component)).toEqual(
      components,
    );
  });
});
