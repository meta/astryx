// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Selector's first binding to the reusable Combobox semantic contract. */

import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeAll, describe, expect, it} from 'vitest';
import {
  COMBOBOX_PATTERN,
  expectAccessibilitySpec,
} from '@astryxdesign/a11y-spec';
import {Selector} from '../Selector';
import {installListboxDialogStubs} from './Listbox.a11y.dom';
import {
  SELECTOR_COMBOBOX_EXCLUSIONS,
  SELECTOR_COMBOBOX_SCENARIOS,
  type SelectorComboboxScenario,
} from './Combobox.a11y.states';
import {SELECTOR_COMBOBOX_KNOWN_FAILURES} from './Combobox.a11y.known-failures';

installListboxDialogStubs();

// The bottom sheet is loaded on demand (SelectorBottomSheet's lazy import).
// Loading its module is not part of an open, so the file waits for it once
// here, and each scenario's open waits only for the open.
beforeAll(async () => {
  await import('../../BottomSheet/BottomSheet');
});

const hidden = {hidden: true} as const;

function subjectFor(scenario: SelectorComboboxScenario): HTMLElement {
  return screen.getByRole('combobox', {...hidden, name: scenario.facts.name});
}

describe('Selector Combobox semantic binding', () => {
  it.each(SELECTOR_COMBOBOX_SCENARIOS)('$id', async scenario => {
    await expectAccessibilitySpec({
      spec: COMBOBOX_PATTERN,
      binding: scenario.binding,
      state: scenario.id,
      facts: scenario.facts,
      knownFailures: SELECTOR_COMBOBOX_KNOWN_FAILURES,
      render: async () => {
        render(
          <Selector
            label="Fruit"
            options={[
              {value: 'apple', label: 'Apple'},
              {value: 'banana', label: 'Banana'},
            ]}
            onChange={() => {}}
            {...scenario.props}
          />,
        );
        if (!scenario.open) {
          return;
        }
        const user = userEvent.setup();
        await user.click(
          scenario.props.hasSearch
            ? screen.getByRole('button', {name: /Fruit/})
            : screen.getByRole('combobox', {name: 'Fruit'}),
        );
        await screen.findByRole('listbox', hidden);
        if (scenario.highlightFirst) {
          const search = subjectFor(scenario);
          await waitFor(() => expect(search).toHaveFocus());
          await user.keyboard('{ArrowDown}');
        }
      },
      subject: () => subjectFor(scenario),
      related: () => {
        const related: Record<string, Element> = {};
        if (!scenario.facts.popupVisible) {
          return related;
        }
        const listbox = screen.getByRole('listbox', hidden);
        if (scenario.binding === 'Selector.trigger') {
          // AR1: the trigger names the popup kind its presentation renders.
          expect(subjectFor(scenario)).toHaveAttribute(
            'aria-haspopup',
            scenario.facts.popupRole,
          );
        }
        related.popup =
          scenario.facts.popupRole === 'dialog'
            ? screen.getByRole('dialog', {...hidden, name: 'Fruit'})
            : listbox;
        if (scenario.facts.activeDescendant) {
          expect(
            subjectFor(scenario).getAttribute('aria-activedescendant'),
          ).not.toBeNull();
          related['active-descendant'] = within(listbox).getByRole('option', {
            ...hidden,
            name: 'Apple',
          });
        }
        return related;
      },
      cleanup,
    });
  });

  it('keeps the bounded first-adopter state matrix explicit', () => {
    expect(
      SELECTOR_COMBOBOX_SCENARIOS.map(scenario => [
        scenario.binding,
        scenario.id,
      ]),
    ).toEqual([
      ['Selector.trigger', 'closed'],
      ['Selector.trigger', 'open'],
      ['Selector.trigger', 'read-only'],
      ['Selector.trigger', 'busy'],
      ['Selector.trigger', 'sheet-open'],
      ['Selector.search', 'search-active'],
    ]);
    expect(SELECTOR_COMBOBOX_EXCLUSIONS).toHaveLength(5);
  });

  it('pins every known failure to exactly one bound state', () => {
    expect(SELECTOR_COMBOBOX_KNOWN_FAILURES).toHaveLength(1);
    for (const record of SELECTOR_COMBOBOX_KNOWN_FAILURES) {
      expect(
        SELECTOR_COMBOBOX_SCENARIOS.filter(
          scenario =>
            scenario.binding === record.binding && scenario.id === record.state,
        ),
      ).toHaveLength(1);
    }
  });
});
