// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AppShellSafeArea.test.tsx
 * @input vitest (jsdom), React Testing Library, AppShell, and the raw CSS the
 *   StyleX runtime injects (recorded before jsdom parses it)
 * @output Checks that AppShell keeps to the device's safe area: the header
 *   (and the sidenav-only phone top bar) pads its items by the top and side
 *   insets, so its background reaches under the status bar while its items
 *   stay clear (under a banner, the top bar takes the sides only, since the
 *   banner's wrapper already pads the top), and the main region's block-end
 *   padding grows by the bottom inset
 * @position Testing; validates AppShell.tsx's safe-area styles. jsdom's CSS
 *   parser drops `env()` values, so the declarations are read from the rules
 *   StyleX hands to `insertRule`; the geometry under real insets is proven by
 *   __tests__/AppShellSafeArea.a11y.chromium.spec.ts
 */

import {render, screen} from '@testing-library/react';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import type {AppShell as AppShellComponent} from './AppShell';
import type {
  SideNav as SideNavComponent,
  SideNavItem as SideNavItemComponent,
  SideNavSection as SideNavSectionComponent,
} from '../SideNav';

/** Every rule StyleX inserted, as the raw text it handed to `insertRule`. */
const rawRules: string[] = [];
let AppShell: typeof AppShellComponent;
let SideNav: typeof SideNavComponent;
let SideNavItem: typeof SideNavItemComponent;
let SideNavSection: typeof SideNavSectionComponent;

beforeAll(async () => {
  const insertRule = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (
    this: CSSStyleSheet,
    rule: string,
    index?: number,
  ) {
    rawRules.push(rule);
    return insertRule.call(this, rule, index);
  };
  // StyleX injects when the styles are created: load AppShell after the
  // recorder is in place.
  vi.resetModules();
  ({AppShell} = await import('./AppShell'));
  ({SideNav, SideNavItem, SideNavSection} = await import('../SideNav'));
});

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubMatchMedia(false);
});

/** The declarations `el`'s classes make, from the raw rules, by property. */
function rawDeclarations(el: Element, pseudo = ''): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const className of Array.from(el.classList)) {
    for (const rule of rawRules) {
      const match = new RegExp(
        `^\\.${className}(?::not\\(#\\\\#\\))*${pseudo}\\{([^}]*)\\}$`,
      ).exec(rule);
      if (match == null) {
        continue;
      }
      for (const declaration of match[1].split(';')) {
        const colon = declaration.indexOf(':');
        if (colon > 0) {
          // StyleX minifies values: compare without whitespace.
          declarations.set(
            declaration.slice(0, colon).trim(),
            declaration.slice(colon + 1).replace(/\s+/g, ''),
          );
        }
      }
    }
  }
  return declarations;
}

describe('AppShell safe area', () => {
  it('pads the header by the top and side insets', () => {
    render(
      <AppShell topNav={<div>Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );
    const declarations = rawDeclarations(screen.getByRole('banner'));
    expect(declarations.get('padding-top')).toBe(
      'env(safe-area-inset-top,0px)',
    );
    // Left-to-right here; a right-to-left context swaps the sides.
    expect(declarations.get('padding-inline-start')).toBe(
      'env(safe-area-inset-left,0px)',
    );
    expect(declarations.get('padding-inline-end')).toBe(
      'env(safe-area-inset-right,0px)',
    );
  });

  it('pads the sidenav-only phone top bar the same way', () => {
    stubMatchMedia(true);
    render(
      <AppShell
        sideNav={
          <SideNav>
            <SideNavSection title="Main" isHeaderHidden>
              <SideNavItem label="Home" />
            </SideNavSection>
          </SideNav>
        }>
        <div>Content</div>
      </AppShell>,
    );
    const bar = screen.getByRole('banner');
    expect(rawDeclarations(bar).get('padding-top')).toBe(
      'env(safe-area-inset-top,0px)',
    );
  });

  it('pads a sidenav-only phone top bar under a banner by the sides only', () => {
    stubMatchMedia(true);
    render(
      <AppShell
        banner={<div>Banner</div>}
        sideNav={
          <SideNav>
            <SideNavSection title="Main" isHeaderHidden>
              <SideNavItem label="Home" />
            </SideNavSection>
          </SideNav>
        }>
        <div>Content</div>
      </AppShell>,
    );
    // The banner's wrapper pads the top inset once; the top bar below it
    // would otherwise add a second band of the same height.
    const banner = screen.getByRole('banner');
    expect(rawDeclarations(banner).get('padding-top')).toBe(
      'env(safe-area-inset-top,0px)',
    );
    const topBar = screen
      .getAllByRole('navigation')
      .map(nav => nav.closest('.astryx-app-shell-header'))
      .find(el => el != null && el !== banner) as HTMLElement;
    expect(topBar).toBeTruthy();
    const declarations = rawDeclarations(topBar);
    expect(declarations.has('padding-top')).toBe(false);
    expect(declarations.get('padding-inline-start')).toBe(
      'env(safe-area-inset-left,0px)',
    );
  });

  it('grows the main region’s block-end padding by the bottom inset', () => {
    render(
      <AppShell topNav={<div>Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    // Padding, not a spacer: main is border-box, so a child that fills it
    // ends above the inset instead of overflowing it.
    expect(rawDeclarations(main).get('padding-bottom')).toBe(
      'env(safe-area-inset-bottom,0px)',
    );
    expect(rawDeclarations(main, '::after').has('height')).toBe(false);
  });

  it('adds the bottom inset to the content padding', () => {
    render(
      <AppShell topNav={<div>Nav</div>} contentPadding={4}>
        <div>Content</div>
      </AppShell>,
    );
    expect(
      rawDeclarations(screen.getByRole('main')).get('padding-bottom'),
    ).toMatch(
      /^calc\(var\(--layout-padding-own-outer-y,var\(--layout-padding-outer-y,.*\)\)\+env\(safe-area-inset-bottom,0px\)\)$/,
    );
  });
});
