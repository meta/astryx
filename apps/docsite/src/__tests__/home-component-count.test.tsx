// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-component-count.test.tsx
 * @input The home page's server entry, its two sections that show the
 *   component count, and a component registry fixture
 * @output Proof that the server entry counts the public Core components,
 *   rounded down to the nearest 10, and that each section shows the number it
 *   receives
 * @position Docsite unit tests. e2e/home-component-registry.spec.ts proves
 *   that the built home page loads no script that holds the registry.
 * Run: pnpm -F @astryxdesign/docsite test
 */

import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';

// 27 public Core components. A wrong filter, package or rounding gives a
// number in another ten.
const registry = vi.hoisted(() => {
  const entries = (prefix: string, count: number, hidden = false) =>
    Array.from({length: count}, (_, index) => ({
      name: `${prefix}${index}`,
      hidden,
    }));
  return {
    '@astryxdesign/core': [
      ...entries('Component', 27),
      ...entries('Hidden', 9, true),
      ...entries('useHook', 8),
    ],
    '@astryxdesign/lab': entries('LabComponent', 50),
  };
});

// Each mocked component renders its children only, so a test reads the copy
// without the styles and context that the real components need.
const stubs = vi.hoisted(() => ({
  passthrough: async (names: string[]) => {
    const {createElement} = await import('react');
    return Object.fromEntries(
      names.map(name => [
        name,
        ({children}: {children?: ReactNode}) =>
          createElement('div', null, children),
      ]),
    );
  },
}));

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) => styles,
  defineConsts: (consts: Record<string, unknown>) => consts,
  props: () => ({}),
}));
vi.mock('@astryxdesign/core/Button', () => stubs.passthrough(['Button']));
vi.mock('@astryxdesign/core/Card', () => stubs.passthrough(['Card']));
vi.mock('@astryxdesign/core/Grid', () => stubs.passthrough(['Grid']));
vi.mock('@astryxdesign/core/Layout', () =>
  stubs.passthrough(['VStack', 'HStack']),
);
vi.mock('@astryxdesign/core/Link', () => stubs.passthrough(['Link']));
vi.mock('@astryxdesign/core/Text', () =>
  stubs.passthrough(['Text', 'Heading']),
);
vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({spacingVars: {}}));
vi.mock('../components/logos', () => stubs.passthrough(['AstryxLogo']));
vi.mock('../app/(site)/_landing/CliPreview', () =>
  stubs.passthrough(['CliPreview']),
);
vi.mock('../app/(site)/_landing/ComponentsPreview', () =>
  stubs.passthrough(['ComponentsPreview']),
);
vi.mock('../app/(site)/_landing/ThemesPreview', () =>
  stubs.passthrough(['ThemesPreview']),
);
vi.mock('../generated/componentRegistry', () => ({components: registry}));
// The server entry test reads the props that the entry gives the homepage.
vi.mock('../app/(site)/HomePage', () => stubs.passthrough(['HomePage']));
vi.mock('../app/(site)/_landing/FrozenPreview', () =>
  stubs.passthrough(['FrozenPreview']),
);
vi.mock('../app/(site)/_landing/TemplatesPreview', () =>
  stubs.passthrough(['TemplatesPreview']),
);

import {DiscoverShowcase} from '../app/(site)/_landing/DiscoverShowcase';
import {FeaturesShowcase} from '../app/(site)/_landing/FeaturesShowcase';
import Page from '../app/(site)/page';

describe('home page component count', () => {
  it('is the number of public Core components, rounded down to the nearest 10', () => {
    expect(Page().props.coreComponentCount).toBe(20);
  });

  it('shows the number it receives on the components card', () => {
    const html = renderToStaticMarkup(
      <FeaturesShowcase
        coreComponentCount={120}
        templatesPreview={null}
        themesStore={null}
      />,
    );
    expect(html).toContain('Over 120 components');
  });

  it('shows the number it receives in the closing section', () => {
    const html = renderToStaticMarkup(
      <DiscoverShowcase coreComponentCount={120} />,
    );
    expect(html.replaceAll('<!-- -->', '')).toContain('Browse 120+ components');
  });
});
