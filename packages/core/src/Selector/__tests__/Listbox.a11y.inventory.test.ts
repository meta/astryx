// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Listbox.a11y.inventory.test.ts
 * @input Uses the locked Listbox migration matrix and checklist
 * @output Coverage-boundary and part-inventory regression checks
 * @position Binding metadata proof, separate from runtime conformance results.
 */

import {describe, expect, it} from 'vitest';
import {LISTBOX_PATTERN, unansweredDimensions} from '@astryxdesign/a11y-spec';
import {LISTBOX_KNOWN_FAILURES} from './Listbox.a11y.known-failures';
import {
  LISTBOX_SCENARIOS,
  LISTBOX_EXCLUSIONS,
  listboxParts,
} from './Listbox.a11y.states';

describe('Listbox migration inventory', () => {
  it('accounts for every checklist dimension without claiming other evidence layers', () => {
    expect(unansweredDimensions(LISTBOX_PATTERN)).toEqual([]);
    expect(LISTBOX_EXCLUSIONS).toHaveLength(5);
  });

  it('binds 21 scenarios and all six real semantic parts', () => {
    expect(LISTBOX_SCENARIOS).toHaveLength(21);
    const parts = LISTBOX_SCENARIOS.flatMap(scenario =>
      listboxParts(scenario).map(part => ({
        binding: `${scenario.component}.${part.role}`,
        state: part.state,
      })),
    );
    expect(parts).toHaveLength(89);
    expect(new Set(parts.map(part => part.state)).size).toBe(89);
    expect([...new Set(parts.map(part => part.binding))].sort()).toEqual([
      'MultiSelector.group',
      'MultiSelector.listbox',
      'MultiSelector.option',
      'Selector.group',
      'Selector.listbox',
      'Selector.option',
    ]);
  });

  it('pins every remaining known failure to one exact inventory part', () => {
    const parts = LISTBOX_SCENARIOS.flatMap(scenario =>
      listboxParts(scenario).map(part => ({
        binding: `${scenario.component}.${part.role}`,
        state: part.state,
      })),
    );

    expect(LISTBOX_KNOWN_FAILURES).toHaveLength(0);
    for (const record of LISTBOX_KNOWN_FAILURES) {
      expect(
        parts.filter(
          part =>
            part.binding === record.binding && part.state === record.state,
        ),
      ).toHaveLength(1);
    }
  });
});
