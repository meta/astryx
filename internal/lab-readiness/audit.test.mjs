// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file audit.test.mjs
 * Pins the two properties that make the readiness report trustworthy:
 * the source tree overrides the manifest (a stale claim cannot inflate a
 * score), and a component invisible to the CI accessibility or RTL gates
 * cannot pass the checks that depend on those gates. The second property is
 * the regression guard for the gap that let every lab component sit outside
 * both audits while still being scored against them.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';

import {CHECK_KEYS, HUMAN_REVIEW_KEYS} from './catalog.mjs';
import {deriveChecks, _internal} from './automated.mjs';
import {auditCandidate, buildRegistry, buildReport} from './audit.mjs';

/** A candidate whose files we can write into a scratch repo. */
const candidate = {
  id: 'widget',
  displayName: 'Widget',
  sourceDir: 'Widget',
  targetPackage: '@astryxdesign/core',
  trackingIssue: 1,
  voteIssue: 1,
  storyTitle: 'Lab/Widget',
  storybookStoryId: 'lab-widget--default',
  publicExports: ['Widget'],
  stateProps: ['isDisabled'],
  summary: 'A widget.',
  declared: {},
};

let root;

/** Write a fully passing scratch repo for `candidate`. */
function scaffold(overrides = {}) {
  const files = {
    '.github/workflows/ci.yml':
      'CHANGED=$(git diff --name-only origin/main...HEAD -- packages/core/src/ packages/lab/src/ | grep -v x)\n',
    'apps/storybook/rtl-audit/rtl-audit.mjs':
      "const AUDITED_STORY_PREFIXES = ['core-', 'lab-'];\n",
    'packages/lab/package.json': JSON.stringify({
      name: '@astryxdesign/lab',
      dependencies: {'d3-scale': '^4.0.2'},
      peerDependencies: {react: '>=19.0.0'},
    }),
    'packages/lab/src/index.ts': "export {Widget} from './Widget';\n",
    'packages/lab/src/Widget/index.ts':
      "export {Widget} from './Widget';\nexport type {WidgetProps} from './Widget';\n",
    'packages/lab/src/Widget/Widget.tsx':
      "import {Text} from '@astryxdesign/core/Text';\nexport function Widget() { return <Text />; }\n",
    'packages/lab/src/Widget/Widget.doc.mjs':
      'export const docs = {props: [], usage: {}, examples: [], theming: {targets: []}};\n',
    'packages/lab/src/Widget/Widget.test.tsx':
      "it('renders', () => {});\nit('supports isDisabled', () => {});\nit('handles Enter', () => {});\n",
    'apps/storybook/stories/Widget.stories.tsx':
      "const meta = {title: 'Lab/Widget'};\n" +
      'export const Default: Story = {};\n' +
      'export const Disabled: Story = {isDisabled: true};\n' +
      'export const Loading: Story = {};\n' +
      'export const Empty: Story = {};\n' +
      'export const ThemeMatrix: Story = {};\n',
    ...overrides,
  };
  for (const [rel, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, contents);
  }
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-readiness-'));
});
afterAll(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('automated derivation', () => {
  it('passes the derivable checks for a fully wired component', () => {
    scaffold();
    const derived = deriveChecks(root, candidate);
    const failing = Object.entries(derived)
      .filter(([, v]) => v.state !== 'passed')
      .map(([k, v]) => `${k}: ${v.note}`);
    expect(failing).toEqual([]);
  });

  it('fails the accessibility check when ci.yml stops watching lab', () => {
    scaffold({
      '.github/workflows/ci.yml':
        'CHANGED=$(git diff --name-only origin/main...HEAD -- packages/core/src/ | grep -v x)\n',
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.accessibilityContracts.state).not.toBe('passed');
    expect(derived.accessibilityContracts.note).toMatch(/excludes packages\/lab/);
  });

  it('fails the keyboard check when the RTL sweep stops covering lab', () => {
    scaffold({
      'apps/storybook/rtl-audit/rtl-audit.mjs':
        "const AUDITED_STORY_PREFIXES = ['core-'];\n",
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.keyboardAccessibility.state).not.toBe('passed');
    expect(derived.keyboardAccessibility.note).toMatch(/RTL/);
  });

  it('fails the accessibility check when no story title resolves to the component name', () => {
    scaffold({
      'apps/storybook/stories/Widget.stories.tsx':
        "const meta = {title: 'Lab/WidgetSelector'};\nexport const Default: Story = {};\n",
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.accessibilityContracts.state).not.toBe('passed');
    expect(derived.accessibilityContracts.note).toMatch(/resolves to the analyzer/);
  });

  it('requires an advertised state to appear in both a story and a test', () => {
    scaffold({
      'packages/lab/src/Widget/Widget.test.tsx':
        "it('renders', () => {});\nit('handles Enter', () => {});\n",
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.stateCoverage.state).not.toBe('passed');
    expect(derived.stateCoverage.note).toMatch(/isDisabled.*no test/);
  });

  it('asks for an edge-case story only for states the props expose', () => {
    scaffold({
      'packages/lab/src/Widget/Widget.tsx':
        "import {Text} from '@astryxdesign/core/Text';\n" +
        'export interface WidgetProps { isDisabled?: boolean; isLoading?: boolean }\n' +
        'export function Widget() { return <Text />; }\n',
      'apps/storybook/stories/Widget.stories.tsx':
        "const meta = {title: 'Lab/Widget'};\n" +
        'export const Default: Story = {};\n' +
        'export const ThemeMatrix: Story = {};\n',
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.edgeCases.state).not.toBe('passed');
    expect(derived.edgeCases.note).toMatch(/disabled/);
    expect(derived.edgeCases.note).toMatch(/loading/);
    // Nothing in the props implies an empty state, so it must not be demanded.
    expect(derived.edgeCases.note).not.toMatch(/empty/);
  });

  it('owes no edge-case story when the component exposes no such state', () => {
    // The rubric describes the API; it must never pressure someone into adding
    // an isLoading prop that nothing needs just to turn a check green.
    scaffold({
      'apps/storybook/stories/Widget.stories.tsx':
        "const meta = {title: 'Lab/Widget'};\n" +
        'export const Default: Story = {};\n' +
        'export const Disabled: Story = {};\n' +
        'export const ThemeMatrix: Story = {};\n',
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.edgeCases.state).toBe('passed');
    expect(derived.edgeCases.note).toMatch(/none is owed a story/);
  });

  it('asks for an empty story when the component renders an EmptyState', () => {
    scaffold({
      'packages/lab/src/Widget/Widget.tsx':
        "import {EmptyState} from '@astryxdesign/core/EmptyState';\n" +
        'export function Widget() { return <EmptyState />; }\n',
      'apps/storybook/stories/Widget.stories.tsx':
        "const meta = {title: 'Lab/Widget'};\n" +
        'export const Default: Story = {};\n' +
        'export const ThemeMatrix: Story = {};\n',
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.edgeCases.state).not.toBe('passed');
    expect(derived.edgeCases.note).toMatch(/empty/);
  });

  it('accepts a locally defined SVG glyph', () => {
    // Core defines glyphs this way in Avatar, Thumbnail, and Indicator, so a
    // raw <svg> is idiomatic rather than a finding.
    scaffold({
      'packages/lab/src/Widget/Widget.tsx':
        "import {Text} from '@astryxdesign/core/Text';\n" +
        'function Glyph() { return <svg><circle /></svg>; }\n' +
        'export function Widget() { return <Text><Glyph /></Text>; }\n',
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.systemIntegration.state).toBe('passed');
    expect(derived.reuseNaming.state).toBe('passed');
  });

  it('flags an icon import from an undeclared package', () => {
    scaffold({
      'packages/lab/src/Widget/Widget.tsx':
        "import {Text} from '@astryxdesign/core/Text';\n" +
        "import {GripVertical} from 'lucide-react';\n" +
        'export function Widget() { return <Text><GripVertical /></Text>; }\n',
    });
    const derived = deriveChecks(root, candidate);
    expect(derived.systemIntegration.state).not.toBe('passed');
    expect(derived.systemIntegration.note).toMatch(/lucide-react/);
    expect(derived.reuseNaming.note).toMatch(/lucide-react/);
  });

  it('does not flag a package the lab manifest declares', () => {
    scaffold({
      'packages/lab/src/Widget/Widget.tsx':
        "import {Text} from '@astryxdesign/core/Text';\n" +
        "import {scaleLinear} from 'd3-scale';\n" +
        'export function Widget() { return <Text>{String(scaleLinear)}</Text>; }\n',
    });
    expect(deriveChecks(root, candidate).systemIntegration.state).toBe('passed');
  });

  it('accepts inline type modifiers in the barrel', () => {
    scaffold({
      'packages/lab/src/Widget/index.ts':
        "export {Widget, type WidgetProps} from './Widget';\n",
    });
    expect(deriveChecks(root, candidate).structureTypes.state).toBe('passed');
  });
});

describe('manifest reconciliation', () => {
  it('lets the source tree override a passing manifest claim', () => {
    scaffold({
      'packages/lab/src/Widget/Widget.doc.mjs':
        'export const docs = {props: [], usage: {}, examples: []};\n',
    });
    const result = auditCandidate(root, {
      ...candidate,
      declared: {
        tokensTheming: {
          state: 'passed',
          note: 'claimed',
          evidence: [{label: 'PR #1', url: 'https://example.com'}],
        },
      },
    });
    const check = result.checks.find(c => c.key === 'tokensTheming');
    expect(check.state).toBe('in_progress');
    expect(check.contradictsManifest).toBe(true);
    expect(result.contradictions.map(c => c.key)).toContain('tokensTheming');
  });

  it('demotes a passing claim that links no evidence', () => {
    scaffold();
    const result = auditCandidate(root, {
      ...candidate,
      declared: {visualQuality: {state: 'passed', note: 'looks fine'}},
    });
    const check = result.checks.find(c => c.key === 'visualQuality');
    expect(check.state).toBe('in_progress');
    expect(check.note).toMatch(/requires linked evidence/);
  });

  it('keeps a human-review claim that does link evidence', () => {
    scaffold();
    const result = auditCandidate(root, {
      ...candidate,
      declared: {
        visualQuality: {
          state: 'passed',
          note: 'reviewed',
          evidence: [{label: 'PR #2', url: 'https://example.com'}],
        },
      },
    });
    expect(result.checks.find(c => c.key === 'visualQuality').state).toBe(
      'passed',
    );
  });

  it('never derives a human-review check from the source tree', () => {
    scaffold();
    const derived = deriveChecks(root, candidate);
    for (const key of HUMAN_REVIEW_KEYS) {
      expect(derived[key]).toBeUndefined();
    }
  });
});

describe('report shape', () => {
  it('scores every catalog check exactly once', () => {
    scaffold();
    const result = auditCandidate(root, candidate);
    expect(result.checks.map(c => c.key)).toEqual(CHECK_KEYS);
    expect(result.totalChecks).toBe(CHECK_KEYS.length);
  });

  it('reports graduation readiness only when every check passes', () => {
    scaffold();
    const result = auditCandidate(root, candidate);
    expect(result.isGraduationReady).toBe(false);
    expect(result.passedChecks).toBeLessThan(CHECK_KEYS.length);

    // A perfect source tree is not enough: the checks that only a manifest can
    // assert (research, spec, review, merge, and human sign-off) must each
    // carry evidence too.
    const derivable = new Set(Object.keys(deriveChecks(root, candidate)));
    const declaredOnly = CHECK_KEYS.filter(key => !derivable.has(key));
    expect(declaredOnly).toEqual(expect.arrayContaining(HUMAN_REVIEW_KEYS));

    const complete = auditCandidate(root, {
      ...candidate,
      declared: Object.fromEntries(
        declaredOnly.map(key => [
          key,
          {
            state: 'passed',
            note: 'evidenced',
            evidence: [{label: 'PR #3', url: 'https://example.com'}],
          },
        ]),
      ),
    });
    expect(complete.isGraduationReady).toBe(true);
    expect(complete.passedChecks).toBe(CHECK_KEYS.length);
  });

  it('emits a registry the Storybook panel can read', () => {
    scaffold();
    const report = buildReport(root, [candidate]);
    const registry = buildRegistry(report);
    expect(registry.components).toHaveLength(1);
    const [component] = registry.components;
    expect(component.id).toBe('widget');
    expect(Object.keys(component.stageResults)).toEqual([
      'research',
      'spec',
      'build',
      'hardenChecks',
      'hardenReview',
    ]);
    expect(component.checks).toHaveLength(CHECK_KEYS.length);
  });
});

describe('CI wiring parsers', () => {
  it('reads the component roots out of the real ci.yml', () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..');
    const roots = _internal.ciComponentRoots(repoRoot);
    expect(roots).toContain('packages/core/src/');
    expect(roots).toContain('packages/lab/src/');
    expect(roots).toContain('packages/charts/src/');
    expect(roots).toContain('packages/richtext/src/');
    expect(roots).toContain('packages/vega/src/');
  });

  it('covers nothing when ci.yml has no recognizable component gate', () => {
    const repoRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'lab-readiness-ci-'),
    );
    try {
      fs.mkdirSync(path.join(repoRoot, '.github/workflows'), {recursive: true});
      fs.writeFileSync(
        path.join(repoRoot, '.github/workflows/ci.yml'),
        'jobs:\n  build:\n    runs-on: ubuntu-latest\n',
      );
      expect(_internal.ciComponentRoots(repoRoot)).toEqual([]);
    } finally {
      fs.rmSync(repoRoot, {recursive: true, force: true});
    }
  });

  it('routes Charts, Rich Text, and Vega source-only changes into component audit scope', () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..');
    const roots = _internal.ciComponentRoots(repoRoot);
    const changedFiles = [
      'packages/charts/src/Chart.tsx',
      'packages/richtext/src/RichTextEditor.tsx',
      'packages/vega/src/VegaChart.tsx',
    ];
    expect(
      changedFiles.every(file => roots.some(root => file.startsWith(root))),
    ).toBe(true);
  });

  it('reads the audited story prefixes out of the real rtl-audit', () => {
    const repoRoot = path.resolve(import.meta.dirname, '..', '..');
    expect(_internal.rtlAuditedPrefixes(repoRoot)).toEqual([
      'core-',
      'lab-',
      'charts-',
      'richtext-',
      'vega-',
    ]);
  });

  it('derives the component name pr-a11y matches against', () => {
    expect(_internal.a11yComponentFromTitle('Lab/ListInput')).toBe('listinput');
    expect(_internal.a11yComponentFromTitle('Core/XDSButton')).toBe('button');
  });
});
