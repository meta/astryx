// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paneReveal.test.tsx
 * @input vitest (jsdom), Testing Library, Layout with a LayoutPanel beside a
 *   ResizeHandle, useResizable in both forms, and a recording stand-in for
 *   the animated-layout module's edge reveal
 * @output Checks when a LayoutPanel's pane slides on collapse and open, from
 *   which edge, and around which commit (measured before the DOM changes,
 *   played once the pane renders its new size, a controlled change included,
 *   which the hook reports in the commit of the parent's state) (component:Resizable FR8,
 *   component:LayoutPanel FR7, spec:AST-105 FR9); and that focus inside a
 *   collapsing pane moves to its ResizeHandle and the collapsed pane is
 *   inert and hidden from assistive technology, in both forms
 *   (component:LayoutPanel AR2)
 * @position Integration tests for createResizable.ts, resizablePane.ts,
 *   LayoutPanel.tsx and ResizeHandle.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type * as AnimatedLayoutModule from '../motion/animatedLayout';
import {Layout} from '../Layout/Layout';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutPanel} from '../Layout/LayoutPanel';
import type {CreateResizableOptions} from './createResizable';
import {ResizeHandle} from './ResizeHandle';
import {
  useResizable,
  type ResizableRegion,
  type UseResizableResult,
  type UseResizableSingleConfig,
} from './useResizable';

