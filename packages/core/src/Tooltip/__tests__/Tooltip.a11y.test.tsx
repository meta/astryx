// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Tooltip.a11y.test.tsx
 * @input TOOLTIP_PATTERN bound to Tooltip's and useTooltip's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for Tooltip and useTooltip (the Chromium spec covers the rest)
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  TOOLTIP_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {renderTooltipState} from './Tooltip.a11y.renders';
import {
  TOOLTIP_BINDING_STATES,
  TOOLTIP_EXCLUSIONS,
  type TooltipBindingState,
} from './Tooltip.a11y.states';

function triggerFor(state: TooltipBindingState): HTMLElement {
  return state.triggerRole == null
    ? screen.getByText(state.triggerText, {exact: true})
    : screen.getByRole(state.triggerRole, {name: state.triggerText});
}

function relatedFor(
  state: TooltipBindingState,
): Readonly<Record<string, Element>> {
  const neighbours = {
    before: screen.getByRole('button', {name: 'Before the trigger'}),
    after: screen.getByRole('button', {name: 'After the trigger'}),
  };
  if (state.facts.isBeforeFirstShow === true) {
    const id = triggerFor(state).getAttribute('aria-describedby') ?? '';
    return {
      description: document.getElementById(id) ?? document.body,
      ...neighbours,
    };
  }
  return {
    // The tooltip stays in the page while hidden once it has shown; it is
    // found with hidden elements included so the DOM rows can read it.
    tooltip: screen.getByRole('tooltip', {hidden: true}),
    ...neighbours,
  };
}

/**
 * Renders the state. A state after the first show hovers the trigger until
 * the tooltip shows, then moves the pointer away and lets it hide, so the
 * tooltip is in the page and hidden.
 */
async function renderState(state: TooltipBindingState): Promise<void> {
  render(renderTooltipState(state));
  if (state.facts.isBeforeFirstShow === true) {
    return;
  }
  const trigger = triggerFor(state);
  fireEvent.mouseEnter(trigger);
  await waitFor(() => {
    expect(screen.getByRole('tooltip', {hidden: true})).toBeTruthy();
  });
  fireEvent.mouseLeave(trigger);
  await waitFor(() => {
    expect(
      screen.getByRole('tooltip', {hidden: true}).matches(':popover-open'),
    ).toBe(false);
  });
}

async function checkState(state: TooltipBindingState): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TOOLTIP_PATTERN,
    binding: 'Tooltip',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      await renderState(state);
      return createJsdomHarness({
        subject: triggerFor(state),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('Tooltip — tooltip pattern, jsdom lane', () => {
  it.each(
    TOOLTIP_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: TOOLTIP_PATTERN,
      binding: 'Tooltip',
      state: state.id,
      facts: state.facts,
      render: async () => {
        await renderState(state);
      },
      subject: () => triggerFor(state),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it(
    'runs the DOM layer and reports the browser-owned outcomes as unrun',
    {timeout: 120_000},
    async () => {
      const results: BindingResult[] = [];
      for (const state of TOOLTIP_BINDING_STATES) {
        results.push(await checkState(state));
      }
      const report = summarize(TOOLTIP_PATTERN, results);
      expect(report.counts.pass).toBeGreaterThan(0);
      expect(report.unrunLayers).toEqual([
        'accessibility-tree',
        'real-browser',
      ]);
      expect(report.counts.unexpectedPass).toBe(0);
    },
  );
});

describe('tooltip binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = TOOLTIP_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps focus-trigger opt-outs, touch, controlled visibility, interactive hover content, host compositions and paint explicit', () => {
    expect(TOOLTIP_EXCLUSIONS.map(row => row.id)).toEqual([
      'focus-trigger',
      'touch-trigger',
      'controlled-and-disabled',
      'interactive-hover-content',
      'host-compositions',
      'placement-and-paint',
    ]);
    for (const exclusion of TOOLTIP_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders the trigger, one tooltip once it has shown and none before, and both page buttons for every state', async () => {
    for (const state of TOOLTIP_BINDING_STATES) {
      await renderState(state);
      expect(triggerFor(state), state.id).toBeTruthy();
      const isBeforeFirstShow = state.facts.isBeforeFirstShow === true;
      expect(
        screen.queryAllByRole('tooltip', {hidden: true}),
        state.id,
      ).toHaveLength(isBeforeFirstShow ? 0 : 1);
      expect(Object.keys(relatedFor(state))).toEqual([
        isBeforeFirstShow ? 'description' : 'tooltip',
        'before',
        'after',
      ]);
      cleanup();
    }
  });
});
