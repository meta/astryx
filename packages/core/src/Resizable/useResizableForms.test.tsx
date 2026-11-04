// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizableForms.test.tsx
 * @input vitest (jsdom), Testing Library, the configuration-object
 *   useResizable over the real createResizable, and ResizeHandle
 * @output Checks that the configuration-object form reports size and
 *   isCollapsed in the same commit as onCollapseChange, controlled or not
 *   (component:Resizable FR8: unchanged), keeps its size and collapse
 *   state across an `<Activity>` that hides and shows it, and applies
 *   collapse(), expand() and resize() called before its first layout effect
 *   or while hidden, reporting them at once, as before
 * @position Integration tests for useResizable.ts and createResizable.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Activity, useLayoutEffect, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ResizeHandle} from './ResizeHandle';
import {useResizable, type ResizableRegion} from './useResizable';

interface Commit {
  reported: boolean;
  isCollapsed: boolean;
  size: number;
}

let commits: Commit[] = [];
let region: Pick<
  ResizableRegion,
  'collapse' | 'expand' | 'isCollapsed' | 'size'
> | null = null;

/** Records what every commit shows: the parent's state and the hook's. */
function useRecord(reported: boolean, isCollapsed: boolean, size: number) {
  useLayoutEffect(() => {
    commits.push({reported, isCollapsed, size});
  });
}

function Pane({size}: {size: number}) {
  return <div data-testid="pane" style={{width: size}} />;
}

function ConfigSplit({isControlled}: {isControlled: boolean}) {
  const [reported, setReported] = useState(false);
  const value = useResizable({
    defaultSize: 200,
    collapsible: true,
    ...(isControlled ? {isCollapsed: reported} : {}),
    onCollapseChange: setReported,
  });
  region = value;
  useRecord(reported, value.isCollapsed, value.size);
  return (
    <>
      <Pane size={value.size} />
      <ResizeHandle resizable={value.props} label="Resize pane" />
    </>
  );
}

const separator = () => screen.getByRole('separator', {name: 'Resize pane'});
const grabZone = () => separator().firstElementChild as HTMLElement;

/** Every commit shows the parent's reported state and the hook's together. */
function expectInStep(): void {
  expect(commits.length).toBeGreaterThan(0);
  for (const commit of commits) {
    expect(commit, JSON.stringify(commits)).toMatchObject({
      isCollapsed: commit.reported,
    });
    if (commit.isCollapsed) {
      expect(commit.size).toBe(0);
    } else {
      expect(commit.size).toBeGreaterThan(0);
    }
  }
}

beforeEach(() => {
  commits = [];
  region = null;
  localStorage.clear();
});

afterEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe('size and isCollapsed land in the same commit as onCollapseChange (component:Resizable FR8)', () => {
  for (const [form, Split] of [
    ['useResizable(config)', ConfigSplit],
  ] as const) {
    for (const isControlled of [true, false]) {
      it(`${form}, ${isControlled ? 'controlled' : 'uncontrolled'}: collapse(), Enter, expand(), a double-click and a drag past the threshold`, () => {
        render(<Split isControlled={isControlled} />);
        act(() => {
          region?.collapse();
        });
        expect(region?.isCollapsed).toBe(true);
        expectInStep();
        fireEvent.keyDown(separator(), {key: 'Enter'});
        expect(region?.isCollapsed).toBe(false);
        expectInStep();
        fireEvent.keyDown(separator(), {key: 'Enter'});
        expect(region?.isCollapsed).toBe(true);
        act(() => {
          region?.expand();
        });
        expect(region?.isCollapsed).toBe(false);
        fireEvent.doubleClick(separator());
        expect(region?.isCollapsed).toBe(true);
        fireEvent.doubleClick(separator());
        expect(region?.isCollapsed).toBe(false);
        expectInStep();
        fireEvent.pointerDown(grabZone(), {pointerId: 1, clientX: 300});
        fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 110});
        expect(region?.isCollapsed).toBe(true);
        fireEvent.pointerMove(grabZone(), {pointerId: 1, clientX: 320});
        fireEvent.pointerUp(grabZone(), {pointerId: 1, clientX: 320});
        expect(region?.isCollapsed).toBe(false);
        expectInStep();
      });
    }
  }
});

