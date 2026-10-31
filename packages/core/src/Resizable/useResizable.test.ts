// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizable.test.ts
 * @input Uses vitest, @testing-library/react renderHook, useResizable
 * @output Unit tests for useResizable persistence and collapse state
 * @position Testing; validates useResizable implementation
 *
 * Persistence coverage originated in #4824 by @AKnassa.
 *
 * SYNC: When useResizable changes, update tests to match new behavior
 */

import {createElement, useLayoutEffect, useRef} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {renderToString} from 'react-dom/server';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, renderHook, act, waitFor} from '@testing-library/react';
import {useResizable} from './useResizable';
import type {ResizableProps, UseResizableSingleConfig} from './useResizable';
import {percent, pixel} from './utils';
import type {ResizableSize} from './utils';

const AUTO_SAVE_ID = 'test-panel';
const KEY = `astryx-resizable:${AUTO_SAVE_ID}`;

const BASE_CONFIG = {
  defaultSize: 260,
  minSize: 180,
  maxSize: 480,
  autoSaveId: AUTO_SAVE_ID,
};

type StoredEntry = {size: number; isCollapsed: boolean} | number | null;

function readStored(): StoredEntry {
  return JSON.parse(localStorage.getItem(KEY) ?? 'null') as StoredEntry;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useResizable persistence', () => {
  it('restores a persisted width (legacy plain-number format)', () => {
    localStorage.setItem(KEY, '320');
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );
    expect(result.current.size).toBe(320);
    expect(result.current.isCollapsed).toBe(false);
  });

  it('clamps a persisted width below the minimum', () => {
    localStorage.setItem(KEY, '20');
    const {result} = renderHook(() => useResizable(BASE_CONFIG));
    expect(result.current.size).toBe(180);
  });

  it('ignores a non-finite persisted value', () => {
    // JSON.parse('1e999') yields Infinity, which passes a typeof check.
    localStorage.setItem(KEY, '1e999');
    const {result} = renderHook(() => useResizable(BASE_CONFIG));
    expect(result.current.size).toBe(260);
  });

  it('ignores corrupt storage content', () => {
    localStorage.setItem(KEY, 'not json');
    const {result} = renderHook(() => useResizable(BASE_CONFIG));
    expect(result.current.size).toBe(260);
  });

  it('persists the expanded size together with the collapse flag', () => {
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );
    act(() => result.current.resize(340));
    expect(readStored()).toEqual({size: 340, isCollapsed: false});
  });

  it('keeps the expanded width in storage when collapsing', () => {
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );
    act(() => result.current.resize(300));
    act(() => result.current.collapse());

    expect(result.current.size).toBe(0);
    expect(result.current.isCollapsed).toBe(true);
    expect(readStored()).toEqual({size: 300, isCollapsed: true});
  });

  it('restores the collapsed state and the pre-collapse width on remount', () => {
    localStorage.setItem(KEY, JSON.stringify({size: 300, isCollapsed: true}));
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );

    expect(result.current.isCollapsed).toBe(true);
    expect(result.current.size).toBe(0);

    act(() => result.current.expand());
    expect(result.current.size).toBe(300);
    expect(readStored()).toEqual({size: 300, isCollapsed: false});
  });

  it('treats a legacy persisted 0 as collapsed when collapsible', () => {
    localStorage.setItem(KEY, '0');
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );

    expect(result.current.isCollapsed).toBe(true);
    expect(result.current.size).toBe(0);

    // The legacy entry lost the real width, so expanding falls back to the
    // default rather than to the minimum.
    act(() => result.current.expand());
    expect(result.current.size).toBe(260);
  });

  it('treats a legacy persisted 0 as the default width when not collapsible', () => {
    localStorage.setItem(KEY, '0');
    const {result} = renderHook(() => useResizable(BASE_CONFIG));
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(260);
  });

  it('ignores a persisted collapse flag when not collapsible', () => {
    localStorage.setItem(KEY, JSON.stringify({size: 300, isCollapsed: true}));
    const {result} = renderHook(() => useResizable(BASE_CONFIG));
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(300);
  });

  it('keeps the saved width across repeated collapse calls', () => {
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );
    act(() => result.current.resize(300));
    act(() => result.current.collapse());
    act(() => result.current.collapse());

    expect(readStored()).toEqual({size: 300, isCollapsed: true});
    act(() => result.current.expand());
    expect(result.current.size).toBe(300);
  });

  it('persists the pre-drag width when dragging to collapse', () => {
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true}),
    );
    act(() => result.current.resize(300));
    act(() => result.current.props._onResizeStart());
    act(() => result.current.props._onResizeMove(-270));

    expect(result.current.isCollapsed).toBe(true);
    expect(readStored()).toEqual({size: 300, isCollapsed: true});

    // A continued drag below the threshold must not clobber the saved width.
    act(() => result.current.props._onResizeMove(-275));
    act(() => result.current.expand());
    expect(result.current.size).toBe(300);
  });

  it('does not touch storage without an autoSaveId', () => {
    const {result} = renderHook(() =>
      useResizable({defaultSize: 260, collapsible: true}),
    );
    act(() => result.current.collapse());
    expect(localStorage.length).toBe(0);
  });
});

