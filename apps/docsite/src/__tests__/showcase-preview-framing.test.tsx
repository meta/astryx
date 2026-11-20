// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file The Overview showcase stage centers a SideNav-family showcase: the
 * showcase sits in a wrapper of content height, because a SideNav fills its
 * container's height and, directly in the stage, would take the stage's
 * whole height with its items at the top. Other showcases stay direct
 * children of the stage.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {ShowcasePreview} from '../components/component-detail/ShowcasePreview';

vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
  defineVars: <T,>(vars: T) => vars,
  defineConsts: <T,>(consts: T) => consts,
}));
vi.mock('../generated/showcaseRegistry', () => {
  const showcase = (label: string) => () =>
    Promise.resolve({
      default: () => <nav aria-label={label} data-testid="showcase-root" />,
    });
  return {
    showcaseRegistry: {
      SideNavItem: showcase('SideNavItem'),
      SideNavSection: showcase('SideNavSection'),
      SideNavCollapseButton: showcase('SideNavCollapseButton'),
      Button: showcase('Button'),
    },
  };
});

beforeAll(() => {
  // jsdom has no matchMedia; a desktop width renders the stage.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

afterEach(cleanup);

async function stageChildOf(name: string): Promise<HTMLElement> {
  render(<ShowcasePreview name={name} />);
  const root = await screen.findByTestId('showcase-root');
  const stage = root.closest('[style*="aspect-ratio"]');
  expect(stage).not.toBeNull();
  let child: HTMLElement = root;
  while (child.parentElement !== stage) {
    child = child.parentElement as HTMLElement;
  }
  return child;
}

describe('the Overview showcase stage', () => {
  it.each(['SideNavItem', 'SideNavSection', 'SideNavCollapseButton'])(
    'centers the %s showcase in a wrapper of content height',
    async name => {
      const child = await stageChildOf(name);
      expect(child.tagName).toBe('DIV');
      expect(child.getAttribute('style')).toBeNull();
      expect(child.firstElementChild).toBe(screen.getByTestId('showcase-root'));
    },
  );

  it('keeps another showcase as a direct child of the stage', async () => {
    const child = await stageChildOf('Button');
    expect(child).toBe(screen.getByTestId('showcase-root'));
  });
});
