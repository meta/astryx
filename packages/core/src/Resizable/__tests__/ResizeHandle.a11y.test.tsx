// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file ResizeHandle.a11y.test.tsx
 * @input WINDOW_SPLITTER_PATTERN bound to ResizeHandle's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for component:Resizable AR1 (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  WINDOW_SPLITTER_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {RESIZE_HANDLE_KNOWN_FAILURES} from './ResizeHandle.a11y.known-failures';
import {
  BARE_PANE_ID,
  renderResizeHandleState,
} from './ResizeHandle.a11y.renders';
import {
  RESIZE_HANDLE_BINDING_STATES,
  RESIZE_HANDLE_EXCLUSIONS,
  type ResizeHandleBindingState,
} from './ResizeHandle.a11y.states';

function separator(state: ResizeHandleBindingState): HTMLElement {
  return screen.getByRole('separator', {name: state.label});
}

function pane(): HTMLElement {
  const element = document.getElementById(BARE_PANE_ID);
  if (element == null) {
    throw new Error('the bare pane is not rendered');
  }
  return element;
}

async function checkState(
  state: ResizeHandleBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: WINDOW_SPLITTER_PATTERN,
    binding: 'ResizeHandle',
    state: state.id,
    facts: state.facts,
    knownFailures: RESIZE_HANDLE_KNOWN_FAILURES,
    mount: async () => {
      render(renderResizeHandleState(state));
      return createJsdomHarness({
        subject: separator(state),
        related: {pane: pane()},
      });
    },
    unmount: cleanup,
  });
}

describe('ResizeHandle — window splitter pattern, jsdom lane', () => {
  it.each(
    RESIZE_HANDLE_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: WINDOW_SPLITTER_PATTERN,
      binding: 'ResizeHandle',
      state: state.id,
      facts: state.facts,
      knownFailures: RESIZE_HANDLE_KNOWN_FAILURES,
      render: () => {
        render(renderResizeHandleState(state));
      },
      subject: () => separator(state),
      related: () => ({pane: pane()}),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of RESIZE_HANDLE_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(WINDOW_SPLITTER_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('ResizeHandle binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = RESIZE_HANDLE_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps pointer and pane-cycling ownership explicit', () => {
    expect(RESIZE_HANDLE_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'sidenav-binding',
      'pointer-drag-model',
      'pane-cycling',
    ]);
    for (const exclusion of RESIZE_HANDLE_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders exactly one named separator and its pane for every state', () => {
    for (const state of RESIZE_HANDLE_BINDING_STATES) {
      render(renderResizeHandleState(state));
      expect(separator(state), state.id).toBeTruthy();
      expect(pane(), state.id).toBeTruthy();
      cleanup();
    }
  });
});
