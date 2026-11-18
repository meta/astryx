// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file headerFooterXstyle.test.tsx
 * @input Uses vitest, @testing-library/react, StyleX, LayoutHeader, LayoutFooter
 * @output Tests that a caller's xstyle merges after the region's own styles
 * @position Layout tests; pins the xstyle merge order of LayoutHeader and
 *   LayoutFooter
 *
 * jsdom keeps physical declarations such as height and flex-shrink but not
 * logical ones, so these tests override physical properties. The browser spec
 * LayoutHeaderFooterEdges.a11y.browser.spec.ts checks insets and lines.
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {Layout} from '../Layout';
import {LayoutContent} from '../LayoutContent';
import {LayoutFooter} from '../LayoutFooter';
import {LayoutHeader} from '../LayoutHeader';

const overrides = stylex.create({
  tall: {height: '96px'},
  shrinks: {flexShrink: 1},
});

describe.each([
  ['LayoutHeader', LayoutHeader, 'header'],
  ['LayoutFooter', LayoutFooter, 'footer'],
] as const)('%s xstyle', (_, Region, slot) => {
  function renderRegion(props: Parameters<typeof Region>[0]) {
    render(
      <Layout
        {...{[slot]: <Region data-testid="region" {...props} />}}
        content={<LayoutContent>Body</LayoutContent>}
      />,
    );
    return screen.getByTestId('region');
  }

  it('wins over the height prop', () => {
    const region = renderRegion({
      hasDivider: true,
      height: 72,
      xstyle: overrides.tall,
      children: 'Title',
    });
    expect(getComputedStyle(region).height).toBe('96px');
  });

  it("wins over the region's own flex-shrink", () => {
    const region = renderRegion({
      hasDivider: true,
      xstyle: overrides.shrinks,
      children: 'Title',
    });
    expect(getComputedStyle(region).flexShrink).toBe('1');
  });

  it('keeps the own styles that xstyle does not set', () => {
    const region = renderRegion({xstyle: overrides.tall, children: 'Title'});
    expect(getComputedStyle(region).flexShrink).toBe('0');
    expect(getComputedStyle(region).height).toBe('96px');
  });
});