describe('useResizable uncontrolled collapse', () => {
  it('starts collapsed from defaultIsCollapsed', () => {
    const {result} = renderHook(() =>
      useResizable({
        defaultSize: 260,
        collapsible: true,
        defaultIsCollapsed: true,
      }),
    );
    expect(result.current.isCollapsed).toBe(true);
    expect(result.current.size).toBe(0);

    act(() => result.current.expand());
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(260);
  });

  it('ignores defaultIsCollapsed when not collapsible', () => {
    const {result} = renderHook(() =>
      useResizable({defaultSize: 260, defaultIsCollapsed: true}),
    );
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(260);
  });

  it('lets a persisted collapse flag win over defaultIsCollapsed', () => {
    localStorage.setItem(KEY, JSON.stringify({size: 300, isCollapsed: false}));
    const {result} = renderHook(() =>
      useResizable({
        ...BASE_CONFIG,
        collapsible: true,
        defaultIsCollapsed: true,
      }),
    );
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(300);
  });

  it('keeps defaultIsCollapsed when a legacy width entry says nothing about collapse', () => {
    localStorage.setItem(KEY, '300');
    const {result} = renderHook(() =>
      useResizable({
        ...BASE_CONFIG,
        collapsible: true,
        defaultIsCollapsed: true,
      }),
    );
    expect(result.current.isCollapsed).toBe(true);
    // The width is still restored — it is only collapse that is unknown.
    act(() => result.current.expand());
    expect(result.current.size).toBe(300);
  });

  it('notifies onCollapseChange once per collapse and expand', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({defaultSize: 260, collapsible: true, onCollapseChange}),
    );

    act(() => result.current.collapse());
    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(true);

    onCollapseChange.mockClear();
    act(() => result.current.expand());
    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('collapses on a drag past the threshold', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true, onCollapseChange}),
    );

    act(() => result.current.props._onResizeStart());
    act(() => result.current.props._onResizeMove(-240));

    expect(result.current.isCollapsed).toBe(true);
    expect(onCollapseChange).toHaveBeenCalledWith(true);
  });
});

describe('useResizable controlled collapse', () => {
  it('renders the controlled value rather than its own state', () => {
    const {result, rerender} = renderHook(
      ({isCollapsed}: {isCollapsed: boolean}) =>
        useResizable({defaultSize: 260, collapsible: true, isCollapsed}),
      {initialProps: {isCollapsed: true}},
    );

    expect(result.current.isCollapsed).toBe(true);
    expect(result.current.size).toBe(0);

    rerender({isCollapsed: false});
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(260);
  });

  it('makes collapse() and expand() intents that change nothing locally', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({
        defaultSize: 260,
        collapsible: true,
        isCollapsed: false,
        onCollapseChange,
      }),
    );

    act(() => result.current.collapse());
    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(true);
    // The owner said expanded and never changed its mind.
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(260);
  });

  it('reports a drag past the threshold instead of collapsing itself', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({
        ...BASE_CONFIG,
        collapsible: true,
        isCollapsed: false,
        onCollapseChange,
      }),
    );

    act(() => result.current.props._onResizeStart());
    act(() => result.current.props._onResizeMove(-240));

    expect(onCollapseChange).toHaveBeenCalledWith(true);
    expect(result.current.isCollapsed).toBe(false);
  });

  it('persists the collapse state the owner holds', () => {
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true, isCollapsed: true}),
    );
    expect(result.current.isCollapsed).toBe(true);
    expect(readStored()).toEqual({size: 260, isCollapsed: true});
  });
});

