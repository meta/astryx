// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.listbox.a11y.test.tsx
 * @input Uses Selector, its explicit part/state inventory, and the Listbox contract
 * @output DOM evidence for real single-select listbox, group, and option parts
 * @position Component-facing binding; keyboard, callbacks, forms, and styles stay local.
 */

import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeAll, describe, expect, it} from 'vitest';
import {
  expectAccessibilitySpec,
  LISTBOX_PATTERN,
} from '@astryxdesign/a11y-spec';
import {Selector} from '../Selector';
import {LISTBOX_SCENARIOS, listboxParts} from './Listbox.a11y.states';
import {installListboxDialogStubs} from './Listbox.a11y.dom';

installListboxDialogStubs();

// The bottom sheet is loaded on demand (SelectorBottomSheet's lazy import).
// Loading its module is not part of an open, so the file waits for it once
// here, and each scenario's open waits only for the open.
beforeAll(async () => {
  await import('../../BottomSheet/BottomSheet');
});

const scenarios = LISTBOX_SCENARIOS.filter(
  scenario => scenario.component === 'Selector',
);

describe('Selector Listbox semantic binding', () => {
  it.each(scenarios)('$id', async scenario => {
    for (const part of listboxParts(scenario)) {
      await expectAccessibilitySpec({
        spec: LISTBOX_PATTERN,
        binding: `Selector.${part.role}`,
        state: part.state,
        facts: part.facts,
        render: async () => {
          render(
            <div dir={scenario.direction ?? 'ltr'}>
              <Selector
                label="Fruit"
                options={scenario.options}
                value={scenario.values[0]}
                onChange={() => {}}
                hasSearch={scenario.hasSearch}
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

  it('keeps the bounded state matrix explicit', () => {
    expect(scenarios.map(scenario => scenario.id)).toEqual([
      'single-unset',
      'single-selected',
      'single-disabled-selected',
      'single-grouped',
      'single-filtered',
      'single-custom-rtl',
      'single-sheet',
      'single-sheet-search',
      'single-loading',
    ]);
  });
});
