// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Menu.a11y.test.tsx
 * @input MENU_PATTERN bound to the open DropdownMenu pointer menu
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for the DropdownMenu menu surface (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {
  MENU_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {MENU_KNOWN_FAILURES} from './Menu.a11y.known-failures';
import {renderMenuState} from './Menu.a11y.renders';
import {
  MENU_BINDING_STATES,
  MENU_EXCLUSIONS,
  type MenuBindingState,
} from './Menu.a11y.states';

function trigger(state: MenuBindingState): HTMLElement {
  return screen.getByRole('button', {name: state.label});
}

function menuFor(state: MenuBindingState): HTMLElement {
  const id = trigger(state).getAttribute('aria-controls');
  const menu = id == null ? null : document.getElementById(id);
  if (menu == null) {
    throw new Error(`menu state "${state.id}" has no controlled menu`);
  }
  return menu;
}

function relatedFor(
  state: MenuBindingState,
): Readonly<Record<string, Element>> {
  const related: Record<string, Element> = {opener: trigger(state)};
  for (const [relation, [role, name]] of Object.entries(state.items)) {
    related[relation] = screen.getByRole(role, {name, hidden: true});
  }
  return related;
}

async function open(state: MenuBindingState): Promise<void> {
  render(renderMenuState(state));
  await userEvent.setup().click(trigger(state));
}

async function checkState(state: MenuBindingState): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: MENU_PATTERN,
    binding: 'DropdownMenu.menu',
    state: state.id,
    facts: state.facts,
    knownFailures: MENU_KNOWN_FAILURES,
    mount: async () => {
      await open(state);
      return createJsdomHarness({
        subject: menuFor(state),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('DropdownMenu pointer menu — menu pattern, jsdom lane', () => {
  it.each(
    MENU_BINDING_STATES.map(state => [state.id, state.summary, state] as const),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: MENU_PATTERN,
      binding: 'DropdownMenu.menu',
      state: state.id,
      facts: state.facts,
      knownFailures: MENU_KNOWN_FAILURES,
      render: async () => {
        await open(state);
      },
      subject: () => menuFor(state),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of MENU_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(MENU_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('menu binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = MENU_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps the opening control, submenus and dialog presentations explicit', () => {
    expect(MENU_EXCLUSIONS.map(row => row.id)).toEqual([
      'opening-control',
      'submenus',
      'bottom-sheet-and-header-footer',
    ]);
    for (const exclusion of MENU_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders the menu and every item relation it names for every state', async () => {
    for (const state of MENU_BINDING_STATES) {
      await open(state);
      expect(menuFor(state).getAttribute('role'), state.id).toBe('menu');
      expect(Object.keys(relatedFor(state)), state.id).toEqual([
        'opener',
        ...Object.keys(state.items),
      ]);
      cleanup();
    }
  });
});
