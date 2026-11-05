// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file MenuButton.a11y.test.tsx
 * @input MENU_BUTTON_PATTERN bound to the anchored DropdownMenu and MoreMenu triggers
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for component:DropdownMenu AR4 and component:MoreMenu AR1 (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  MENU_BUTTON_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {MENU_BUTTON_KNOWN_FAILURES} from './MenuButton.a11y.known-failures';
import {renderMenuButtonState} from './MenuButton.a11y.renders';
import {
  MENU_BUTTON_BINDING_STATES,
  MENU_BUTTON_EXCLUSIONS,
  type MenuButtonBindingState,
} from './MenuButton.a11y.states';

function trigger(state: MenuButtonBindingState): HTMLElement {
  return screen.getByRole('button', {name: state.label});
}

function relatedFor(
  state: MenuButtonBindingState,
): Readonly<Record<string, Element>> {
  const subject = trigger(state);
  const controls = subject.getAttribute('aria-controls');
  const menu = controls == null ? null : document.getElementById(controls);
  if (menu == null) {
    throw new Error(`menu-button state "${state.id}" has no controlled menu`);
  }
  return {
    menu,
    'first-item': screen.getByRole('menuitem', {
      name: state.firstItem,
      hidden: true,
    }),
    'last-item': screen.getByRole('menuitem', {
      name: state.lastItem,
      hidden: true,
    }),
  };
}

async function checkState(
  state: MenuButtonBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: MENU_BUTTON_PATTERN,
    binding: 'DropdownMenu.trigger',
    state: state.id,
    facts: state.facts,
    knownFailures: MENU_BUTTON_KNOWN_FAILURES,
    mount: async () => {
      render(renderMenuButtonState(state));
      return createJsdomHarness({
        subject: trigger(state),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('DropdownMenu and MoreMenu triggers — menu-button pattern, jsdom lane', () => {
  it.each(
    MENU_BUTTON_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: MENU_BUTTON_PATTERN,
      binding: 'DropdownMenu.trigger',
      state: state.id,
      facts: state.facts,
      knownFailures: MENU_BUTTON_KNOWN_FAILURES,
      render: () => {
        render(renderMenuButtonState(state));
      },
      subject: () => trigger(state),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of MENU_BUTTON_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(MENU_BUTTON_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('menu-button binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = MENU_BUTTON_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps menu-surface, bottom-sheet and header/footer ownership explicit', () => {
    expect(MENU_BUTTON_EXCLUSIONS.map(row => row.id)).toEqual([
      'menu-surface-semantics',
      'bottom-sheet-presentation',
      'header-footer-popover',
    ]);
    for (const exclusion of MENU_BUTTON_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders exactly one trigger and its menu relations for every state', () => {
    for (const state of MENU_BUTTON_BINDING_STATES) {
      render(renderMenuButtonState(state));
      expect(trigger(state), state.id).toBeTruthy();
      expect(Object.keys(relatedFor(state)), state.id).toEqual([
        'menu',
        'first-item',
        'last-item',
      ]);
      cleanup();
    }
  });
});
