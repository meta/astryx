// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paneReveal.test.tsx
 * @input vitest (jsdom), Testing Library, Layout with a LayoutPanel beside a
 *   ResizeHandle, the useResizable hook's region, and a recording
 *   stand-in for the animated-layout module's edge reveal
 * @output Checks when a LayoutPanel's pane slides on collapse and open, from
 *   which edge and around which commit
 * @position Integration tests for createResizable.ts, resizablePane.ts,
 *   LayoutPanel.tsx and ResizeHandle.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useLayoutEffect, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import type * as AnimatedLayoutModule from '../motion/animatedLayout';
import {Layout} from '../Layout/Layout';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutPanel} from '../Layout/LayoutPanel';
import {ResizeHandle} from './ResizeHandle';
import {
  useResizable,
  type ResizableRegion,
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

let propsRegion: ResizableRegion | undefined;

const NO_CONFIG: UseResizableSingleConfig = {};

/**
 * A Layout whose start panel, or end panel when reversed, takes the
 * hook's own `props`. Or it takes a hand-built copy: the
 * same fields in an object `useResizable` did not return. Or, with
 * `isWidthPanel`, it renders at the hook's size beside a handle given the
 * props.
 */
function PropsSplit({
  config = NO_CONFIG,
  isReversed = false,
  isHandBuilt = false,
  isWidthPanel = false,
  panelKey = 'panel',
}: {
  config?: UseResizableSingleConfig;
  isReversed?: boolean;
  isHandBuilt?: boolean;
  isWidthPanel?: boolean;
  panelKey?: string;
}) {
  const value = useResizable({defaultSize: 200, collapsible: true, ...config});
  propsRegion = value;
  const panelProps = isHandBuilt ? {...value.props} : value.props;
  const panel = isWidthPanel ? (
    <LayoutPanel key={panelKey} width={value.size} data-testid="pane">
      <button type="button">Inside</button>
    </LayoutPanel>
  ) : (
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

interface ParentCommit {
  parent: boolean;
  hook: boolean;
  /** Whether the pane rendered its open width (200px) in this commit. */
  isOpenWidth: boolean;
}
let commits: ParentCommit[] = [];

/** A parent that owns the collapse state through onCollapseChange. */
function ControlledSplit() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const options = {
    defaultSize: 200,
    collapsible: true,
    isCollapsed,
    onCollapseChange: setIsCollapsed,
  };
  return <ControlledConfig isCollapsed={isCollapsed} options={options} />;
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
  __resetInteractionModalityForTest();
  commits = [];
  reveals.length = 0;
  propsRegion = undefined;
  localStorage.clear();
});

afterEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe("a LayoutPanel's pane slides on collapse and open (component:Resizable FR8, component:LayoutPanel FR7)", () => {
  it('measures a start pane before its collapse commits and plays from its inline-end edge after the pane renders its new width', () => {
    render(<PropsSplit />);
    expect(reveals).toHaveLength(0);
    act(() => {
      propsRegion?.collapse();
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
    render(<PropsSplit isReversed />);
    act(() => {
      propsRegion?.collapse();
    });
    expect(reveals.map(r => r.edge)).toEqual(['inline-start']);
    expect(reveals[0].target()).toBe(pane());
  });

  it('plays every collapse and open: collapse(), expand(), a resize out of collapse, Enter, a double-click and the grow arrow', () => {
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
    const view = render(<PropsSplit config={{isCollapsed: false}} />);
    view.rerender(<PropsSplit config={{isCollapsed: true}} />);
    view.rerender(<PropsSplit config={{isCollapsed: false}} />);
    expect(reveals).toHaveLength(2);
    expect(reveals.every(r => r.animate.mock.calls.length === 1)).toBe(true);
  });

  it('plays the close a lift past the collapse threshold makes, plays nothing for a drag that reopens, and lands a running conceal then', () => {
    render(<PropsSplit />);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 110});
    expect(propsRegion?.isCollapsed).toBe(false);
    expect(reveals).toHaveLength(0);
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 110});
    expect(propsRegion?.isCollapsed).toBe(true);
    expect(reveals).toHaveLength(1);
    expect(reveals[0].animate).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 110});
    fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 320});
    expect(propsRegion?.isCollapsed).toBe(false);
    expect(reveals).toHaveLength(1);
    expect(reveals[0].cancel).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 320});
  });

  it('reads no layout while a drag moves inside the limits', () => {
    render(<PropsSplit />);
    // The role query reads computed styles, so it runs before the spies.
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    const widths = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get');
    const styles = vi.spyOn(window, 'getComputedStyle');
    for (const clientX of [290, 280, 270, 260]) {
      fireEvent.pointerMove(zone, {pointerId: 1, clientX});
    }
    expect(widths).not.toHaveBeenCalled();
    expect(styles).not.toHaveBeenCalled();
    widths.mockRestore();
    styles.mockRestore();
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 260});
  });

  it('holds a pane still sliding shut where it shows, and opens it at the finger once the finger passes the minimum', () => {
    render(<PropsSplit />);
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 110});
    expect(propsRegion?.isCollapsed).toBe(true);
    // At once, while it slides shut: the lift left the edge near 43 px, the
    // 50 px minimum less the band. The finger holds it there, still shut.
    fireEvent.pointerDown(zone, {pointerId: 2, clientX: 110});
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 113});
    expect(propsRegion?.isCollapsed).toBe(true);
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 140});
    // The finger passed the minimum 30 px from where it caught the edge.
    expect(propsRegion?.isCollapsed).toBe(false);
    expect(propsRegion?.size).toBeGreaterThan(65);
    expect(propsRegion?.size).toBeLessThan(80);
    fireEvent.pointerUp(zone, {pointerId: 2, clientX: 140});
  });

  it('opens a held closing pane to its minimum on a lift above the collapse threshold', () => {
    render(<PropsSplit />);
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerDown(zone, {pointerId: 2, clientX: 110});
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 112});
    fireEvent.pointerUp(zone, {pointerId: 2, clientX: 112});
    expect(propsRegion?.isCollapsed).toBe(false);
    expect(propsRegion?.size).toBe(50);
  });

  it('springs the drawn handle back by the next frame when a controlled owner keeps the pane open on a closing lift', async () => {
    const keepsOpen = vi.fn();
    // At its 50 px minimum already, so the lift restores no other size.
    render(
      <PropsSplit
        config={{
          defaultSize: 50,
          isCollapsed: false,
          onCollapseChange: keepsOpen,
        }}
      />,
    );
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    // 190 px toward closed: past the minimum, where the handle bands, and
    // under the collapse threshold.
    fireEvent.pointerMove(zone, {pointerId: 1, clientX: 110});
    const drawn = separator().style.translate;
    expect(drawn).not.toBe('');
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 110});
    expect(keepsOpen).toHaveBeenCalledWith(true);
    expect(propsRegion?.isCollapsed).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(separator().style.translate).not.toBe(drawn);
  });

  it('keeps a held closing pane shut on a lift under the collapse threshold', () => {
    render(<PropsSplit />);
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerDown(zone, {pointerId: 2, clientX: 110});
    // Down to about 13 px, under the 40 px threshold.
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 80});
    fireEvent.pointerUp(zone, {pointerId: 2, clientX: 80});
    expect(propsRegion?.isCollapsed).toBe(true);
  });

  it('catches a pane sliding shut between snap points where it shows, and follows the finger to a snap', () => {
    render(<PropsSplit config={{snaps: [50, 150, 300]}} />);
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 110});
    expect(propsRegion?.isCollapsed).toBe(true);
    // The lift left the edge near 42 px. Mid-slide, the handle shows 133 px
    // further out, so the pane shows about 175 px.
    vi.spyOn(separator(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 133, y: 0, width: 0, height: 0}),
    );
    fireEvent.pointerDown(zone, {pointerId: 2, clientX: 110});
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 120});
    // The edge followed the finger 10 px from where it showed, between snaps.
    expect(propsRegion?.size).toBeGreaterThan(180);
    expect(propsRegion?.size).toBeLessThan(190);
    // Past a snap point, the snaps hold again.
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 245});
    expect(propsRegion?.size).toBe(300);
    fireEvent.pointerUp(zone, {pointerId: 2, clientX: 245});
    expect(propsRegion?.size).toBe(300);
  });

  it('lands a caught pane on the snap nearest its edge when the finger lifts between snaps', () => {
    render(<PropsSplit config={{snaps: [50, 150, 300]}} />);
    const zone = grabZone();
    fireEvent.pointerDown(zone, {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(zone, {pointerId: 1, clientX: 110});
    fireEvent.pointerUp(zone, {pointerId: 1, clientX: 110});
    vi.spyOn(separator(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 133, y: 0, width: 0, height: 0}),
    );
    fireEvent.pointerDown(zone, {pointerId: 2, clientX: 110});
    fireEvent.pointerMove(zone, {pointerId: 2, clientX: 120});
    fireEvent.pointerUp(zone, {pointerId: 2, clientX: 120});
    expect(propsRegion?.isCollapsed).toBe(false);
    expect(propsRegion?.size).toBe(150);
  });

  it('plays nothing for the first render or a resize that neither collapses nor opens', () => {
    render(<PropsSplit config={{defaultIsCollapsed: true}} />);
    act(() => {
      propsRegion?.expand();
    });
    expect(reveals).toHaveLength(1);
    fireEvent.keyDown(separator(), {key: 'ArrowLeft'});
    act(() => {
      propsRegion?.resize(240);
    });
    expect(reveals).toHaveLength(1);
  });

  it('lands a running motion at once when the region goes away', () => {
    const view = render(<PropsSplit />);
    act(() => {
      propsRegion?.collapse();
    });
    view.unmount();
    expect(reveals[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('shows no reveal for a pane the caller renders at the hook size alone', () => {
    function HookOnly() {
      const value = useResizable({defaultSize: 200, collapsible: true});
      propsRegion = value;
      return (
        <div style={{display: 'flex'}}>
          <div data-testid="pane" style={{width: value.size}}>
            <button type="button">Inside</button>
          </div>
          <ResizeHandle resizable={value.props} label="Resize pane" />
        </div>
      );
    }
    render(<HookOnly />);
    act(() => {
      propsRegion?.collapse();
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

  it("slides the pane of a region whose collapse() ran before the hook's first layout effect", () => {
    /** A child's layout effect runs before its parent's. */
    function EarlyCollapse({target}: {target: ResizableRegion}) {
      const [initial] = useState(target);
      useLayoutEffect(() => {
        initial.collapse();
      }, [initial]);
      return null;
    }
    function EarlySplit() {
      const value = useResizable({defaultSize: 200, collapsible: true});
      propsRegion = value;
      return (
        <Layout
          start={
            <>
              <LayoutPanel resizable={value.props} data-testid="pane">
                <button type="button">Inside</button>
              </LayoutPanel>
              <ResizeHandle resizable={value.props} label="Resize pane" />
              <EarlyCollapse target={value} />
            </>
          }
          content={<LayoutContent>Main</LayoutContent>}
        />
      );
    }
    render(<EarlySplit />);
    expect(separator()).toHaveAttribute('aria-valuetext', 'Collapsed');
    reveals.length = 0;
    act(() => {
      propsRegion?.expand();
    });
    expect(reveals).toHaveLength(1);
    expect(reveals[0].target()).toBe(pane());
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
    expect(propsRegion?.isCollapsed).toBe(false);
    fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 100});
    expect(propsRegion?.isCollapsed).toBe(true);
    expect(reveals).toHaveLength(7);
    expect(reveals[6].animate).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 100});
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

  it("measures a controlled change before the DOM changes and reports it in the commit of the parent's state", () => {
    render(<ControlledSplit />);
    act(() => {
      propsRegion?.collapse();
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
      expect(commit.isOpenWidth, JSON.stringify(commits)).toBe(!commit.parent);
    }
  });

  it('hands a LayoutPanel that replaces another to its region', () => {
    const refView = render(<PropsSplit panelKey="first" />);
    refView.rerender(<PropsSplit panelKey="second" />);
    act(() => {
      propsRegion?.collapse();
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

  it("shows no reveal for a LayoutPanel at the hook's size beside a handle given its props, which still holds it collapsed", () => {
    for (const isReversed of [false, true]) {
      reveals.length = 0;
      const view = render(<PropsSplit isReversed={isReversed} isWidthPanel />);
      act(() => {
        propsRegion?.collapse();
      });
      expect(pane()).toHaveAttribute('inert');
      act(() => {
        propsRegion?.expand();
      });
      expect(reveals).toHaveLength(0);
      view.unmount();
    }
  });
});