// The fix under test is @AKnassa's, from #5118.
describe('useResizable live collapse state', () => {
  it('reads the current controlled value before consumer layout effects', () => {
    const onCollapseChange = vi.fn();
    const {rerender} = renderHook(
      ({isCollapsed, shouldCollapse}) => {
        const {collapse} = useResizable({
          defaultSize: 260,
          collapsible: true,
          isCollapsed,
          onCollapseChange,
        });
        useLayoutEffect(() => {
          if (shouldCollapse) {
            collapse();
          }
        }, [collapse, shouldCollapse]);
        return collapse;
      },
      {initialProps: {isCollapsed: true, shouldCollapse: false}},
    );

    rerender({isCollapsed: false, shouldCollapse: true});
    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  // ResizeHandle registers its pointermove listener once at pointer down, so
  // a whole gesture runs against the props object captured there. These tests
  // hold that snapshot instead of re-reading result.current between moves —
  // re-reading hands the callbacks a fresh render and hides the bug.
  it('reports one collapse for a drag that stays below the threshold', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true, onCollapseChange}),
    );

    act(() => result.current.props._onResizeStart());
    const gesture = result.current.props;
    for (const delta of [-240, -245, -250, -255, -260]) {
      act(() => gesture._onResizeMove(delta));
    }

    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.isCollapsed).toBe(true);
  });

  it('re-expands mid-gesture when the drag crosses back above the threshold', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true, onCollapseChange}),
    );

    act(() => result.current.props._onResizeStart());
    const gesture = result.current.props;
    act(() => gesture._onResizeMove(-240));
    act(() => gesture._onResizeMove(-20));

    expect(onCollapseChange.mock.calls).toEqual([[true], [false]]);
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(240);
  });

  it('notifies when resize() lifts the panel out of collapse', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true, onCollapseChange}),
    );

    act(() => result.current.collapse());
    onCollapseChange.mockClear();
    act(() => result.current.resize(300));

    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.size).toBe(300);
  });

  it('reports one collapse when collapse() runs twice in a tick', () => {
    const onCollapseChange = vi.fn();
    const {result} = renderHook(() =>
      useResizable({...BASE_CONFIG, collapsible: true, onCollapseChange}),
    );

    act(() => {
      result.current.collapse();
      result.current.collapse();
    });

    expect(onCollapseChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('useResizable identity', () => {
  it('keeps callbacks stable when optional snaps are omitted', () => {
    const {result, rerender} = renderHook(() =>
      useResizable({defaultSize: 200, minSize: 100, maxSize: 400}),
    );
    const first = {
      expand: result.current.expand,
      resize: result.current.resize,
      snaps: result.current.props._snaps,
    };

    rerender();

    expect(result.current.expand).toBe(first.expand);
    expect(result.current.resize).toBe(first.resize);
    expect(result.current.props._snaps).toBe(first.snaps);
  });

  it('settles a pixel-only mount without a ref in one render pass', () => {
    let passes = 0;
    const {result} = renderHook(() => {
      passes += 1;
      return useResizable({defaultSize: 200, minSize: 100, maxSize: 400});
    });

    expect(passes).toBe(1);
    expect(result.current.size).toBe(200);
  });

  it.each([1, 10, 50])(
    'settles %i numeric-only mounts with containerRef in one pass each',
    count => {
      const resizeObserver = vi.fn();
      vi.stubGlobal('ResizeObserver', resizeObserver);
      const element = document.createElement('div');
      let passes = 0;
      let refReads = 0;
      const containerRef = {
        get current() {
          refReads += 1;
          return element;
        },
      };

      function Probe() {
        passes += 1;
        useResizable({
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          containerRef,
        });
        return null;
      }

      const view = render(
        createElement(
          'div',
          null,
          Array.from({length: count}, (_, index) =>
            createElement(Probe, {key: index}),
          ),
        ),
      );

      expect(passes).toBe(count);
      expect(refReads).toBe(0);
      expect(resizeObserver).not.toHaveBeenCalled();
      view.unmount();
    },
  );
});

describe('useResizable percentage configuration (AST-010)', () => {
  // jsdom lays nothing out and ships no ResizeObserver, so the container has
  // to be stubbed for any of this to be observable. These pin the contract;
  // the geometry proof is Chromium, in the PR.
  class StubResizeObserver {
    static instances: StubResizeObserver[] = [];
    callback: ResizeObserverCallback;
    targets: Element[] = [];
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      StubResizeObserver.instances.push(this);
    }
    observe(el: Element) {
      this.targets.push(el);
    }
    unobserve(el: Element) {
      this.targets = this.targets.filter(t => t !== el);
    }
    disconnect() {
      this.targets = [];
    }
    static resizeAll() {
      for (const o of StubResizeObserver.instances) {
        o.callback(
          o.targets.map(
            target =>
              ({
                target,
                contentBoxSize: [
                  {inlineSize: content, blockSize: contentBlock},
                ],
              }) as unknown as ResizeObserverEntry,
          ),
          o,
        );
      }
    }
  }

  let content = 400;
  let contentBlock = 300;

  /** A container whose content box is `content` wide and `contentBlock` tall. */
  const makeContainer = () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    Object.defineProperty(node, 'clientWidth', {get: () => content});
    Object.defineProperty(node, 'clientHeight', {get: () => contentBlock});
    return {current: node};
  };

  beforeEach(() => {
    content = 400;
    contentBlock = 300;
    StubResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    } as unknown as CSSStyleDeclaration);
  });

  describe('FR1 — the basis a percentage is a share of', () => {
    it('keeps the released viewport basis when no container is given', () => {
      // The compatibility path: this is what shipped, and it must not change.
      window.innerWidth = 1000;
      const {result} = renderHook(() => useResizable({defaultSize: '50%'}));
      expect(result.current.size).toBe(500);
    });

    it('uses the container content box when one is given', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: '50%', containerRef}),
      );
      expect(result.current.size).toBe(200);
      expect(result.current.size).not.toBe(window.innerWidth / 2);
    });

    it('resolves the default once — a later basis change does not move it', () => {
      // The line between "configures a size" and "is a responsive mode".
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: '50%', containerRef}),
      );
      expect(result.current.size).toBe(200);
      act(() => {
        content = 800;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(200);
    });
  });

  describe('FR2 — direction selects the axis', () => {
    it('keeps the atomic percentage on the block axis', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: '50%',
          containerRef,
          direction: 'vertical',
        }),
      );
      expect(result.current.size).toBe(150);
    });

    it('measures a structured percentage on the block axis', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: percent(50, {min: pixel(1)}),
          containerRef,
          direction: 'vertical',
        }),
      );
      // 50% of the 300px block size, not of the 400px inline size.
      expect(result.current.size).toBe(150);
    });
  });

  describe('FR4/FR6 — bounds re-resolve and clamp, they never scale', () => {
    it('clamps to a percentage maximum', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: 100, maxSize: '50%', containerRef}),
      );
      act(() => {
        result.current.resize(9999);
      });
      expect(result.current.size).toBe(200);
    });

    it('re-clamps the existing pixel size when the basis shrinks', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: 100, maxSize: '50%', containerRef}),
      );
      act(() => {
        result.current.resize(9999);
      });
      expect(result.current.size).toBe(200);
      act(() => {
        content = 200;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(100);
    });

    it('does not scale a selection back up when the basis grows', () => {
      // Clamping is not a ratio. A size that fits its new maximum stays put.
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: 100, maxSize: '50%', containerRef}),
      );
      act(() => {
        result.current.resize(150);
      });
      act(() => {
        content = 1000;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(150);
    });

    it('a clamp is permanent — growing the basis does not revive the old size', () => {
      // Deriving the clamp for paint alone left the stored choice intact, so a
      // container that shrank and grew again brought the pre-clamp size back.
      // Measured in Chromium at 320px reviving to 560px before the fix.
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: 100, maxSize: '50%', containerRef}),
      );
      act(() => {
        result.current.resize(9999);
      });
      expect(result.current.size).toBe(200);
      act(() => {
        content = 200;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(100);
      act(() => {
        content = 4000;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(100);
    });

    it('does not revive a default clamped at initialization', () => {
      // A default is a pixel selection once its first basis resolves. Keeping
      // it as a nullable "still using the default" sentinel let the raw 321px
      // value come back when a 400px container (200px max) grew to 800px.
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: 321, maxSize: '50%', containerRef}),
      );
      expect(result.current.size).toBe(200);
      act(() => {
        content = 800;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(200);
    });

    it('mixes units across the default and the bounds', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: '50%',
          minSize: 120,
          maxSize: '80px',
          containerRef,
        }),
      );
      // Inverted on purpose: the maximum wins, as the released clamp order has
      // always done.
      expect(result.current.size).toBe(80);
    });

    it('permanently re-clamps a caller-recomputed numeric maxSize', () => {
      // #5934: a table-inbox reading pane derives `maxSize` itself, as
      // `Math.max(paneFloor, surfaceWidth - listFloor)`, from a plain
      // ResizeObserver measurement — no `containerRef`/`maxSize` percentage
      // in play, so this is the caller-recomputed-literal path, not FR1's
      // basis tracking. #5783 (commit 311deefc) made this path re-resolve
      // and clamp the selection every render like any other bound, per FR4;
      // this pins the exact table-inbox pane-widen-then-surface-narrow
      // sequence from the #5934 review so no fix on either side can drop it.
      const {result, rerender} = renderHook(
        ({maxSize}: {maxSize: number}) =>
          useResizable({defaultSize: 400, minSize: 300, maxSize}),
        {initialProps: {maxSize: 1500}},
      );

      // The user drags the separator out to 1066px, well inside the
      // 1500px ceiling the wide surface currently allows.
      act(() => result.current.resize(1066));
      expect(result.current.size).toBe(1066);

      // The surface then narrows (no drag involved), so the derived ceiling
      // drops under the size the user chose.
      rerender({maxSize: 834});

      expect(result.current.size).toBe(834);
      expect(result.current.props._size).toBe(834);
      expect(result.current.props._maxSizePx).toBe(834);

      // Growing the surface again must not revive the pre-clamp selection.
      rerender({maxSize: 1500});

      expect(result.current.size).toBe(834);
      expect(result.current.props._size).toBe(834);
      expect(result.current.props._maxSizePx).toBe(1500);
    });

    it('leaves an in-range user choice alone when maxSize shrinks', () => {
      // The other half of #5934's fix: clamping must not become a second
      // proportional-resize mode. A selection that still fits the new
      // ceiling is the user's answer and stays exactly where they left it.
      const {result, rerender} = renderHook(
        ({maxSize}: {maxSize: number}) =>
          useResizable({defaultSize: 400, minSize: 300, maxSize}),
        {initialProps: {maxSize: 1500}},
      );

      act(() => result.current.resize(700));
      rerender({maxSize: 834});

      expect(result.current.size).toBe(700);
    });
  });

  describe('structured percent sizes', () => {
    const observedTargets = () =>
      StubResizeObserver.instances.flatMap(observer => observer.targets);

    it('accepts Table pixel as a structured static value', () => {
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: pixel(333),
          minSize: pixel(100),
          maxSize: pixel(500),
        }),
      );
      expect(result.current.size).toBe(333);
      expect(result.current.props._minSizePx).toBe(100);
      expect(result.current.props._maxSizePx).toBe(500);
    });

    it('applies the canonical percentage floor', () => {
      content = 500;
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: 0,
          minSize: percent(40, {min: pixel(333)}),
          containerRef,
        }),
      );

      expect(result.current.props._minSizePx).toBe(333);
      expect(result.current.size).toBe(333);
      act(() => {
        content = 1000;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.props._minSizePx).toBe(400);
      expect(result.current.size).toBe(400);
    });

    it('applies the canonical percentage ceiling', () => {
      content = 1000;
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: 500,
          maxSize: percent(10, {max: pixel(400)}),
          containerRef,
        }),
      );

      expect(result.current.props._maxSizePx).toBe(100);
      expect(result.current.size).toBe(100);
      act(() => {
        content = 500;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.props._maxSizePx).toBe(50);
      expect(result.current.size).toBe(50);
    });

    it('resolves a structured default once, then keeps the selected pixels', () => {
      content = 1000;
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: percent(40, {min: pixel(333)}),
          containerRef,
        }),
      );

      expect(result.current.size).toBe(400);
      expect(observedTargets()).not.toContain(containerRef.current);
      act(() => {
        content = 500;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(400);
    });

    it('uses the initial viewport for a structured default without subscribing', () => {
      window.innerWidth = 1000;
      const addEventListener = vi.spyOn(window, 'addEventListener');
      const {result} = renderHook(() =>
        useResizable({defaultSize: percent(40, {min: pixel(333)})}),
      );

      expect(result.current.size).toBe(400);
      expect(
        addEventListener.mock.calls.some(([type]) => type === 'resize'),
      ).toBe(false);
      act(() => {
        window.innerWidth = 500;
        window.dispatchEvent(new Event('resize'));
      });
      expect(result.current.size).toBe(400);
    });

    it('uses the deterministic 1200px server basis', () => {
      const originalWindow = globalThis.window;
      vi.stubGlobal('window', undefined);
      try {
        const html = renderToString(
          createElement(() => {
            const region = useResizable({
              defaultSize: percent(40, {min: pixel(333)}),
            });
            return createElement('output', null, String(region.size));
          }),
        );
        expect(html).toContain('480');
      } finally {
        vi.stubGlobal('window', originalWindow);
      }
    });

    it('hydrates a container default without persisting the temporary basis', async () => {
      content = 500;
      const clientWidth = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockImplementation(() => content);
      const clientHeight = vi
        .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
        .mockImplementation(() => contentBlock);
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const onSizeChange = vi.fn();

      function Probe() {
        const containerRef = useRef<HTMLDivElement>(null);
        const region = useResizable({
          defaultSize: percent(40, {min: pixel(333)}),
          containerRef,
          autoSaveId: 'structured-hydration',
          onSizeChange,
        });
        return createElement(
          'div',
          {ref: containerRef},
          createElement('output', {'data-size': region.size}, region.size),
        );
      }

      const serverHTML = renderToString(createElement(Probe));
      expect(serverHTML).toContain('data-size="480"');
      const container = document.createElement('div');
      container.innerHTML = serverHTML;
      document.body.appendChild(container);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const recoverableErrors: unknown[] = [];
      let root: ReturnType<typeof hydrateRoot>;

      await act(async () => {
        root = hydrateRoot(container, createElement(Probe), {
          onRecoverableError: error => recoverableErrors.push(error),
        });
      });
      await waitFor(() =>
        expect(container.querySelector('output')).toHaveAttribute(
          'data-size',
          '333',
        ),
      );

      expect(recoverableErrors).toEqual([]);
      expect(
        consoleError.mock.calls.filter(call =>
          String(call[0] ?? '')
            .toLowerCase()
            .includes('hydrat'),
        ),
      ).toEqual([]);
      expect(onSizeChange).not.toHaveBeenCalled();
      expect(
        setItem.mock.calls.some(([, value]) => value.includes('"size":480')),
      ).toBe(false);
      expect(
        localStorage.getItem('astryx-resizable:structured-hydration'),
      ).toBe(JSON.stringify({size: 333, isCollapsed: false}));

      await act(async () => root.unmount());
      consoleError.mockRestore();
      setItem.mockRestore();
      clientWidth.mockRestore();
      clientHeight.mockRestore();
      container.remove();
    });

    it('waits for a positive basis and then removes a default-only observer', () => {
      content = 0;
      const containerRef = makeContainer();
      const onSizeChange = vi.fn();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: percent(40, {min: pixel(333)}),
          containerRef,
          autoSaveId: 'structured-zero',
          onSizeChange,
        }),
      );

      expect(result.current.size).toBe(480);
      expect(
        localStorage.getItem('astryx-resizable:structured-zero'),
      ).toBeNull();
      expect(observedTargets()).toContain(containerRef.current);
      act(() => {
        content = 500;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(333);
      expect(localStorage.getItem('astryx-resizable:structured-zero')).toBe(
        JSON.stringify({size: 333, isCollapsed: false}),
      );
      expect(onSizeChange).not.toHaveBeenCalled();
      expect(observedTargets()).not.toContain(containerRef.current);
    });

    it('removes the default observer when resize selects pixels before layout', () => {
      content = 0;
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: percent(40, {min: pixel(333)}),
          containerRef,
        }),
      );

      expect(observedTargets()).toContain(containerRef.current);
      act(() => result.current.resize(275));
      act(() => {
        content = 500;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(275);
      expect(observedTargets()).not.toContain(containerRef.current);
    });

    it('lets a persisted pixel choice win without measuring the unused default', () => {
      localStorage.setItem(
        'astryx-resizable:structured-persisted',
        JSON.stringify({size: 321, isCollapsed: false}),
      );
      content = 1000;
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: percent(40, {min: pixel(333)}),
          containerRef,
          autoSaveId: 'structured-persisted',
        }),
      );

      expect(result.current.size).toBe(321);
      expect(observedTargets()).not.toContain(containerRef.current);
    });

    it('measures the current basis before a newly added bound can clamp', () => {
      content = 500;
      const containerRef = makeContainer();
      const initialProps: {maxSize?: ResizableSize} = {};
      const {result, rerender} = renderHook(
        ({maxSize}: {maxSize?: ResizableSize}) =>
          useResizable({
            defaultSize: percent(40, {min: pixel(333)}),
            maxSize,
            containerRef,
          }),
        {initialProps},
      );

      expect(result.current.size).toBe(333);
      act(() => result.current.resize(450));
      content = 1000;
      rerender({maxSize: percent(50, {max: pixel(800)})});

      expect(result.current.props._maxSizePx).toBe(500);
      expect(result.current.size).toBe(450);
      expect(observedTargets()).toContain(containerRef.current);
    });

    it('matches an atomic percentage default render count and drops both observers', () => {
      content = 1000;
      const atomicRef = makeContainer();
      let atomicPasses = 0;
      const atomic = renderHook(() => {
        atomicPasses += 1;
        return useResizable({defaultSize: '40%', containerRef: atomicRef});
      });
      expect(atomic.result.current.size).toBe(400);
      expect(observedTargets()).not.toContain(atomicRef.current);
      atomic.unmount();

      const structuredRef = makeContainer();
      let structuredPasses = 0;
      const structured = renderHook(() => {
        structuredPasses += 1;
        return useResizable({
          defaultSize: percent(40, {min: pixel(333)}),
          containerRef: structuredRef,
        });
      });
      expect(structured.result.current.size).toBe(400);
      expect(structuredPasses).toBe(atomicPasses);
      expect(observedTargets()).not.toContain(structuredRef.current);
    });

    it('treats an explicitly undefined opposite bound as absent', () => {
      content = 500;
      const containerRef = makeContainer();
      const floor = percent(40, {min: pixel(333), max: undefined});
      const ceiling = percent(80, {min: undefined, max: pixel(350)});

      const minimum = renderHook(() =>
        useResizable({defaultSize: floor, containerRef}),
      );
      expect(minimum.result.current.size).toBe(333);
      minimum.unmount();

      const maximum = renderHook(() =>
        useResizable({defaultSize: ceiling, containerRef}),
      );
      expect(maximum.result.current.size).toBe(350);
      maximum.unmount();
    });

    it.each([
      ['negative', pixel(-1)],
      ['NaN', pixel(Number.NaN)],
      ['Infinity', pixel(Infinity)],
    ])('rejects an invalid direct PixelWidth: %s', (_label, invalid) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {result} = renderHook(() => useResizable({defaultSize: invalid}));
      expect(result.current.size).toBe(250);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to 250'),
      );
      if (_label === 'Infinity') {
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('{"type":"pixel","value":Infinity}'),
        );
      }
      warn.mockRestore();
    });

    it('rejects the removed CSS-like grammar', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: 10,
          minSize: 'max(40%, 333px)' as never,
          maxSize: 'min(400px, 10%)' as never,
        } as never),
      );

      expect(result.current.size).toBe(50);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('minSize: "max(40%, 333px)"'),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('maxSize: "min(400px, 10%)"'),
      );
      warn.mockRestore();
    });

    it('applies role-specific fallbacks to invalid structured bounds', () => {
      const invalid = {
        type: 'percent',
        value: 40,
        min: pixel(100),
        max: pixel(500),
      };
      const minimum = renderHook(() =>
        useResizable({defaultSize: 10, minSize: invalid as never}),
      );
      expect(minimum.result.current.size).toBe(50);
      minimum.unmount();

      const maximum = renderHook(() =>
        useResizable({defaultSize: 10_000, maxSize: invalid as never}),
      );
      expect(maximum.result.current.size).toBe(10_000);
      maximum.unmount();
    });

    it.each([
      [
        'wrong discriminator',
        {type: 'proportional', value: 40, min: pixel(100)},
      ],
      ['missing bound', {type: 'percent', value: 40}],
      [
        'both bounds',
        {type: 'percent', value: 40, min: pixel(100), max: pixel(500)},
      ],
      ['negative percentage', {type: 'percent', value: -1, min: pixel(100)}],
      ['high percentage', {type: 'percent', value: 101, min: pixel(100)}],
      [
        'non-finite percentage',
        {type: 'percent', value: Infinity, min: pixel(100)},
      ],
      [
        'negative pixel helper',
        {type: 'percent', value: 40, min: {type: 'pixel', value: -1}},
      ],
      [
        'non-finite pixel helper',
        {type: 'percent', value: 40, max: {type: 'pixel', value: Infinity}},
      ],
      ['raw numeric bound', {type: 'percent', value: 40, min: 100}],
    ])('rejects an invalid structured value: %s', (_label, invalid) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {result} = renderHook(() =>
        useResizable({defaultSize: invalid as never}),
      );
      expect(result.current.size).toBe(250);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to 250'),
      );
      if (_label === 'non-finite pixel helper') {
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('"max":{"type":"pixel","value":Infinity}'),
        );
      }
      warn.mockRestore();
    });
  });

  describe('FR5 — state, ARIA and paint describe one geometry', () => {
    it('publishes the clamped size and the resolved bounds', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({defaultSize: 100, maxSize: '50%', containerRef}),
      );
      act(() => {
        result.current.resize(9999);
      });
      expect(result.current.props._size).toBe(200);
      expect(result.current.props._maxSizePx).toBe(200);
      expect(result.current.props._size).toBeLessThanOrEqual(
        result.current.props._maxSizePx,
      );
    });
  });

  describe('FR10 — a basis change is not a user interaction', () => {
    it('does not fire onSizeChange when a bound re-clamps the size', () => {
      const containerRef = makeContainer();
      const onSizeChange = vi.fn();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: 100,
          maxSize: '50%',
          containerRef,
          onSizeChange,
        }),
      );
      act(() => {
        result.current.resize(9999);
      });
      onSizeChange.mockClear();
      act(() => {
        content = 200;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.size).toBe(100);
      expect(onSizeChange).not.toHaveBeenCalled();
    });
  });

  describe('FR12/API3 — exact parsing, role-specific fallbacks', () => {
    it.each([
      ['50 px', 'a space'],
      ['50rem', 'another unit'],
      ['120%', 'above 100%'],
      ['-10px', 'negative'],
      ['abc', 'not a size'],
      [-1, 'a negative number'],
      [Number.NaN, 'NaN'],
    ])('falls back to 250px for defaultSize %s (%s)', (invalid, _why) => {
      const {result} = renderHook(() => useResizable({defaultSize: invalid}));
      expect(result.current.size).toBe(250);
    });

    it('falls back to 50px for an invalid minimum', () => {
      const {result} = renderHook(() =>
        useResizable({defaultSize: 10, minSize: 'nope' as never}),
      );
      expect(result.current.size).toBe(50);
    });

    it('falls back to unbounded for an invalid maximum', () => {
      const {result} = renderHook(() =>
        useResizable({defaultSize: 10_000, maxSize: 'nope' as never}),
      );
      expect(result.current.size).toBe(10_000);
    });

    it('accepts an exact px string', () => {
      const {result} = renderHook(() => useResizable({defaultSize: '180px'}));
      expect(result.current.size).toBe(180);
    });

    it('keeps explicit maxSize: Infinity valid without warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {result} = renderHook(() =>
        useResizable({defaultSize: 900, maxSize: Infinity}),
      );
      expect(result.current.size).toBe(900);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('names a non-finite invalid input in its warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {result} = renderHook(() =>
        useResizable({defaultSize: Number.NaN}),
      );
      expect(result.current.size).toBe(250);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('defaultSize: NaN is not a size'),
      );
      warn.mockRestore();
    });
  });

  describe('API6 — resize stays pixels and keeps the last legal size', () => {
    it.each([Number.NaN, Infinity, -5])('ignores resize(%s)', bad => {
      const {result} = renderHook(() => useResizable({defaultSize: 200}));
      act(() => {
        result.current.resize(bad);
      });
      expect(result.current.size).toBe(200);
      expect(Number.isFinite(result.current.size)).toBe(true);
    });
  });

  describe('FR11 — multi-region shares one container and axis', () => {
    it('keeps atomic percentage regions independent', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          containerRef,
          regions: {
            left: {defaultSize: '25%'},
            right: {defaultSize: '50%'},
          },
        }),
      );
      expect(result.current.left.size).toBe(100);
      expect(result.current.right.size).toBe(200);
      act(() => result.current.left.resize(160));
      expect(result.current.left.size).toBe(160);
      expect(result.current.right.size).toBe(200);
    });

    it('gives every structured region the same basis without coupling sizes', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          containerRef,
          regions: {
            left: {defaultSize: percent(25, {min: pixel(80)})},
            right: {defaultSize: percent(50, {max: pixel(300)})},
          },
        }),
      );
      expect(result.current.left.size).toBe(100);
      expect(result.current.right.size).toBe(200);
      act(() => {
        result.current.left.resize(160);
      });
      // Independent: moving one leaves the other alone.
      expect(result.current.left.size).toBe(160);
      expect(result.current.right.size).toBe(200);
    });
  });

  describe('FR9 — persistence stays pixel-only', () => {
    it('restores a persisted pixel size over a percentage default', () => {
      localStorage.setItem(
        'astryx-resizable:pct-persist',
        JSON.stringify({size: 321, isCollapsed: false}),
      );
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: '50%',
          containerRef,
          autoSaveId: 'pct-persist',
        }),
      );
      expect(result.current.size).toBe(321);
      localStorage.clear();
    });

    it('never writes a percentage to storage', () => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({
          defaultSize: '50%',
          containerRef,
          autoSaveId: 'pct-write',
        }),
      );
      act(() => {
        result.current.resize(175);
      });
      const raw = localStorage.getItem('astryx-resizable:pct-write');
      expect(raw).toBe(JSON.stringify({size: 175, isCollapsed: false}));
      localStorage.clear();
    });
  });

  describe('API1 — the basis follows the element the ref points at', () => {
    /** A container of a fixed content width, independent of `content`. */
    const makeSized = (width: number) => {
      const node = document.createElement('div');
      document.body.appendChild(node);
      Object.defineProperty(node, 'clientWidth', {get: () => width});
      Object.defineProperty(node, 'clientHeight', {get: () => 300});
      return node;
    };

    it('reconciles a live ref replacement before flushSync returns', () => {
      const first = makeSized(400);
      const second = makeSized(800);
      const containerRef: {current: HTMLElement | null} = {current: first};
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);

      function Probe() {
        const region = useResizable({
          containerRef,
          defaultSize: 100,
          minSize: '50%',
        });
        return createElement('output', {'data-size': region.size});
      }

      try {
        act(() => {
          // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- test the DOM at the commit boundary before passive effects
          flushSync(() => root.render(createElement(Probe)));
          expect(host.querySelector('output')).toHaveAttribute(
            'data-size',
            '200',
          );
        });

        containerRef.current = second;
        act(() => {
          // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- test the DOM at the commit boundary before passive effects
          flushSync(() => root.render(createElement(Probe)));
          expect(host.querySelector('output')).toHaveAttribute(
            'data-size',
            '400',
          );
        });
      } finally {
        act(() => {
          // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- finish this low-level root without leaving async cleanup
          flushSync(() => root.unmount());
        });
        host.remove();
      }
    });

    it('starts following the current ref when a pixel-only config gains a percentage bound', () => {
      const first = makeSized(400);
      const replacement = makeSized(800);
      const containerRef: {current: HTMLElement | null} = {current: first};
      const initialProps: {maxSize?: ResizableSize} = {};
      const {result, rerender} = renderHook(
        ({maxSize}: {maxSize?: ResizableSize}) =>
          useResizable({containerRef, defaultSize: 350, maxSize}),
        {initialProps},
      );
      const observed = () =>
        StubResizeObserver.instances.flatMap(observer => observer.targets);

      expect(result.current.size).toBe(350);
      expect(observed()).not.toContain(first);

      act(() => {
        containerRef.current = replacement;
      });
      rerender({maxSize: percent(50, {max: pixel(600)})});

      expect(result.current.props._maxSizePx).toBe(400);
      expect(result.current.size).toBe(350);
      expect(observed()).not.toContain(first);
      expect(observed()).toContain(replacement);
    });

    it('does not clamp against an old element when a percentage bound returns', () => {
      const first = makeSized(400);
      const replacement = makeSized(800);
      const containerRef: {current: HTMLElement | null} = {current: first};
      const initialProps: {maxSize?: ResizableSize} = {maxSize: '50%'};
      const {result, rerender} = renderHook(
        ({maxSize}: {maxSize?: ResizableSize}) =>
          useResizable({containerRef, defaultSize: 100, maxSize}),
        {initialProps},
      );
      const observed = () =>
        StubResizeObserver.instances.flatMap(observer => observer.targets);

      expect(result.current.props._maxSizePx).toBe(200);
      rerender({maxSize: undefined});
      act(() => result.current.resize(350));
      expect(result.current.size).toBe(350);
      expect(observed()).not.toContain(first);

      act(() => {
        containerRef.current = replacement;
      });
      rerender({maxSize: percent(50, {max: pixel(600)})});

      expect(result.current.props._maxSizePx).toBe(400);
      expect(result.current.size).toBe(350);
      expect(observed()).not.toContain(first);
      expect(observed()).toContain(replacement);
    });

    it('re-resolves against the replacement when the ref changes element', () => {
      // A ref object is stable across an element swap, so nothing about the
      // hook's inputs changes: the subscription has to follow the ref itself.
      const first = makeSized(398);
      const second = makeSized(798);
      const containerRef: {current: HTMLElement | null} = {current: first};
      const {result, rerender} = renderHook(() =>
        useResizable({containerRef, defaultSize: 150, maxSize: '50%'}),
      );
      expect(result.current.props._maxSizePx).toBe(199);

      act(() => {
        containerRef.current = second;
      });
      rerender();
      expect(result.current.props._maxSizePx).toBe(399);
    });

    it('stops observing the element it left behind', () => {
      const first = makeSized(398);
      const second = makeSized(798);
      const containerRef: {current: HTMLElement | null} = {current: first};
      const {rerender} = renderHook(() =>
        useResizable({containerRef, defaultSize: 150, maxSize: '50%'}),
      );
      const observed = () =>
        StubResizeObserver.instances.flatMap(o => o.targets);
      expect(observed()).toContain(first);

      act(() => {
        containerRef.current = second;
      });
      rerender();
      // The old node is detached by now; leaving it observed is what reported
      // a content box of 0 and zeroed the bounds.
      expect(observed()).not.toContain(first);
      expect(observed()).toContain(second);
    });

    it('treats an unlaid-out container as unmeasured, not as zero', () => {
      // display:none, detached, or not yet laid out: all report 0. Resolving a
      // percentage against 0 makes every bound 0.
      const hidden = makeSized(0);
      const {result} = renderHook(() =>
        useResizable({
          containerRef: {current: hidden},
          defaultSize: 200,
          maxSize: '50%',
        }),
      );
      // The documented temporary 1200px basis, not 0.
      expect(result.current.props._maxSizePx).toBe(600);
      expect(result.current.size).toBe(200);
    });

    it('does not overwrite a saved size from an unmeasured basis', () => {
      localStorage.setItem(
        'astryx-resizable:hidden-mount',
        JSON.stringify({size: 321, isCollapsed: false}),
      );
      const hidden = makeSized(0);
      renderHook(() =>
        useResizable({
          containerRef: {current: hidden},
          defaultSize: 200,
          maxSize: '50%',
          autoSaveId: 'hidden-mount',
        }),
      );
      expect(localStorage.getItem('astryx-resizable:hidden-mount')).toBe(
        JSON.stringify({size: 321, isCollapsed: false}),
      );
      localStorage.clear();
    });

    it('still persists for a pixel-only region that supplies a container', () => {
      // The "is the basis measured yet" guard must not disable persistence for
      // a region that never asks for a percentage in the first place.
      const containerRef = {current: makeSized(400)};
      const {result} = renderHook(() =>
        useResizable({containerRef, defaultSize: 200, autoSaveId: 'px-only'}),
      );
      act(() => {
        result.current.resize(240);
      });
      expect(localStorage.getItem('astryx-resizable:px-only')).toBe(
        JSON.stringify({size: 240, isCollapsed: false}),
      );
      localStorage.clear();
    });
  });

  describe('FR7 — every terminal gesture releases the frozen basis', () => {
    it.each([
      ['_onResizeEnd', (p: ResizableProps) => p._onResizeEnd()],
      ['_onResizeCancel', (p: ResizableProps) => p._onResizeCancel?.()],
    ])('%s lets the bounds re-resolve', (_name, finish) => {
      const containerRef = makeContainer();
      const {result} = renderHook(() =>
        useResizable({containerRef, defaultSize: 200, maxSize: '50%'}),
      );
      expect(result.current.props._maxSizePx).toBe(200);

      act(() => {
        result.current.props._onResizeStart();
      });
      // The container shrinks mid-gesture: the bound must hold until the
      // gesture is over, so the handle does not move away from the pointer.
      act(() => {
        content = 200;
        StubResizeObserver.resizeAll();
      });
      expect(result.current.props._maxSizePx).toBe(200);

      act(() => {
        finish(result.current.props);
      });
      expect(result.current.props._maxSizePx).toBe(100);
      expect(result.current.size).toBe(100);
    });
  });
});

