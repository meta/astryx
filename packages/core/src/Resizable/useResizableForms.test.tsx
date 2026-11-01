// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizableForms.test.tsx
 * @input vitest (jsdom), Testing Library, the configuration-object
 *   useResizable over the real createResizable, and ResizeHandle
 * @output Checks that the configuration-object form reports size and
 *   isCollapsed in the same commit as onCollapseChange, controlled or not
 *   (component:Resizable FR8: unchanged), and keeps its size and collapse
 *   state across an `<Activity>` that hides and shows it
 * @position Integration tests for useResizable.ts and createResizable.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Activity, useLayoutEffect, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
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