describe('collapse(), expand() and resize() on a configuration-object region apply whenever they are called (behavior unchanged)', () => {
  it("apply when called before the hook's first layout effect, and report at once", () => {
    const onCollapseChange = vi.fn();
    const onSizeChange = vi.fn();
    let held: ResizableRegion | undefined;
    /** A child's layout effect runs before its parent's. */
    function Early({target}: {target: ResizableRegion}) {
      const [initial] = useState(target);
      useLayoutEffect(() => {
        initial.resize(300);
        initial.collapse();
      }, [initial]);
      return null;
    }
    function Split() {
      const value = useResizable({
        defaultSize: 200,
        collapsible: true,
        onCollapseChange,
        onSizeChange,
      });
      held = value;
      return (
        <>
          <ResizeHandle resizable={value.props} label="Resize pane" />
          <Early target={value} />
        </>
      );
    }
    render(<Split />);
    expect(onSizeChange.mock.calls).toEqual([[300], [0]]);
    expect(onCollapseChange.mock.calls).toEqual([[true]]);
    expect(held?.isCollapsed).toBe(true);
    expect(held?.size).toBe(0);
    act(() => {
      held?.expand();
    });
    expect(held?.size).toBe(300);
    expect(separator()).toHaveAttribute('aria-valuenow', '300');
  });

  it('apply while an <Activity> hides the region, report at once, and show after the reveal', () => {
    const onCollapseChange = vi.fn();
    let held: ResizableRegion | undefined;
    function Panel() {
      held = useResizable({
        defaultSize: 250,
        collapsible: true,
        onCollapseChange,
      });
      return <ResizeHandle resizable={held.props} label="Resize pane" />;
    }
    function Host({isVisible}: {isVisible: boolean}) {
      return (
        <Activity mode={isVisible ? 'visible' : 'hidden'}>
          <Panel />
        </Activity>
      );
    }
    const view = render(<Host isVisible />);
    const visibleRegion = held;
    view.rerender(<Host isVisible={false} />);
    act(() => {
      visibleRegion?.collapse();
    });
    expect(onCollapseChange.mock.calls).toEqual([[true]]);
    view.rerender(<Host isVisible />);
    expect(held?.isCollapsed).toBe(true);
    view.rerender(<Host isVisible={false} />);
    act(() => {
      visibleRegion?.resize(320);
    });
    expect(onCollapseChange.mock.calls).toEqual([[true], [false]]);
    view.rerender(<Host isVisible />);
    expect(held?.isCollapsed).toBe(false);
    expect(held?.size).toBe(320);
    expect(separator()).toHaveAttribute('aria-valuenow', '320');
  });
});

describe('a configuration-object region under an Activity', () => {
  it('keeps its size and collapse state across a hide and a show', () => {
    let held: ReturnType<typeof useResizableRegion> | undefined;
    function useResizableRegion() {
      return useResizable({defaultSize: 250, collapsible: true});
    }
    function Panel() {
      held = useResizableRegion();
      return <ResizeHandle resizable={held.props} />;
    }
    function Host() {
      const [isVisible, setIsVisible] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsVisible(!isVisible)}>
            visibility
          </button>
          <Activity mode={isVisible ? 'visible' : 'hidden'}>
            <Panel />
          </Activity>
        </>
      );
    }
    const toggle = () => {
      act(() => {
        screen.getByRole('button', {name: 'visibility'}).click();
      });
    };
    render(<Host />);
    act(() => {
      held?.resize(300);
    });
    toggle();
    toggle();
    expect(held?.size).toBe(300);
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuenow',
      '300',
    );
    act(() => {
      held?.collapse();
    });
    toggle();
    toggle();
    expect(held?.isCollapsed).toBe(true);
    act(() => {
      held?.expand();
    });
    expect(held?.size).toBe(300);
  });
});