describe('Resizable size source compatibility (AST-010 API3/API4)', () => {
  it('keeps the released broad default type and adds structured values', () => {
    const computed: string = 'runtime-validated-string';
    const configs = [
      {defaultSize: computed},
      {defaultSize: 333},
      {defaultSize: '333px'},
      {defaultSize: '40%'},
      {defaultSize: pixel(333)},
      {defaultSize: percent(40, {min: pixel(333)})},
      {defaultSize: 0, minSize: percent(40, {min: pixel(333)})},
      {defaultSize: 500, maxSize: percent(10, {max: pixel(400)})},
      {defaultSize: 260, minSize: 180, maxSize: 480},
    ] satisfies UseResizableSingleConfig[];
    expect(configs).toHaveLength(9);
  });

  it('rejects unsupported bound strings and removed pixel aliases', () => {
    // @ts-expect-error bound strings are exact px/% only
    const rem: UseResizableSingleConfig = {minSize: '10rem'};
    const cssMath: UseResizableSingleConfig = {
      // @ts-expect-error CSS functions are not part of ResizableSize
      minSize: 'max(40%, 333px)',
    };
    const removedMin: UseResizableSingleConfig = {
      // @ts-expect-error minSizePx was removed in 0.6; use minSize
      minSizePx: 100,
    };
    const removedMax: UseResizableSingleConfig = {
      // @ts-expect-error maxSizePx was removed in 0.6; use maxSize
      maxSizePx: 500,
    };
    function useRemovedDynamicBoundsCompileChecks() {
      const dynamicRemovedMin = {defaultSize: 260, minSizePx: 100};
      // @ts-expect-error removed aliases must not compile through a variable
      useResizable(dynamicRemovedMin);
      const dynamicRemovedMax = {
        regions: {sidebar: {defaultSize: 260, maxSizePx: 500}},
      };
      // @ts-expect-error removed aliases must not compile in dynamic regions
      useResizable(dynamicRemovedMax);
      const unionWithRemovedMin = null as unknown as
        | UseResizableSingleConfig
        | (UseResizableSingleConfig & {minSizePx: number});
      // @ts-expect-error every union member must exclude removed aliases
      useResizable(unionWithRemovedMin);
    }
    expect(useRemovedDynamicBoundsCompileChecks).toBeTypeOf('function');
    expect([rem, cssMath, removedMin, removedMax]).toHaveLength(4);
  });
});

