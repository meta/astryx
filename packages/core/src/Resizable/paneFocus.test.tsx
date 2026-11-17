// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paneFocus.test.tsx
 * @input vitest (jsdom), Testing Library, Layout with a LayoutPanel beside a
 *   ResizeHandle, and useResizable's configuration-object form
 * @output Checks that focus inside a collapsing LayoutPanel moves to its
 *   ResizeHandle, and that the collapsed panel is inert
 * @position Integration tests for resizablePane.ts, LayoutPanel.tsx and
 *   ResizeHandle.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {Layout} from '../Layout/Layout';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutPanel} from '../Layout/LayoutPanel';
import {ResizeHandle} from './ResizeHandle';
import {
  useResizable,
  type ResizableRegion,
  type UseResizableSingleConfig,
} from './useResizable';

let propsRegion: ResizableRegion | undefined;

const NO_CONFIG: UseResizableSingleConfig = {};

/**
 * A Layout whose start panel, or end panel when reversed, takes the
 * configuration-object hook's own `props`. Or it takes a hand-built copy: the
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

const pane = () => screen.getByTestId('pane');
const separator = () => screen.getByRole('separator', {name: 'Resize pane'});

beforeEach(() => {
  __resetInteractionModalityForTest();
  propsRegion = undefined;
  localStorage.clear();
});

afterEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe('focus leaves a collapsing pane, and the collapsed pane is inert (component:LayoutPanel AR2)', () => {
  it('moves focus inside a collapsing pane to its ResizeHandle and makes the pane inert and hidden until it opens', () => {
    render(<PropsSplit />);
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
    // Opening moves no focus.
    expect(document.activeElement).toBe(separator());
    expect(pane()).not.toHaveAttribute('inert');
    expect(pane()).not.toHaveAttribute('aria-hidden');
  });

  it('leaves focus where it is for a collapse started from the handle or from outside the pane', () => {
    render(<PropsSplit />);
    separator().focus();
    fireEvent.keyDown(separator(), {key: 'Enter'});
    expect(document.activeElement).toBe(separator());
    fireEvent.keyDown(separator(), {key: 'Enter'});
    const outside = screen.getByRole('button', {name: 'Outside'});
    outside.focus();
    act(() => {
      propsRegion?.collapse();
    });
    expect(document.activeElement).toBe(outside);
    expect(pane()).toHaveAttribute('inert');
  });

  it('keeps a pane that starts collapsed inert from its first commit', () => {
    render(<PropsSplit config={{defaultIsCollapsed: true}} />);
    expect(pane()).toHaveAttribute('inert');
    expect(pane()).toHaveAttribute('aria-hidden', 'true');
  });

  it("moves focus to the adjacent handle and then makes the pane inert for the hook's props and for a hand-built object", () => {
    for (const isHandBuilt of [false, true]) {
      for (const isReversed of [false, true]) {
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
  });

  it("moves focus to the handle and makes the pane inert for a pane at the hook's size beside a handle given its props", () => {
    for (const isReversed of [false, true]) {
      const view = render(<PropsSplit isReversed={isReversed} isWidthPanel />);
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
      expect(pane()).not.toHaveAttribute('inert');
      expect(pane()).not.toHaveAttribute('aria-hidden');
      view.unmount();
    }
  });

  it("keeps a pane at the hook's size, beside a handle given its props, inert from its first commit when the region starts collapsed", () => {
    render(<PropsSplit config={{defaultIsCollapsed: true}} isWidthPanel />);
    expect(pane()).toHaveAttribute('inert');
    expect(pane()).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps an end pane, reversed by its ResizeHandle, inert from its first commit when the region starts collapsed', () => {
    render(<PropsSplit isReversed config={{defaultIsCollapsed: true}} />);
    expect(pane()).toHaveAttribute('inert');
    expect(pane()).toHaveAttribute('aria-hidden', 'true');
    act(() => {
      propsRegion?.expand();
    });
    expect(pane()).not.toHaveAttribute('inert');
  });

  for (const input of ['pointer', 'keyboard'] as const) {
    it(`moves focus to the handle with the ring the last input calls for (${input}; architecture:interaction-modality INV1)`, () => {
      render(<PropsSplit />);
      const inside = screen.getByRole('button', {name: 'Inside'});
      inside.focus();
      if (input === 'pointer') {
        fireEvent.pointerDown(inside);
      } else {
        fireEvent.keyDown(inside, {key: 'Enter'});
      }
      const focus = vi.spyOn(separator(), 'focus');
      act(() => {
        propsRegion?.collapse();
      });
      expect(document.activeElement).toBe(separator());
      expect(focus.mock.calls).toEqual(
        input === 'pointer' ? [[{focusVisible: false}]] : [[]],
      );
    });
  }

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
