// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ResizeHandle.a11y.renders.tsx
 * @input One ResizeHandle binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the ResizeHandle binding
 */

import {useRef, type ReactElement} from 'react';
import {ResizeHandle} from '../ResizeHandle';
import {useResizable} from '../useResizable';
import type {ResizeHandleBindingState} from './ResizeHandle.a11y.states';

/** The id the binding gives the pane the bare handle controls. */
export const BARE_PANE_ID = 'a11y-splitter-pane';

function BareSplitter({state}: {state: ResizeHandleBindingState}) {
  const direction = state.direction ?? 'horizontal';
  const containerRef = useRef<HTMLDivElement>(null);
  const region = useResizable({
    containerRef: state.inContainer ? containerRef : undefined,
    defaultSize: state.facts.valueNow,
    minSize: state.facts.valueMin,
    maxSize: state.maxSize === null ? undefined : (state.facts.valueMax ?? 400),
    direction,
    collapsible: state.facts.collapsible,
    collapsedSize: state.collapsedSize,
    defaultIsCollapsed: state.startsCollapsed,
    snaps: state.snaps ? [...state.snaps] : undefined,
  });
  const isHorizontal = direction === 'horizontal';
  const pane = (
    <div
      id={BARE_PANE_ID}
      style={{
        ...(isHorizontal ? {width: region.size} : {height: region.size}),
        background: 'var(--astryx-bg-surface, #f2f2f2)',
        padding: 12,
      }}>
      Details
    </div>
  );
  const handle = (
    <ResizeHandle
      resizable={region.props}
      label={state.label}
      direction={direction}
      isReversed={state.isReversed}
      isDisabled={state.disabled}
      aria-controls={state.withoutControls ? undefined : BARE_PANE_ID}
    />
  );
  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        width: 600,
        height: 320,
      }}>
      {state.isReversed ? handle : pane}
      {state.isReversed ? pane : handle}
      <div style={{flex: 1, padding: 12}}>Main content</div>
    </div>
  );
}

export function renderResizeHandleState(
  state: ResizeHandleBindingState,
): ReactElement {
  return (
    <div dir={state.rtl ? 'rtl' : 'ltr'} style={{padding: 16}}>
      <BareSplitter state={state} />
    </div>
  );
}