describe('ResizableProps source compatibility (AST-010 API5)', () => {
  it('accepts an object literal written before _direction existed', () => {
    // The type is exported. Every field added to it since has to be optional,
    // or a hand-built object that satisfied the released type stops compiling.
    const prePr: ResizableProps = {
      _size: 200,
      _isCollapsed: false,
      _onResizeStart: () => {},
      _onResizeMove: () => {},
      _onResizeEnd: () => {},
      _minSizePx: 100,
      _maxSizePx: 400,
      _snaps: [],
      _collapsedSize: 40,
      _collapsible: false,
      _isResizableProps: true,
    };
    expect(prePr._direction).toBeUndefined();
    expect(prePr._onResizeCancel).toBeUndefined();
  });
});

describe('useResizable window reads after a commit', () => {
  // React re-reads a useSyncExternalStore snapshot after the commit whenever
  // getSnapshot is a new function, and a window size read after the DOM has
  // changed forces a layout of the whole page. A re-render with unchanged
  // inputs reads the window during render only.
  function readsAfterCommit(direction: 'horizontal' | 'vertical') {
    const reads = {count: 0};
    const width = vi.spyOn(window, 'innerWidth', 'get');
    const height = vi.spyOn(window, 'innerHeight', 'get');
    width.mockImplementation(() => {
      reads.count += 1;
      return 1024;
    });
    height.mockImplementation(() => {
      reads.count += 1;
      return 768;
    });
    function Region({tick}: {tick: number}) {
      useResizable({defaultSize: 240, direction});
      // Runs in the commit, before passive effects: every read counted
      // after it happened after the DOM changed.
      useLayoutEffect(() => {
        reads.count = 0;
      });
      return createElement('div', {'data-tick': tick});
    }
    const {rerender} = render(createElement(Region, {tick: 0}));
    act(() => rerender(createElement(Region, {tick: 1})));
    const count = reads.count;
    width.mockRestore();
    height.mockRestore();
    return count;
  }

  it('reads the window width again only during render, not after the commit', () => {
    expect(readsAfterCommit('horizontal')).toBe(0);
  });

  it('reads the window height again only during render, not after the commit', () => {
    expect(readsAfterCommit('vertical')).toBe(0);
  });
});
