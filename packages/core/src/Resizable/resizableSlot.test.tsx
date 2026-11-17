// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizableSlot.test.tsx
 * @input vitest (jsdom), Testing Library, LayoutPanel, ResizeHandle and
 *   SideNav given useResizable's output in `resizable`
 * @output Checks that each `resizable` slot takes the hook's output directly,
 *   as it takes the output's `props`, and that SideNav's rail follows a
 *   region it is given
 * @position Unit tests for useResizable.ts, LayoutPanel.tsx,
 *   ResizeHandle.tsx and SideNav.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Layout} from '../Layout/Layout';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutPanel} from '../Layout/LayoutPanel';
import {SideNav} from '../SideNav/SideNav';
import {SideNavItem} from '../SideNav/SideNavItem';
import {SideNavSection} from '../SideNav/SideNavSection';
import {ResizeHandle} from './ResizeHandle';
import {
  useResizable,
  type ResizableRegion,
  type UseResizableSingleConfig,
} from './useResizable';

function StubIcon() {
  return <svg aria-hidden="true" />;
}

let latest: ResizableRegion | undefined;

const NO_CONFIG: UseResizableSingleConfig = {};

/** A start panel and its handle, given the region or its `props`. */
function Split({
  form,
  config = NO_CONFIG,
}: {
  form: 'region' | 'props';
  config?: UseResizableSingleConfig;
}) {
  const resizable = useResizable({
    defaultSize: 200,
    collapsible: true,
    ...config,
  });
  latest = resizable;
  const value = form === 'region' ? resizable : resizable.props;
  return (
    <Layout
      start={
        <>
          <LayoutPanel resizable={value} data-testid="pane">
            <button type="button">Inside</button>
          </LayoutPanel>
          <ResizeHandle resizable={value} label="Resize pane" />
        </>
      }
      content={<LayoutContent>Main</LayoutContent>}
    />
  );
}

const pane = () => screen.getByTestId('pane');
const separator = () => screen.getByRole('separator', {name: 'Resize pane'});

afterEach(() => {
  latest = undefined;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the `resizable` slot takes useResizable's output directly", () => {
  for (const form of ['region', 'props'] as const) {
    it(`sizes the LayoutPanel and drives the region from its ResizeHandle (${form})`, () => {
      render(<Split form={form} />);
      expect(pane().getAttribute('style') ?? '').toContain('200px');
      fireEvent.keyDown(separator(), {key: 'ArrowRight'});
      expect(latest?.size).toBeGreaterThan(200);
      expect(separator()).toHaveAttribute(
        'aria-valuenow',
        String(latest?.size),
      );
    });

    it(`collapses the panel, which goes inert, and opens it again (${form})`, () => {
      render(<Split form={form} />);
      act(() => {
        latest?.collapse();
      });
      expect(pane().getAttribute('style') ?? '').not.toContain('200px');
      expect(pane()).toHaveAttribute('inert');
      act(() => {
        latest?.expand();
      });
      expect(pane().getAttribute('style') ?? '').toContain('200px');
      expect(pane()).not.toHaveAttribute('inert');
    });
  }
});

/** A SideNav whose width and collapse state the caller's region owns. */
function RegionNav({
  collapsible,
  isRegionCollapsible = true,
}: {
  collapsible?: boolean | {isCollapsed?: boolean};
  isRegionCollapsible?: boolean;
}) {
  const resizable = useResizable({
    defaultSize: 300,
    minSize: 200,
    maxSize: 400,
    collapsible: isRegionCollapsible,
  });
  latest = resizable;
  return (
    <SideNav data-testid="nav" resizable={resizable} collapsible={collapsible}>
      <SideNavSection title="Main">
        <SideNavItem label="Dashboard" icon={StubIcon} />
      </SideNavSection>
    </SideNav>
  );
}

describe("SideNav takes useResizable's output in `resizable`, and the region owns collapse", () => {
  it("sizes the rail from the region and follows the region's collapse state", () => {
    render(<RegionNav />);
    expect(screen.getByTestId('nav').getAttribute('style') ?? '').toContain(
      '300px',
    );
    act(() => {
      latest?.collapse();
    });
    expect(latest?.isCollapsed).toBe(true);
    expect(
      screen.getByRole('button', {name: 'Expand sidebar'}),
    ).toBeInTheDocument();
    act(() => {
      latest?.expand();
    });
    expect(
      screen.getByRole('button', {name: 'Collapse sidebar'}),
    ).toBeInTheDocument();
  });

  it("calls the region's collapse and expand from its toggle", () => {
    render(<RegionNav />);
    fireEvent.click(screen.getByRole('button', {name: 'Collapse sidebar'}));
    expect(latest?.isCollapsed).toBe(true);
    fireEvent.click(screen.getByRole('button', {name: 'Expand sidebar'}));
    expect(latest?.isCollapsed).toBe(false);
  });

  it('warns in development when `collapsible` sets its own collapsed state, and the region wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<RegionNav collapsible={{isCollapsed: true}} />);
    expect(latest?.isCollapsed).toBe(false);
    expect(
      screen.getByRole('button', {name: 'Collapse sidebar'}),
    ).toBeInTheDocument();
    expect(regionWarnings(warn)).toEqual([
      expect.stringContaining('`collapsible` sets `isCollapsed`'),
    ]);
    warn.mockRestore();
  });

  it("lets the region's own `collapsible` option decide whether the rail collapses, and warns when `collapsible` disagrees", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<RegionNav collapsible isRegionCollapsible={false} />);
    expect(
      screen.queryByRole('button', {name: 'Collapse sidebar'}),
    ).not.toBeInTheDocument();
    expect(regionWarnings(warn)).toEqual([
      expect.stringContaining('the region is not collapsible'),
    ]);
    view.unmount();
    warn.mockClear();
    render(<RegionNav collapsible={false} />);
    expect(
      screen.getByRole('button', {name: 'Collapse sidebar'}),
    ).toBeInTheDocument();
    expect(regionWarnings(warn)).toEqual([
      expect.stringContaining('the region is collapsible'),
    ]);
    warn.mockRestore();
  });

  it('keeps the boolean and config forms as they were: `collapsible` turns collapse on beside them, and only collapse-state keys conflict, with `resizable` winning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const resizable of [true, {defaultWidth: 300}]) {
      const view = render(
        <SideNav resizable={resizable} collapsible>
          Content
        </SideNav>,
      );
      expect(
        screen.getByRole('button', {name: 'Collapse sidebar'}),
      ).toBeInTheDocument();
      view.unmount();
    }
    expect(warn).not.toHaveBeenCalled();
    render(
      <SideNav
        collapsible={{isCollapsed: false, onCollapsedChange: () => {}}}
        resizable={{isCollapsed: true, onCollapseChange: () => {}}}>
        Content
      </SideNav>,
    );
    expect(
      screen.getByRole('button', {name: 'Expand sidebar'}),
    ).toBeInTheDocument();
    expect(String(warn.mock.calls[0]?.[0])).toContain('resizable wins');
    expect(regionWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  it('warns about nothing when `collapsible` agrees with the region or is left out', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<RegionNav collapsible />);
    view.unmount();
    render(<RegionNav isRegionCollapsible={false} />);
    expect(
      screen.queryByRole('button', {name: 'Collapse sidebar'}),
    ).not.toBeInTheDocument();
    expect(regionWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });
});

/** The development warnings SideNav gave about a region it was given. */
function regionWarnings(warn: {mock: {calls: unknown[][]}}): string[] {
  return warn.mock.calls
    .map((call: unknown[]) => call.map(String).join(' '))
    .filter((text: string) => text.includes("useResizable's output"));
}
