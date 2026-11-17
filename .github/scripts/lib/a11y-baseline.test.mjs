// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-baseline.test.mjs
 * Tests for the a11y baseline gate: key stability across DOM churn, diff
 * classification (new / baselined / resolved / unchecked), baseline
 * generation, and the failure summary format.
 */

import {describe, expect, it} from 'vitest';
import {
  buildBaseline,
  collectViolations,
  diffAgainstBaseline,
  formatDiffSummary,
  formatResolvedWarning,
  violationKey,
} from './a11y-baseline.js';

// Build a report in the shape accessibility-audit.js writes: per-component
// results with per-story raw axe violations under `storyDetails`.
function makeReport(componentStories) {
  const components = {};
  for (const [component, stories] of Object.entries(componentStories)) {
    const storyDetails = Object.entries(stories).map(([story, violations]) => ({
      story,
      violations,
    }));
    components[component] = {
      storiesAudited: storyDetails.length,
      violations: [],
      storyDetails,
    };
  }
  const auditedStoryKeys = Object.entries(componentStories).flatMap(
    ([component, stories]) =>
      Object.keys(stories).map(story => `${component}::${story}`),
  );
  return {auditedStoryKeys, components, summary: {}};
}

function axeViolation(id, overrides = {}) {
  return {
    id,
    impact: 'serious',
    description: `${id} description`,
    help: `${id} help`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${id}`,
    tags: ['wcag2a'],
    nodes: [{html: '<button></button>', target: ['#root > button']}],
    ...overrides,
  };
}

const RICH_TEXT_BASELINE_KEYS = [
  'Controlled Persistence',
  'Custom Transformers',
  'Default',
  'Error Status',
  'Imperative Ref',
  'Markdown Serializers',
  'Read Only',
  'Required',
  'With Character Limit',
  'With Description',
  'With Initial Value',
  'With Toolbar',
].flatMap(story => [
  `RichTextEditor::${story}::aria-input-field-name`,
  ...(story === 'Markdown Serializers'
    ? [`RichTextEditor::${story}::label`]
    : []),
]);

function makeRoutedReport({
  owner,
  storyId,
  component,
  story,
  violations = [],
  legacyStoryOwners,
  legacyBaselineAliases,
}) {
  const canonicalStoryKey = `${owner}::${storyId}`;
  const legacyStoryKey = `${component}::${story}`;
  return {
    ownerStoryRoutes: {[owner]: [storyId]},
    ownerStoryKeys: {[owner]: [canonicalStoryKey]},
    auditedStories: [{owner, storyId, legacyStoryKey}],
    auditedStoryKeys: [canonicalStoryKey],
    legacyStoryOwners: legacyStoryOwners ?? {
      [legacyStoryKey]: [canonicalStoryKey],
    },
    legacyBaselineAliases: legacyBaselineAliases ?? {},
    components: {
      [component]: {
        storiesAudited: 1,
        violations: [],
        storyDetails:
          violations.length > 0 ? [{story, storyId, violations}] : [],
      },
    },
    summary: {},
  };
}

function makeMultiRoutedReport(rows, {legacyBaselineAliases = {}} = {}) {
  const components = {};
  const auditedStories = [];
  const legacyStoryOwners = {};
  for (const row of rows) {
    const canonicalStoryKey = `${row.owner}::${row.storyId}`;
    const legacyStoryKey = `${row.component}::${row.story}`;
    auditedStories.push({
      owner: row.owner,
      storyId: row.storyId,
      legacyStoryKey,
    });
    legacyStoryOwners[legacyStoryKey] ??= [];
    legacyStoryOwners[legacyStoryKey].push(canonicalStoryKey);
    components[row.component] ??= {
      storiesAudited: 0,
      violations: [],
      storyDetails: [],
    };
    components[row.component].storiesAudited += 1;
    if (row.ruleId) {
      components[row.component].storyDetails.push({
        story: row.story,
        storyId: row.storyId,
        violations: [axeViolation(row.ruleId)],
      });
    }
  }
  return {
    auditedStories,
    auditedStoryKeys: auditedStories.map(
      ({owner, storyId}) => `${owner}::${storyId}`,
    ),
    legacyStoryOwners,
    legacyBaselineAliases,
    components,
    summary: {},
  };
}

describe('violationKey', () => {
  it('is component + story + rule id, independent of DOM specifics', () => {
    expect(violationKey('Button', 'Primary', 'button-name')).toBe(
      'Button::Primary::button-name',
    );
  });
});

describe('collectViolations', () => {
  it('keys violations stably across unrelated DOM churn', () => {
    const before = makeReport({
      Button: {
        Primary: [
          axeViolation('button-name', {
            nodes: [{html: '<button class="a"></button>', target: ['.a']}],
          }),
        ],
      },
    });
    const after = makeReport({
      Button: {
        Primary: [
          axeViolation('button-name', {
            // Same violation, different selector/markup after a refactor.
            nodes: [
              {html: '<button class="b x"></button>', target: ['div > .b']},
            ],
          }),
        ],
      },
    });
    expect(collectViolations(before).map(v => v.key)).toEqual(
      collectViolations(after).map(v => v.key),
    );
  });

  it('falls back to the aggregated shape when storyDetails is absent', () => {
    const report = {
      components: {
        Card: {
          storiesAudited: 2,
          violations: [
            {
              id: 'color-contrast',
              impact: 'serious',
              help: 'contrast',
              helpUrl: 'https://example.com',
              stories: ['Default', 'Compact'],
              totalNodes: 3,
            },
          ],
        },
      },
    };
    expect(
      collectViolations(report)
        .map(v => v.key)
        .sort(),
    ).toEqual([
      'Card::Compact::color-contrast',
      'Card::Default::color-contrast',
    ]);
  });
});

describe('diffAgainstBaseline', () => {
  const report = makeReport({
    Button: {Primary: [axeViolation('button-name')]},
    Card: {Default: []},
  });

  it('flags violations missing from the baseline as new', () => {
    const diff = diffAgainstBaseline(report, {version: 1, entries: []});
    expect(diff.newViolations).toHaveLength(1);
    expect(diff.newViolations[0].key).toBe('Button::Primary::button-name');
    expect(diff.matched).toBe(0);
  });

  it('treats a missing baseline as empty (everything is new)', () => {
    expect(diffAgainstBaseline(report, null).newViolations).toHaveLength(1);
    expect(diffAgainstBaseline(report, undefined).newViolations).toHaveLength(
      1,
    );
  });

  it('passes when every violation is baselined', () => {
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: [{key: 'Button::Primary::button-name', impact: 'serious'}],
    });
    expect(diff.newViolations).toEqual([]);
    expect(diff.matched).toBe(1);
    expect(diff.resolved).toEqual([]);
  });

  it('accepts bare string entries', () => {
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: ['Button::Primary::button-name'],
    });
    expect(diff.newViolations).toEqual([]);
  });

  it('reports baseline entries for audited components as resolved', () => {
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: [
        {key: 'Button::Primary::button-name'},
        {key: 'Card::Default::color-contrast'},
      ],
    });
    expect(diff.newViolations).toEqual([]);
    expect(diff.resolved).toEqual(['Card::Default::color-contrast']);
  });

  it('does not mark entries for unaudited components as resolved', () => {
    // CI only audits changed components; a baseline entry for a component
    // outside this run is unchecked, not resolved.
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: [
        {key: 'Button::Primary::button-name'},
        {key: 'Dialog::Basic::aria-dialog-name'},
      ],
    });
    expect(diff.resolved).toEqual([]);
    expect(diff.unchecked).toEqual(['Dialog::Basic::aria-dialog-name']);
  });

  it('keeps baseline entries for unscanned stories of a routed owner unchecked', () => {
    const scopedReport = makeRoutedReport({
      owner: 'richtext/RichTextEditorToolbar',
      storyId: 'lab-richtexteditor--with-toolbar',
      component: 'RichTextEditor',
      story: 'With Toolbar',
    });
    const diff = diffAgainstBaseline(scopedReport, {
      version: 1,
      entries: RICH_TEXT_BASELINE_KEYS.map(key => ({key})),
    });

    expect(diff.resolved).toEqual([
      'RichTextEditor::With Toolbar::aria-input-field-name',
    ]);
    expect(diff.unchecked).toHaveLength(12);
    expect(diff.unchecked).toContain(
      'RichTextEditor::Default::aria-input-field-name',
    );
  });

  it('keeps colliding Core Tooltip baseline evidence outside a Charts-only audit', () => {
    const legacyStoryOwners = {
      'Tooltip::Default': [
        'core/Tooltip::core-tooltip--default',
        'charts/ChartTooltip::charts-chrome-tooltip--default',
      ],
    };
    const scopedReport = makeRoutedReport({
      owner: 'charts/ChartTooltip',
      storyId: 'charts-chrome-tooltip--default',
      component: 'Tooltip',
      story: 'Default',
      legacyStoryOwners,
    });
    const legacyKey = 'Tooltip::Default::color-contrast';
    const coreKey = 'core/Tooltip::core-tooltip--default::color-contrast';
    const chartsKey =
      'charts/ChartTooltip::charts-chrome-tooltip--default::color-contrast';
    const diff = diffAgainstBaseline(scopedReport, {
      version: 1,
      entries: [{key: legacyKey}, {key: coreKey}, {key: chartsKey}],
    });

    expect(diff.resolved).toEqual([chartsKey]);
    expect(diff.unchecked).toEqual([legacyKey, coreKey]);

    const violatingReport = makeRoutedReport({
      owner: 'charts/ChartTooltip',
      storyId: 'charts-chrome-tooltip--default',
      component: 'Tooltip',
      story: 'Default',
      violations: [axeViolation('color-contrast')],
      legacyStoryOwners,
    });
    const collisionDiff = diffAgainstBaseline(violatingReport, {
      version: 1,
      entries: [{key: legacyKey}],
    });
    expect(collisionDiff.newViolations.map(violation => violation.key)).toEqual(
      [chartsKey],
    );
    expect(collisionDiff.unchecked).toEqual([legacyKey]);
  });

  it('keeps Core and Charts Tooltip distinct in a full audit', () => {
    const rows = [
      {
        owner: 'core/Tooltip',
        storyId: 'core-tooltip--default',
        component: 'Tooltip',
        story: 'Default',
        ruleId: 'color-contrast',
      },
      {
        owner: 'charts/ChartTooltip',
        storyId: 'charts-chrome-tooltip--default',
        component: 'Tooltip',
        story: 'Default',
        ruleId: 'color-contrast',
      },
    ];
    const report = makeMultiRoutedReport(rows);
    const legacyKey = 'Tooltip::Default::color-contrast';
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: [{key: legacyKey}],
    });

    expect(diff.newViolations.map(violation => violation.key).sort()).toEqual(
      rows.map(row => `${row.owner}::${row.storyId}::${row.ruleId}`).sort(),
    );
    expect(diff.resolved).toEqual([]);
    expect(diff.unchecked).toEqual([legacyKey]);
  });

  it('migrates proven same-package contract fixtures without new or resolved churn', () => {
    const rows = [
      {
        owner: 'core/ClickableCard',
        storyId: 'a11y-button-pattern--clickable-card-disabled',
        component: 'Button pattern',
        story: 'Clickable Card Disabled',
        ruleId: 'color-contrast',
      },
      {
        owner: 'core/CheckboxListItem',
        storyId: 'a11y-checkbox-pattern--list-item-group-disabled-with-message',
        component: 'Checkbox pattern',
        story: 'List Item Group Disabled With Message',
        ruleId: 'color-contrast',
      },
      {
        owner: 'core/SelectableCard',
        storyId: 'a11y-checkbox-pattern--card-disabled',
        component: 'Checkbox pattern',
        story: 'Card Disabled',
        ruleId: 'color-contrast',
      },
      {
        owner: 'core/RadioList',
        storyId:
          'a11y-radio-group-pattern--radio-list-group-disabled-with-message',
        component: 'Radio group pattern',
        story: 'Radio List Group Disabled With Message',
        ruleId: 'color-contrast',
      },
      {
        owner: 'core/RadioListItem',
        storyId: 'a11y-radio-group-pattern--radio-list-option-group-disabled',
        component: 'Radio group pattern',
        story: 'Radio List Option Group Disabled',
        ruleId: 'color-contrast',
      },
      {
        owner: 'core/RadioListItem',
        storyId:
          'a11y-radio-group-pattern--radio-list-option-disabled-with-message',
        component: 'Radio group pattern',
        story: 'Radio List Option Disabled With Message',
        ruleId: 'color-contrast',
      },
    ];
    const legacyBaselineAliases = {
      'ClickableCard::Disabled': [
        'core/ClickableCard::a11y-button-pattern--clickable-card-disabled',
      ],
      'CheckboxList::Disabled With Message': [
        'core/CheckboxListItem::a11y-checkbox-pattern--list-item-group-disabled-with-message',
      ],
      'SelectableCard::Disabled': [
        'core/SelectableCard::a11y-checkbox-pattern--card-disabled',
      ],
      'RadioList::Disabled': [
        'core/RadioListItem::a11y-radio-group-pattern--radio-list-option-group-disabled',
      ],
      'RadioList::Disabled With Message': [
        'core/RadioList::a11y-radio-group-pattern--radio-list-group-disabled-with-message',
        'core/RadioListItem::a11y-radio-group-pattern--radio-list-option-disabled-with-message',
      ],
    };
    const report = makeMultiRoutedReport(rows, {legacyBaselineAliases});
    const legacyKeys = Object.keys(legacyBaselineAliases).map(key => ({
      key: `${key}::color-contrast`,
    }));
    const diff = diffAgainstBaseline(report, {version: 1, entries: legacyKeys});

    expect(diff.newViolations).toEqual([]);
    expect(diff.resolved).toEqual([]);
    expect(diff.matched).toBe(6);
    const migrated = buildBaseline(report, {
      existing: {version: 1, entries: legacyKeys},
    }).entries.map(entry => entry.key);
    expect(migrated).toEqual(
      rows.map(row => `${row.owner}::${row.storyId}::${row.ruleId}`).sort(),
    );
  });
});

describe('buildBaseline', () => {
  it('round-trips: a baseline built from a report gates that report clean', () => {
    const report = makeReport({
      Button: {Primary: [axeViolation('button-name')]},
      Dialog: {Basic: [axeViolation('aria-dialog-name', {impact: 'critical'})]},
    });
    const baseline = buildBaseline(report, {
      now: new Date('2026-07-25T00:00:00Z'),
    });
    expect(baseline.generatedAt).toBe('2026-07-25T00:00:00.000Z');
    expect(baseline.entries.map(e => e.key)).toEqual([
      'Button::Primary::button-name',
      'Dialog::Basic::aria-dialog-name',
    ]);

    const diff = diffAgainstBaseline(report, baseline);
    expect(diff.newViolations).toEqual([]);
    expect(diff.resolved).toEqual([]);
    expect(diff.matched).toBe(2);
  });

  it('preserves entries for components outside a scoped regeneration', () => {
    // `pnpm a11y:baseline -- --components Button` must not drop baseline
    // entries belonging to components that were not audited in this run.
    const existing = {
      version: 1,
      entries: [
        {key: 'Button::Primary::color-contrast', impact: 'serious'},
        {key: 'Dialog::Basic::aria-dialog-name', impact: 'critical'},
        'Toast::Stacked::aria-live-region',
      ],
    };
    const scopedReport = makeReport({
      Button: {Primary: [axeViolation('button-name')]},
    });
    const baseline = buildBaseline(scopedReport, {existing});
    expect(baseline.entries.map(e => e.key)).toEqual([
      // Button entries replaced by the fresh audit (color-contrast dropped,
      // button-name added); Dialog/Toast entries preserved untouched.
      'Button::Primary::button-name',
      'Dialog::Basic::aria-dialog-name',
      'Toast::Stacked::aria-live-region',
    ]);
  });

  it('preserves unscanned stories when regenerating one routed owner story', () => {
    const existing = {
      version: 1,
      entries: RICH_TEXT_BASELINE_KEYS.map(key => ({key})),
    };
    const scopedReport = makeRoutedReport({
      owner: 'richtext/RichTextEditorToolbar',
      storyId: 'lab-richtexteditor--with-toolbar',
      component: 'RichTextEditor',
      story: 'With Toolbar',
    });
    const baseline = buildBaseline(scopedReport, {existing});

    expect(baseline.entries).toHaveLength(12);
    expect(baseline.entries.map(entry => entry.key)).not.toContain(
      'RichTextEditor::With Toolbar::aria-input-field-name',
    );
    expect(baseline.entries.map(entry => entry.key)).toContain(
      'RichTextEditor::Default::aria-input-field-name',
    );
  });

  it('migrates a full five-package baseline without false churn', () => {
    const rows = [
      {
        owner: 'core/Button',
        storyId: 'core-button--default',
        component: 'Button',
        story: 'Default',
        ruleId: 'button-name',
      },
      {
        owner: 'lab/CodeEditor',
        storyId: 'lab-codeeditor--python-editor',
        component: 'CodeEditor',
        story: 'Python Editor',
        ruleId: 'color-contrast',
      },
      {
        owner: 'charts/ChartLegend',
        storyId: 'charts-chrome-legend--default',
        component: 'Legend',
        story: 'Default',
        ruleId: 'color-contrast',
      },
      {
        owner: 'richtext/RichTextEditorToolbar',
        storyId: 'lab-richtexteditor--with-toolbar',
        component: 'RichTextEditor',
        story: 'With Toolbar',
        ruleId: 'aria-input-field-name',
      },
      {
        owner: 'vega/VegaChart',
        storyId: 'vega-vegachart--default',
        component: 'VegaChart',
        story: 'Default',
        ruleId: 'color-contrast',
      },
      {
        owner: 'core/Card',
        storyId: 'core-card--resolved',
        component: 'Card',
        story: 'Resolved',
      },
    ];
    const report = makeMultiRoutedReport(rows);
    const unchangedLegacyKeys = rows
      .filter(row => row.ruleId)
      .map(row => `${row.component}::${row.story}::${row.ruleId}`);
    const resolvedKey = 'Card::Resolved::color-contrast';
    const uncheckedKey = 'Dialog::Unaudited::aria-dialog-name';
    const existing = {
      version: 1,
      entries: [...unchangedLegacyKeys, resolvedKey, uncheckedKey].map(key => ({
        key,
      })),
    };

    const diff = diffAgainstBaseline(report, existing);
    expect(diff.newViolations).toEqual([]);
    expect(diff.resolved).toEqual([resolvedKey]);
    expect(diff.unchecked).toEqual([uncheckedKey]);
    expect(diff.matched).toBe(5);

    const migrated = buildBaseline(report, {existing}).entries.map(
      entry => entry.key,
    );
    expect(migrated).toEqual(
      [
        ...rows
          .filter(row => row.ruleId)
          .map(row => `${row.owner}::${row.storyId}::${row.ruleId}`),
        uncheckedKey,
      ].sort(),
    );
  });

  it('migrates a unique audited legacy key to package and story identity', () => {
    const legacyKey = 'RichTextEditor::With Toolbar::aria-input-field-name';
    const scopedReport = makeRoutedReport({
      owner: 'richtext/RichTextEditorToolbar',
      storyId: 'lab-richtexteditor--with-toolbar',
      component: 'RichTextEditor',
      story: 'With Toolbar',
      violations: [axeViolation('aria-input-field-name')],
    });
    const baseline = buildBaseline(scopedReport, {
      existing: {version: 1, entries: [{key: legacyKey}]},
    });

    expect(baseline.entries.map(entry => entry.key)).toEqual([
      'richtext/RichTextEditorToolbar::lab-richtexteditor--with-toolbar::aria-input-field-name',
    ]);
    expect(
      diffAgainstBaseline(scopedReport, {
        version: 1,
        entries: [{key: legacyKey}],
      }).newViolations,
    ).toEqual([]);
  });
});

describe('formatDiffSummary', () => {
  it('describes new violations with rule, impact, location, and remediation', () => {
    const report = makeReport({
      Button: {Primary: [axeViolation('button-name')]},
    });
    const summary = formatDiffSummary(
      diffAgainstBaseline(report, {version: 1, entries: []}),
      {baselinePath: '.github/a11y-baseline.json'},
    );
    expect(summary).toContain('button-name');
    expect(summary).toContain('[serious]');
    expect(summary).toContain('Button / Primary');
    expect(summary).toContain('pnpm a11y:audit');
    expect(summary).toContain('pnpm a11y:baseline');
    expect(summary).toContain('.github/a11y-baseline.json');
  });

  it('notes resolved entries as removable without failing language', () => {
    const report = makeReport({Button: {Primary: []}});
    const summary = formatDiffSummary(
      diffAgainstBaseline(report, {
        version: 1,
        entries: ['Button::Primary::button-name'],
      }),
    );
    expect(summary).toContain('can be removed');
    expect(summary).toContain('Button::Primary::button-name');
    expect(summary).toContain('Gate passed');
  });
});

describe('formatResolvedWarning', () => {
  it('is empty when every baseline entry still occurs', () => {
    const report = makeReport({
      Button: {Primary: [axeViolation('button-name')]},
    });
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: ['Button::Primary::button-name'],
    });
    expect(diff.resolved).toEqual([]);
    expect(formatResolvedWarning(diff)).toBe('');
  });

  it('warns, without failing, when one baseline entry no longer occurs', () => {
    const report = makeReport({Button: {Primary: []}});
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: ['Button::Primary::button-name'],
    });
    expect(diff.newViolations).toEqual([]);
    expect(formatResolvedWarning(diff)).toBe(
      '::warning title=Resolved accessibility baseline entries::1 baseline entry no longer occurs; ' +
        "remove it from .github/a11y-baseline.json. The keys are in this step's log.",
    );
  });

  it('counts every resolved entry and names the baseline path it was given', () => {
    const warning = formatResolvedWarning(
      {resolved: ['A::One::color-contrast', 'B::Two::color-contrast']},
      {baselinePath: 'custom/baseline.json'},
    );
    expect(warning).toMatch(/^::warning /);
    expect(warning).toContain(
      '2 baseline entries no longer occur; remove them',
    );
    expect(warning).toContain('custom/baseline.json');
  });

  it('leaves an entry outside the audited stories out of the count', () => {
    const report = makeReport({Button: {Primary: []}});
    const diff = diffAgainstBaseline(report, {
      version: 1,
      entries: [
        'Button::Primary::button-name',
        'Dialog::Default::aria-dialog-name',
      ],
    });
    expect(diff.unchecked).toEqual(['Dialog::Default::aria-dialog-name']);
    expect(formatResolvedWarning(diff)).toContain(
      '1 baseline entry no longer occurs',
    );
  });
});
