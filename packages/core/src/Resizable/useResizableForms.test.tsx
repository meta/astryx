// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizableForms.test.tsx
 * @input vitest (jsdom), Testing Library, useResizable in both forms over the
 *   real createResizable, ResizeHandle, a plain element behind a ref, and
 *   InternationalizationProvider
 * @output Checks that both forms report size and isCollapsed in the same
 *   commit as onCollapseChange, controlled or not (component:Resizable FR8:
 *   unchanged), and that a plain element behind the ref drops its listeners
 *   when it unmounts and is named and announced through the message catalog
 *   (spec:AST-107 FR6); and that a configuration-object region keeps its size
 *   and collapse state across an `<Activity>` that hides and shows it
 * @position Integration tests for useResizable.ts and createResizable.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {
  Activity,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {ResizeHandle} from './ResizeHandle';
import {useResizable, type UseResizableResult} from './useResizable';

interface Commit {
  reported: boolean;
  isCollapsed: boolean;
  size: number;
}

let commits: Commit[] = [];
let region: Pick<
  UseResizableResult,
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

function RefSplit({isControlled}: {isControlled: boolean}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [reported, setReported] = useState(false);
  const value = useResizable(handleRef, {
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
      <ResizeHandle ref={handleRef} label="Resize pane" />
    </>
  );
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
    ['useResizable(handleRef, options)', RefSplit],
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

function PlainSplit({hasHandle, label}: {hasHandle: boolean; label?: string}) {
  const handleRef = useRef<HTMLDivElement>(null);
  region = useResizable(handleRef, {
    defaultSize: 200,
    collapsible: true,
    ...(label === undefined ? {} : {label}),
  });
  return hasHandle ? (
    <div ref={handleRef} data-testid="plain-handle" />
  ) : (
    <span />
  );
}

function French({children}: {children: ReactNode}) {
  return (
    <InternationalizationProvider
      locale="fr"
      overrides={{
        fr: {
          '@astryx.resizable.handle.label': 'Poignée',
          '@astryx.resizable.collapsed': 'Réduit',
        },
      }}>
      {children}
    </InternationalizationProvider>
  );
}

describe('a plain element behind the ref (spec:AST-107 FR6)', () => {
  it('drops its listeners and attributes when the element unmounts, and the region still answers its controls', () => {
    const view = render(<PlainSplit hasHandle />);
    const handle = screen.getByTestId('plain-handle');
    expect(handle).toHaveAttribute('role', 'separator');
    fireEvent.keyDown(handle, {key: 'ArrowRight'});
    expect(region?.size).toBe(210);

    view.rerender(<PlainSplit hasHandle={false} />);
    // The element is gone: input that still reaches it changes nothing.
    fireEvent.keyDown(handle, {key: 'ArrowRight'});
    fireEvent.pointerDown(handle, {pointerId: 1, clientX: 300});
    fireEvent.pointerMove(handle, {pointerId: 1, clientX: 340});
    fireEvent.pointerUp(handle, {pointerId: 1, clientX: 340});
    expect(region?.size).toBe(210);
    expect(handle).not.toHaveAttribute('role');
    expect(handle).not.toHaveAttribute('aria-valuenow');

    act(() => {
      region?.collapse();
    });
    expect(region?.isCollapsed).toBe(true);
    act(() => {
      region?.expand();
    });
    expect(region?.size).toBe(210);

    // A new element picks up where the region stands.
    view.rerender(<PlainSplit hasHandle />);
    expect(screen.getByTestId('plain-handle')).toHaveAttribute(
      'aria-valuenow',
      '210',
    );
  });

  it('names and announces it through the message catalog', () => {
    render(
      <French>
        <PlainSplit hasHandle />
      </French>,
    );
    const handle = screen.getByTestId('plain-handle');
    expect(handle).toHaveAttribute('aria-label', 'Poignée');
    act(() => {
      region?.collapse();
    });
    expect(handle).toHaveAttribute('aria-valuetext', 'Réduit');
  });

  it('keeps the label its caller gives over the catalog', () => {
    render(
      <French>
        <PlainSplit hasHandle label="Sidebar width" />
      </French>,
    );
    expect(screen.getByTestId('plain-handle')).toHaveAttribute(
      'aria-label',
      'Sidebar width',
    );
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
