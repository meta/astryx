// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollRegionProps.test.tsx
 * @input LayoutContent, LayoutPanel and StackItem, with the overflow observer
 *   replaced by one the test drives
 * @output Regression coverage for naming a scrolling region: only while it
 *   scrolls, the caller's role and label first, a translated default, and the
 *   observer stopping
 * @position Unit contract of useScrollRegionProps through its three callers;
 *   the Chromium spec in __tests__ reads the real accessibility tree
 */

import {act, render, screen} from '@testing-library/react';
import {createRef} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutPanel} from '../Layout/LayoutPanel';
import {StackItem} from '../Stack/StackItem';

const observers = vi.hoisted(
  () =>
    new Map<
      Element,
      {onChange: (overflows: boolean) => void; stopped: boolean}
    >(),
);

vi.mock('../AppShell/observeMainOverflow', () => ({
  observeMainOverflow: (
    element: Element,
    onChange: (overflows: boolean) => void,
  ) => {
    const entry = {onChange, stopped: false};
    observers.set(element, entry);
    return () => {
      entry.stopped = true;
    };
  },
}));

function setOverflow(element: Element, overflows: boolean) {
  const entry = observers.get(element);
  if (entry == null) {
    throw new Error('the region is not observed');
  }
  act(() => entry.onChange(overflows));
}

afterEach(() => {
  observers.clear();
});

describe('a scrolling LayoutContent', () => {
  it('is a group named "Content" only while it overflows', () => {
    render(<LayoutContent data-testid="region">Body</LayoutContent>);
    const region = screen.getByTestId('region');
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');

    setOverflow(region, true);
    expect(region).toHaveAttribute('role', 'group');
    expect(region).toHaveAttribute('aria-label', 'Content');

    setOverflow(region, false);
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
  });

  it("takes the caller's label, which also names it while it fits", () => {
    render(
      <LayoutContent data-testid="region" label="Messages">
        Body
      </LayoutContent>,
    );
    const region = screen.getByTestId('region');
    expect(region).toHaveAttribute('aria-label', 'Messages');
    expect(region).not.toHaveAttribute('role');

    setOverflow(region, true);
    expect(region).toHaveAttribute('role', 'group');
    expect(region).toHaveAttribute('aria-label', 'Messages');
  });

  it("keeps a caller's landmark role with only the caller's name, and does not observe it", () => {
    render(
      <LayoutContent data-testid="region" role="main">
        Body
      </LayoutContent>,
    );
    const region = screen.getByTestId('region');
    expect(observers.has(region)).toBe(false);
    expect(region).toHaveAttribute('role', 'main');
    expect(region).not.toHaveAttribute('aria-label');
  });

  it('reads the name from the catalog', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.scrollRegion.label': 'Body text'}}}>
        <LayoutContent data-testid="region">Body</LayoutContent>
      </InternationalizationProvider>,
    );
    const region = screen.getByTestId('region');
    setOverflow(region, true);
    expect(region).toHaveAttribute('aria-label', 'Body text');
  });

  it('is never observed or named when it cannot scroll', () => {
    render(
      <LayoutContent data-testid="region" isScrollable={false}>
        Body
      </LayoutContent>,
    );
    const region = screen.getByTestId('region');
    expect(observers.has(region)).toBe(false);
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
  });

  it('leaves the tab index to the browser', () => {
    render(<LayoutContent data-testid="region">Body</LayoutContent>);
    const region = screen.getByTestId('region');
    setOverflow(region, true);
    expect(region).not.toHaveAttribute('tabindex');
  });

  it("still gives the caller's ref the root, and stops observing on unmount", () => {
    const ref = createRef<HTMLDivElement>();
    const {unmount} = render(
      <LayoutContent data-testid="region" ref={ref}>
        Body
      </LayoutContent>,
    );
    const region = screen.getByTestId('region');
    expect(ref.current).toBe(region);
    const entry = observers.get(region);
    expect(entry?.stopped).toBe(false);

    unmount();
    expect(entry?.stopped).toBe(true);
    expect(ref.current).toBeNull();
  });
});

describe('a scrolling LayoutPanel', () => {
  it('is a group named "Content" only while it overflows', () => {
    render(<LayoutPanel data-testid="region">Sections</LayoutPanel>);
    const region = screen.getByTestId('region');
    expect(region).not.toHaveAttribute('role');

    setOverflow(region, true);
    expect(region).toHaveAttribute('role', 'group');
    expect(region).toHaveAttribute('aria-label', 'Content');
  });

  it("keeps the caller's role and label, and does not observe it", () => {
    render(
      <LayoutPanel data-testid="region" label="Sections" role="navigation">
        Sections
      </LayoutPanel>,
    );
    const region = screen.getByTestId('region');
    expect(observers.has(region)).toBe(false);
    expect(region).toHaveAttribute('role', 'navigation');
    expect(region).toHaveAttribute('aria-label', 'Sections');
  });
});

describe('a scrollable StackItem', () => {
  it('is a group named "Content" only while it overflows', () => {
    render(
      <StackItem data-testid="region" isScrollable>
        Items
      </StackItem>,
    );
    const region = screen.getByTestId('region');
    expect(region).not.toHaveAttribute('role');

    setOverflow(region, true);
    expect(region).toHaveAttribute('role', 'group');
    expect(region).toHaveAttribute('aria-label', 'Content');

    setOverflow(region, false);
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
  });

  it("keeps the caller's role and aria-label, and its ref", () => {
    const ref = createRef<HTMLElement>();
    render(
      <StackItem
        aria-label="Results"
        data-testid="region"
        isScrollable
        ref={ref}
        role="region">
        Items
      </StackItem>,
    );
    const region = screen.getByTestId('region');
    expect(ref.current).toBe(region);
    expect(observers.has(region)).toBe(false);
    expect(region).toHaveAttribute('role', 'region');
    expect(region).toHaveAttribute('aria-label', 'Results');
  });

  it('keeps the own role of another element, such as a list, and does not observe it', () => {
    render(
      <StackItem as="ul" data-testid="region" isScrollable>
        <li>Item</li>
      </StackItem>,
    );
    const region = screen.getByTestId('region');
    expect(region.tagName).toBe('UL');
    expect(observers.has(region)).toBe(false);
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
  });

  it('is never observed or named when it is not scrollable', () => {
    render(<StackItem data-testid="region">Items</StackItem>);
    const region = screen.getByTestId('region');
    expect(observers.has(region)).toBe(false);
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
  });
});