interface RecordedReveal {
  edge: string;
  target: () => Element | null;
  /** The pane's inline style when each call ran. */
  measuredStyle: string | null;
  animatedStyle: string | null;
  measureBefore: ReturnType<typeof vi.fn>;
  animate: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

const reveals: RecordedReveal[] = [];

vi.mock('../motion/animatedLayout', async importOriginal => {
  const original = await importOriginal<typeof AnimatedLayoutModule>();
  return {
    ...original,
    reportLayoutEdge: vi.fn(
      (
        _handle: unknown,
        target: (() => Element | null) | {current: Element | null},
        {edge}: {edge: string},
      ) => {
        const resolve = () =>
          typeof target === 'function' ? target() : target.current;
        const recorded: RecordedReveal = {
          edge,
          target: resolve,
          measuredStyle: null,
          animatedStyle: null,
          measureBefore: vi.fn(() => {
            recorded.measuredStyle = resolve()?.getAttribute('style') ?? null;
          }),
          animate: vi.fn(() => {
            recorded.animatedStyle = resolve()?.getAttribute('style') ?? null;
          }),
          cancel: vi.fn(),
        };
        reveals.push(recorded);
        return {
          measureBefore: recorded.measureBefore,
          animate: recorded.animate,
          cancel: recorded.cancel,
        };
      },
    ),
  };
});

let region: UseResizableResult | undefined;

const NO_OPTIONS: CreateResizableOptions = {};

/** A Layout whose start (or, reversed, end) panel a ref-form region sizes. */
function RefSplit({
  options = NO_OPTIONS,
  isReversed = false,
  panelKey = 'panel',
  children,
}: {
  options?: CreateResizableOptions;
  isReversed?: boolean;
  panelKey?: string;
  children?: ReactNode;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  region = useResizable(handleRef, {
    defaultSize: 200,
    collapsible: true,
    ...options,
  });
  const panel = (
    <LayoutPanel key={panelKey} width={region.size} data-testid="pane">
      <button type="button">Inside</button>
      {children}
    </LayoutPanel>
  );
  const handle = (
    <ResizeHandle ref={handleRef} isReversed={isReversed} label="Resize pane" />
  );
  return (
    <>
      <button type="button">Outside</button>
      <Layout
        start={
          isReversed ? undefined : (
            <>
              {panel}
              {handle}
            </>
          )
        }
        content={<LayoutContent>Main</LayoutContent>}
        end={
          isReversed ? (
            <>
              {handle}
              {panel}
            </>
          ) : undefined
        }
      />
    </>
  );
}

let propsRegion: ResizableRegion | undefined;

const NO_CONFIG: UseResizableSingleConfig = {};

/**
 * A Layout whose start (or, reversed, end) panel takes the configuration-
 * object hook's own `props`, or a hand-built copy of them: the same fields in
 * an object `useResizable` did not return.
 */
function PropsSplit({
  config = NO_CONFIG,
  isReversed = false,
  isHandBuilt = false,
  panelKey = 'panel',
}: {
  config?: UseResizableSingleConfig;
  isReversed?: boolean;
  isHandBuilt?: boolean;
  panelKey?: string;
}) {
  const value = useResizable({defaultSize: 200, collapsible: true, ...config});
  propsRegion = value;
  const panelProps = isHandBuilt ? {...value.props} : value.props;
  const panel = (
    <LayoutPanel key={panelKey} resizable={panelProps} data-testid="pane">
      <button type="button">Inside</button>
    </LayoutPanel>
  );
  const handle = (
    <ResizeHandle
      resizable={value.props}
      isReversed={isReversed}
      label="Resize pane"
    />
  );
  return (
    <Layout
      start={
        isReversed ? undefined : (
          <>
            {panel}
            {handle}
          </>
        )
      }
      content={<LayoutContent>Main</LayoutContent>}
      end={
        isReversed ? (
          <>
            {handle}
            {panel}
          </>
        ) : undefined
      }
    />
  );
}

interface ParentCommit {
  parent: boolean;
  hook: boolean;
  /** Whether the pane rendered its open width (200px) in this commit. */
  isOpenWidth: boolean;
}
let commits: ParentCommit[] = [];

/** A parent that owns the collapse state through onCollapseChange. */
function ControlledSplit({form}: {form: 'ref' | 'config'}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const options = {
    defaultSize: 200,
    collapsible: true,
    isCollapsed,
    onCollapseChange: setIsCollapsed,
  };
  return form === 'ref' ? (
    <ControlledRef isCollapsed={isCollapsed} options={options} />
  ) : (
    <ControlledConfig isCollapsed={isCollapsed} options={options} />
  );
}

function useRecordParent(parent: boolean, hook: boolean) {
  useLayoutEffect(() => {
    commits.push({
      parent,
      hook,
      isOpenWidth: (
        screen.getByTestId('pane').getAttribute('style') ?? ''
      ).includes('200px'),
    });
  });
}

function ControlledRef({
  isCollapsed,
  options,
}: {
  isCollapsed: boolean;
  options: CreateResizableOptions;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  region = useResizable(handleRef, options);
  useRecordParent(isCollapsed, region.isCollapsed);
  return (
    <Layout
      start={
        <>
          <LayoutPanel width={region.size} data-testid="pane" />
          <ResizeHandle ref={handleRef} label="Resize pane" />
        </>
      }
      content={<LayoutContent>Main</LayoutContent>}
    />
  );
}

function ControlledConfig({
  isCollapsed,
  options,
}: {
  isCollapsed: boolean;
  options: UseResizableSingleConfig;
}) {
  const value = useResizable(options);
  propsRegion = value;
  useRecordParent(isCollapsed, value.isCollapsed);
  return (
    <Layout
      start={
        <>
          <LayoutPanel resizable={value.props} data-testid="pane" />
          <ResizeHandle resizable={value.props} label="Resize pane" />
        </>
      }
      content={<LayoutContent>Main</LayoutContent>}
    />
  );
}

const pane = () => screen.getByTestId('pane');
const separator = () => screen.getByRole('separator', {name: 'Resize pane'});
/** The grab zone, which takes the pointer. */
const grabZone = () => separator().firstElementChild as HTMLElement;

beforeEach(() => {
  commits = [];
  reveals.length = 0;
  region = undefined;
  propsRegion = undefined;
  localStorage.clear();
});

afterEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe("a LayoutPanel's pane slides on collapse and open (component:Resizable FR8, component:LayoutPanel FR7)", () => {
  it('measures a start pane before its collapse commits and plays from its inline-end edge after the pane renders its new width', () => {
    render(<RefSplit />);
    expect(reveals).toHaveLength(0);
    act(() => {
      region?.collapse();
    });
    expect(reveals).toHaveLength(1);
    const [reveal] = reveals;
    expect(reveal.edge).toBe('inline-end');
    expect(reveal.target()).toBe(pane());
    expect(reveal.measureBefore).toHaveBeenCalledTimes(1);
    expect(reveal.animate).toHaveBeenCalledTimes(1);
    // Measured at the old width, played at the new one.
    expect(reveal.measuredStyle).toContain('200px');
    expect(reveal.animatedStyle).not.toContain('200px');
    expect(reveal.measureBefore.mock.invocationCallOrder[0]).toBeLessThan(
      reveal.animate.mock.invocationCallOrder[0],
    );
  });

  it('plays an end pane, beside a reversed handle, from its inline-start edge', () => {
    render(<RefSplit isReversed />);
    act(() => {
      region?.collapse();
    });
    expect(reveals.map(r => r.edge)).toEqual(['inline-start']);
    expect(reveals[0].target()).toBe(pane());
  });

  it('plays every collapse and open: collapse(), expand(), a resize out of collapse, Enter, a double-click and the grow arrow', () => {
    render(<RefSplit />);
    act(() => {
      region?.collapse();
    });
    act(() => {
      region?.expand();
    });
    act(() => {
      region?.collapse();
    });
    act(() => {
      region?.resize(260);
    });
    fireEvent.keyDown(separator(), {key: 'Enter'});
    fireEvent.keyDown(separator(), {key: 'Enter'});
    fireEvent.doubleClick(separator());
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(reveals).toHaveLength(8);
    for (const reveal of reveals) {
      expect(reveal.edge).toBe('inline-end');
      expect(reveal.measureBefore).toHaveBeenCalledTimes(1);
      expect(reveal.animate).toHaveBeenCalledTimes(1);
    }
  });

  it('plays a controlled isCollapsed change', () => {
    const view = render(<RefSplit options={{isCollapsed: false}} />);
    view.rerender(<RefSplit options={{isCollapsed: true}} />);
    view.rerender(<RefSplit options={{isCollapsed: false}} />);
    expect(reveals).toHaveLength(2);
    expect(reveals.every(r => r.animate.mock.calls.length === 1)).toBe(true);
  });

  it('plays a drag that crosses the collapse threshold, plays nothing for a drag that reopens, and lands a running conceal then', () => {
    render(<RefSplit />);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 110});
    expect(region?.isCollapsed).toBe(true);
    expect(reveals).toHaveLength(1);
    expect(reveals[0].animate).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 320});
    expect(region?.isCollapsed).toBe(false);
    expect(reveals).toHaveLength(1);
    expect(reveals[0].cancel).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 320});
  });

  it('plays nothing for the first render or a resize that neither collapses nor opens', () => {
    render(<RefSplit options={{defaultIsCollapsed: true}} />);
    act(() => {
      region?.expand();
    });
    expect(reveals).toHaveLength(1);
    fireEvent.keyDown(separator(), {key: 'ArrowLeft'});
    act(() => {
      region?.resize(240);
    });
    expect(reveals).toHaveLength(1);
  });

  it('lands a running motion at once when the region goes away', () => {
    const view = render(<RefSplit />);
    act(() => {
      region?.collapse();
    });
    view.unmount();
    expect(reveals[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('shows no reveal for a pane the caller renders at the hook size alone', () => {
    function HookOnly() {
      const handleRef = useRef<HTMLDivElement>(null);
      region = useResizable(handleRef, {defaultSize: 200, collapsible: true});
      return (
        <div style={{display: 'flex'}}>
          <div data-testid="pane" style={{width: region.size}}>
            <button type="button">Inside</button>
          </div>
          <ResizeHandle ref={handleRef} label="Resize pane" />
        </div>
      );
    }
    render(<HookOnly />);
    act(() => {
      region?.collapse();
    });
    expect(reveals).toHaveLength(0);
    expect(pane()).not.toHaveAttribute('inert');
  });

  it("slides a pane that takes the hook's own props, from the edge facing its handle, measured before the collapse commits", () => {
    for (const isReversed of [false, true]) {
      reveals.length = 0;
      const view = render(<PropsSplit isReversed={isReversed} />);
      fireEvent.keyDown(separator(), {key: 'Enter'});
      expect(separator()).toHaveAttribute('aria-valuetext', 'Collapsed');
      expect(reveals).toHaveLength(1);
      const [reveal] = reveals;
      expect(reveal.edge).toBe(isReversed ? 'inline-start' : 'inline-end');
      expect(reveal.target()).toBe(pane());
      expect(reveal.measuredStyle).toContain('200px');
      expect(reveal.animatedStyle).not.toContain('200px');
      expect(reveal.animate).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(separator(), {key: 'Enter'});
      expect(reveals).toHaveLength(2);
      expect(reveals[1].measuredStyle).not.toContain('200px');
      expect(reveals[1].animatedStyle).toContain('200px');
      view.unmount();
    }
  });

  it("plays every collapse and open for the hook's props, and nothing for a drag that reopens", () => {
    render(<PropsSplit />);
    act(() => {
      propsRegion?.collapse();
    });
    act(() => {
      propsRegion?.expand();
    });
    act(() => {
      propsRegion?.collapse();
    });
    act(() => {
      propsRegion?.resize(260);
    });
    fireEvent.doubleClick(separator());
    fireEvent.keyDown(separator(), {key: 'ArrowRight'});
    expect(reveals).toHaveLength(6);
    for (const reveal of reveals) {
      expect(reveal.edge).toBe('inline-end');
      expect(reveal.measureBefore).toHaveBeenCalledTimes(1);
      expect(reveal.animate).toHaveBeenCalledTimes(1);
    }
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 100});
    expect(propsRegion?.isCollapsed).toBe(true);
    expect(reveals).toHaveLength(7);
    expect(reveals[6].animate).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 340});
    expect(propsRegion?.isCollapsed).toBe(false);
    expect(reveals).toHaveLength(7);
    expect(reveals[6].cancel).toHaveBeenCalled();
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 340});
  });

  it("plays a controlled isCollapsed change for the hook's props", () => {
    const view = render(<PropsSplit config={{isCollapsed: false}} />);
    view.rerender(<PropsSplit config={{isCollapsed: true}} />);
    expect(pane().getAttribute('style') ?? '').not.toContain('200px');
    view.rerender(<PropsSplit config={{isCollapsed: false}} />);
    expect(reveals).toHaveLength(2);
    expect(reveals.every(r => r.animate.mock.calls.length === 1)).toBe(true);
  });

  it('lands the motion of a pane that takes the hook props when the region goes away', () => {
    const view = render(<PropsSplit />);
    act(() => {
      propsRegion?.collapse();
    });
    view.unmount();
    expect(reveals[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('shows no reveal for a hand-built ResizableProps object', () => {
    render(<PropsSplit isHandBuilt />);
    act(() => {
      propsRegion?.collapse();
    });
    expect(pane().getAttribute('style') ?? '').not.toContain('200px');
    act(() => {
      propsRegion?.expand();
    });
    expect(pane().getAttribute('style') ?? '').toContain('200px');
    expect(reveals).toHaveLength(0);
  });

  for (const form of ['ref', 'config'] as const) {
    it(`measures a controlled change before the DOM changes and reports it in the commit of the parent's state (${form} form)`, () => {
      render(<ControlledSplit form={form} />);
      act(() => {
        (form === 'ref' ? region : propsRegion)?.collapse();
      });
      expect(reveals).toHaveLength(1);
      expect(reveals[0].measuredStyle).toContain('200px');
      expect(reveals[0].animatedStyle).not.toContain('200px');
      expect(reveals[0].animate).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(separator(), {key: 'Enter'});
      expect(reveals).toHaveLength(2);
      expect(reveals[1].measuredStyle).not.toContain('200px');
      expect(reveals[1].animatedStyle).toContain('200px');
      for (const commit of commits) {
        expect(commit.hook, JSON.stringify(commits)).toBe(commit.parent);
        expect(commit.isOpenWidth, JSON.stringify(commits)).toBe(
          !commit.parent,
        );
      }
    });
  }

  it('hands a LayoutPanel that replaces another to its region through its callback ref', () => {
    const refView = render(<RefSplit panelKey="first" />);
    refView.rerender(<RefSplit panelKey="second" />);
    act(() => {
      region?.collapse();
    });
    expect(reveals).toHaveLength(1);
    expect(reveals[0].target()).toBe(pane());
    refView.unmount();

    reveals.length = 0;
    const propsView = render(<PropsSplit panelKey="first" />);
    propsView.rerender(<PropsSplit panelKey="second" />);
    act(() => {
      propsRegion?.collapse();
    });
    expect(reveals).toHaveLength(1);
    expect(reveals[0].target()).toBe(pane());
  });
});

describe('focus leaves a collapsing pane, and the collapsed pane is inert (component:LayoutPanel AR2)', () => {
  it('moves focus inside a collapsing pane to its ResizeHandle and makes the pane inert and hidden until it opens', () => {
    render(<RefSplit />);
    screen.getByRole('button', {name: 'Inside'}).focus();
    act(() => {
      region?.collapse();
    });
    expect(document.activeElement).toBe(separator());
    expect(pane()).toHaveAttribute('inert');
    expect(pane()).toHaveAttribute('aria-hidden', 'true');
    act(() => {
      region?.expand();
    });
    // Opening moves no focus.
    expect(document.activeElement).toBe(separator());
    expect(pane()).not.toHaveAttribute('inert');
    expect(pane()).not.toHaveAttribute('aria-hidden');
  });

  it('leaves focus where it is for a collapse started from the handle or from outside the pane', () => {
    render(<RefSplit />);
    separator().focus();
    fireEvent.keyDown(separator(), {key: 'Enter'});
    expect(document.activeElement).toBe(separator());
    fireEvent.keyDown(separator(), {key: 'Enter'});
    const outside = screen.getByRole('button', {name: 'Outside'});
    outside.focus();
    act(() => {
      region?.collapse();
    });
    expect(document.activeElement).toBe(outside);
    expect(pane()).toHaveAttribute('inert');
  });

  it('keeps a pane that starts collapsed inert from its first commit', () => {
    render(<RefSplit options={{defaultIsCollapsed: true}} />);
    expect(pane()).toHaveAttribute('inert');
    expect(pane()).toHaveAttribute('aria-hidden', 'true');
  });

  it("moves focus to the adjacent handle and then makes the pane inert for the hook's props, which slide, and for a hand-built object, which does not", () => {
    for (const isHandBuilt of [false, true]) {
      for (const isReversed of [false, true]) {
        reveals.length = 0;
        const view = render(
          <PropsSplit isReversed={isReversed} isHandBuilt={isHandBuilt} />,
        );
        screen.getByRole('button', {name: 'Inside'}).focus();
        act(() => {
          propsRegion?.collapse();
        });
        expect(document.activeElement).toBe(separator());
        expect(pane()).toHaveAttribute('inert');
        expect(pane()).toHaveAttribute('aria-hidden', 'true');
        act(() => {
          propsRegion?.expand();
        });
        expect(document.activeElement).toBe(separator());
        expect(pane()).not.toHaveAttribute('inert');
        expect(pane()).not.toHaveAttribute('aria-hidden');
        expect(reveals).toHaveLength(isHandBuilt ? 0 : 2);
        view.unmount();
      }
    }
  });

  it("keeps a pane that takes the hook's props, or a hand-built object, inert from its first commit when the region starts collapsed", () => {
    for (const isHandBuilt of [false, true]) {
      const view = render(
        <PropsSplit
          config={{defaultIsCollapsed: true}}
          isHandBuilt={isHandBuilt}
        />,
      );
      expect(pane()).toHaveAttribute('inert');
      expect(pane()).toHaveAttribute('aria-hidden', 'true');
      view.unmount();
    }
    expect(reveals).toHaveLength(0);
  });

  it('never makes a LayoutPanel without a resize controller inert', () => {
    render(
      <Layout
        start={
          <LayoutPanel width={0} data-testid="pane">
            <button type="button">Inside</button>
          </LayoutPanel>
        }
        content={<LayoutContent>Main</LayoutContent>}
      />,
    );
    expect(pane()).not.toHaveAttribute('inert');
    expect(pane()).not.toHaveAttribute('aria-hidden');
  });
});
