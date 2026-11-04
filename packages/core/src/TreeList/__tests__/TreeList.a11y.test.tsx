// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file TreeList.a11y.test.tsx
 * @input TREE_VIEW_PATTERN bound to TreeList's representative states
 * @output jsdom-lane proof of the DOM expectations and an honest "unrun" report for the browser layers
 * @position Binding test for component:TreeList AR1 (the Chromium spec covers the rest)
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  TREE_VIEW_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {renderTreeListState} from './TreeList.a11y.renders';
import {
  TREE_LIST_BINDING_STATES,
  TREE_LIST_EXCLUSIONS,
  type TreeListBindingState,
} from './TreeList.a11y.states';

function row(id: string): Element {
  const element = document.querySelector(
    `[role="treeitem"][data-tree-id="${id}"]`,
  );
  if (element == null) {
    throw new Error(`no treeitem row "${id}"`);
  }
  return element;
}

function relatedFor(
  state: TreeListBindingState,
): Readonly<Record<string, Element>> {
  const related: Record<string, Element> = {
    tree: screen.getByRole('tree'),
    before: screen.getByRole('button', {name: 'Before the tree'}),
    after: screen.getByRole('button', {name: 'After the tree'}),
  };
  for (const [name, id] of Object.entries(state.relations)) {
    const element = document.querySelector(
      `[role="treeitem"][data-tree-id="${id}"]`,
    );
    if (element != null) {
      related[name] = element;
    }
  }
  const group = row(state.subject).querySelector('[role="group"]');
  if (group != null) {
    related.group = group;
  }
  return related;
}

async function checkState(state: TreeListBindingState): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TREE_VIEW_PATTERN,
    binding: 'TreeList',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(renderTreeListState(state));
      return createJsdomHarness({
        subject: row(state.subject),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('TreeList — tree-view pattern, jsdom lane', () => {
  it.each(
    TREE_LIST_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: TREE_VIEW_PATTERN,
      binding: 'TreeList',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(renderTreeListState(state));
      },
      subject: () => row(state.subject),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of TREE_LIST_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(TREE_VIEW_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('TreeList tree-view binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = TREE_LIST_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps row-name composition and selection ownership explicit', () => {
    expect(TREE_LIST_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'row-name-composition',
      'selection-keyboard',
    ]);
    for (const exclusion of TREE_LIST_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders the subject row, the tree, and the first/last rows for every state', () => {
    for (const state of TREE_LIST_BINDING_STATES) {
      render(renderTreeListState(state));
      expect(row(state.subject), state.id).toBeTruthy();
      const related = relatedFor(state);
      expect(Object.keys(related), state.id).toEqual(
        expect.arrayContaining(['tree', 'before', 'after', 'first', 'last']),
      );
      cleanup();
    }
  });
});
