// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.listbox.a11y.test.tsx
 * @input Uses MultiSelector, its part/state inventory, and the shared Listbox contract
 * @output DOM evidence for real multi-select listbox, group, and option parts
 * @position Component-facing binding; API, form, composition, and styling stay local.
 */

import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeAll, describe, expect, it} from 'vitest';
import {
  expectAccessibilitySpec,
  LISTBOX_PATTERN,
} from '@astryxdesign/a11y-spec';
import {MultiSelector} from '../MultiSelector';
import {
  LISTBOX_SCENARIOS,
  listboxParts,
} from '../../Selector/__tests__/Listbox.a11y.states';
import {installListboxDialogStubs} from '../../Selector/__tests__/Listbox.a11y.dom';

installListboxDialogStubs();

// The bottom sheet is loaded on demand (SelectorBottomSheet's lazy import).
// Loading its module is not part of an open, so the file waits for it once
// here, and each scenario's open waits only for the open.
beforeAll(async () => {
  await import('../../BottomSheet/BottomSheet');
});

const scenarios = LISTBOX_SCENARIOS.filter(
  scenario => scenario.component === 'MultiSelector',
);

describe('MultiSelector Listbox semantic binding', () => {
  it.each(scenarios)('$id', async scenario => {
    for (const part of listboxParts(scenario)) {
      await expectAccessibilitySpec({
        spec: LISTBOX_PATTERN,
        binding: `MultiSelector.${part.role}`,
        state: part.state,
        facts: part.facts,
        render: async () => {
          render(
            <div dir={scenario.direction ?? 'ltr'}>
              <MultiSelector
                label="Fruit"
                options={scenario.options}
                value={scenario.values}
                onChange={() => {}}
                hasSearch={scenario.hasSearch}
                hasSelectAll={scenario.hasSelectAll}
                presentation={scenario.presentation}
                isLoading={scenario.isLoading}
                isLabelHidden={scenario.hiddenLabel}
                renderOption={
                  scenario.customContent
                    ? option => <span>{option.label} details</span>
                    : undefined
                }
                isDefaultOpen
              />
            </div>,
          );
          await screen.findByRole('listbox', {hidden: true});
          if (scenario.query != null) {
            await userEvent
              .setup()
              .type(
                screen.getByRole('combobox', {hidden: true}),
                scenario.query,
              );
          }
        },
        subject: () =>
          part.role === 'listbox'
            ? screen.getByRole('listbox', {hidden: true})
            : part.role === 'group'
              ? within(
                  screen.getByRole('listbox', {hidden: true}),
                ).getAllByRole('group', {hidden: true})[
                  scenario.groups.indexOf(part.name ?? '')
                ]
              : within(screen.getByRole('listbox', {hidden: true})).getByRole(
                  'option',
                  {name: part.name, hidden: true},
                ),
        related: () => {
          const listbox = screen.getByRole('listbox', {hidden: true});
          expect(
            within(listbox).getAllByRole('option', {hidden: true}),
          ).toHaveLength(scenario.expectedOptions.length);
          return {
            listbox,
            ...Object.fromEntries(
              scenario.expectedOptions.map(option => [
                `option:${option.value}`,
                within(listbox).getByRole('option', {
                  name: option.name,
                  hidden: true,
                }),
              ]),
            ),
            ...Object.fromEntries(
              scenario.groups.map((name, index) => [
                `group:${name}`,
                within(listbox).getAllByRole('group', {hidden: true})[index],
              ]),
            ),
          };
        },
        cleanup,
      });
    }
  });

  it('keeps the bounded state matrix and select-all states explicit', () => {
    expect(scenarios.map(scenario => scenario.id)).toEqual([
      'multiple-unset',
      'multiple-selected',
      'multiple-disabled-selected',
      'multiple-grouped',
      'multiple-filtered',
      'multiple-custom-rtl',
      'multiple-sheet',
      'multiple-sheet-search',
      'multiple-loading',
      'multiple-select-all-none',
      'multiple-select-all-partial',
      'multiple-select-all-all',
    ]);
  });
});
