// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import type {PropDoc, ThemingDoc} from '../generated/componentRegistry';
import {
  configKey,
  dataAttrForName,
  targetDataAttributes,
  targetPropValues,
  buildDefineThemeExample,
  publicVars,
  hasThemingContent,
} from '../components/component-detail/themingHelpers';

describe('theming helpers — configKey', () => {
  it('strips the astryx- namespace prefix', () => {
    expect(configKey({className: 'astryx-button'})).toBe('button');
    expect(configKey({className: 'astryx-banner-icon'})).toBe('banner-icon');
  });

  it('leaves a non-prefixed class untouched', () => {
    expect(configKey({className: 'custom-thing'})).toBe('custom-thing');
  });
});

describe('theming helpers — data attributes', () => {
  it('kebab-cases camelCase names', () => {
    expect(dataAttrForName('listStyle')).toBe('data-list-style');
    expect(dataAttrForName('variant')).toBe('data-variant');
  });

  it('reflects both visual props and states', () => {
    expect(
      targetDataAttributes({
        className: 'astryx-checkbox-indicator',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      }),
    ).toEqual(['data-size', 'data-checked', 'data-disabled']);
  });
});

describe('theming helpers — targetPropValues', () => {
  const variantProp: PropDoc = {
    name: 'variant',
    type: "'primary' | 'secondary' | 'ghost'",
    description: '',
  };

  it('expands variant to its literal values', () => {
    expect(
      targetPropValues({className: 'astryx-button', visualProps: ['variant']}, [
        variantProp,
      ]),
    ).toEqual(['primary', 'secondary', 'ghost']);
  });

  it('lists non-variant visual props as-is', () => {
    expect(
      targetPropValues(
        {className: 'astryx-banner', visualProps: ['container', 'status']},
        [],
      ),
    ).toEqual(['container', 'status']);
  });

  it('returns empty when there are no visual props', () => {
    expect(targetPropValues({className: 'astryx-card'}, [])).toEqual([]);
  });
});

describe('theming helpers — buildDefineThemeExample', () => {
  it('emits a components block keyed by config key with base + prop', () => {
    const theming: ThemingDoc = {
      targets: [{className: 'astryx-button', visualProps: ['variant', 'size']}],
    };
    const example = buildDefineThemeExample(theming);
    expect(example).toContain('components: {');
    expect(example).toContain("'button': {");
    expect(example).toContain('base: {');
    expect(example).toContain("'variant:value': {");
  });

  it('adds a second sub-element target when present', () => {
    const theming: ThemingDoc = {
      targets: [
        {className: 'astryx-banner'},
        {className: 'astryx-banner-icon', states: ['status']},
      ],
    };
    const example = buildDefineThemeExample(theming);
    expect(example).toContain("'banner': {");
    expect(example).toContain("'banner-icon': {");
    expect(example).toContain("'status': {");
  });

  it('returns empty string with no targets', () => {
    expect(buildDefineThemeExample({targets: []})).toBe('');
  });
});

describe('theming helpers — publicVars', () => {
  it('hides private and derived vars', () => {
    const theming: ThemingDoc = {
      targets: [],
      vars: [
        {name: '--button-focus-offset', description: 'x', default: '3px'},
        {
          name: '--_button-radius',
          description: 'y',
          default: 'var(--radius-element)',
          private: true,
        },
        {
          name: '--card-concentric-radius',
          description: 'z',
          default: '0px',
          derived: true,
        },
      ],
    };
    const vars = publicVars(theming);
    expect(vars.map(v => v.name)).toEqual(['--button-focus-offset']);
  });

  it('returns empty when a component exposes no vars', () => {
    expect(publicVars({targets: []})).toEqual([]);
  });
});

describe('theming helpers — hasThemingContent', () => {
  it('is false for a null theming doc', () => {
    expect(hasThemingContent(null)).toBe(false);
  });

  it('is false when there are no targets and no public vars', () => {
    expect(hasThemingContent({targets: []})).toBe(false);
    expect(
      hasThemingContent({
        targets: [],
        vars: [
          {name: '--_private', description: 'x', default: '0', private: true},
          {name: '--derived', description: 'y', default: '0', derived: true},
        ],
      }),
    ).toBe(false);
  });

  it('is true when the component has at least one theme target', () => {
    expect(hasThemingContent({targets: [{className: 'astryx-button'}]})).toBe(
      true,
    );
  });

  it('is true when the component exposes a public CSS variable', () => {
    expect(
      hasThemingContent({
        targets: [],
        vars: [{name: '--button-gap', description: 'x', default: '8px'}],
      }),
    ).toBe(true);
  });
});

describe('theming section — canary gating', () => {
  const source = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../components/component-detail/Theming.tsx',
    ),
    'utf8',
  );

  it('renders the section only on canary builds', () => {
    expect(source).toContain("CURRENT_TARGET !== 'canary'");
  });

  it('shows an experimental notice about the theming API', () => {
    expect(source).toMatch(/theming API is experimental/i);
  });

  it('wraps both theming tables in a Card, like sibling doc tables', () => {
    // Both the desktop <Table> and the mobile hand-rolled layout for each of
    // the two tables (targets + CSS vars) render inside a <Card>. Four Card
    // open tags total; a bare <Table> outside a Card would regress the
    // consistency this test guards.
    const cardOpenTags = source.match(/<Card[\s>]/g) ?? [];
    expect(cardOpenTags.length).toBe(4);
    expect(source).not.toMatch(/\)\s*;\s*}\s*\n\s*return \(\s*<Table/);
  });
});

describe('theming tab — component detail wiring', () => {
  const source = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../components/component-detail/ComponentDetailClient.tsx',
    ),
    'utf8',
  );

  it('renders a dedicated Theming tab', () => {
    expect(source).toMatch(/<Tab value="theming" label="Theming" \/>/);
  });

  it('only mounts the Theming tab when there is themeable content', () => {
    expect(source).toContain('hasThemingContent(comp.theming)');
    expect(source).toContain("CURRENT_TARGET === 'canary'");
  });

  it('renders the Theming section in the theming tab, not Overview', () => {
    expect(source).toMatch(
      /tab === 'theming' && comp\.theming && \(\s*<Theming/,
    );
  });
});
