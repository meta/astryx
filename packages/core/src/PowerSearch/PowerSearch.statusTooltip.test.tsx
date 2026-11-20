// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearch.statusTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, PowerSearch
 * @output Unit tests for the on-field status icon under statusVariant
 *   "tooltip": the info-tip button reveals the message in the popover
 *   presentation's field and on the sheet trigger's field
 * @position Testing; validates PowerSearch.tsx with useInputStatusIcon
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PowerSearch} from './PowerSearch';
import type {PowerSearchConfig} from './types';

// A field in the sheet presentation loads the sheet module on mount, and the
// load runs past the test that started it. The file loads it before any test
// runs, so no load is still running when the test environment is torn down.
await import('./PowerSearchBottomSheet');

const h = {hidden: true} as const;
const MESSAGE = 'Add at least one filter';

const config: PowerSearchConfig = {
  name: 'Issues',
  fields: [
    {
      key: 'author',
      label: 'Author',
      operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
    },
  ],
};

function Field(props: {
  presentation: 'popover' | 'bottom-sheet';
  statusVariant?: 'attached' | 'detached' | 'tooltip';
}) {
  return (
    <PowerSearch
      config={config}
      filters={[]}
      onChange={() => {}}
      label="Search issues"
      presentation={props.presentation}
      status={{type: 'error', message: MESSAGE}}
      statusVariant={props.statusVariant ?? 'tooltip'}
    />
  );
}

// jsdom implements no popover API; the tooltip opens through showPopover().
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
});

describe('PowerSearch status icon', () => {
  for (const presentation of ['popover', 'bottom-sheet'] as const) {
    for (const statusVariant of ['attached', 'detached'] as const) {
      it(`describes the ${presentation} field's control by the message box for statusVariant="${statusVariant}"`, async () => {
        render(
          <Field presentation={presentation} statusVariant={statusVariant} />,
        );
        const control =
          presentation === 'popover'
            ? screen.getByRole('combobox')
            : screen.getByRole('button', {name: /Search issues/});
        const describedBy = (
          control.getAttribute('aria-describedby') ?? ''
        ).split(' ');
        const box = describedBy
          .map(id => document.getElementById(id))
          .find(el => el?.textContent?.includes(MESSAGE));
        expect(box).toBeDefined();
        expect(box).not.toHaveAttribute('role', 'tooltip');
      });
    }
  }

  it('draws one info-tip whose tooltip holds the message in the popover presentation', async () => {
    const {container} = render(<Field presentation="popover" />);
    expect(
      container.querySelector('.astryx-field-status'),
    ).not.toBeInTheDocument();
    expect(
      await screen.findAllByRole('button', {name: 'Error details'}),
    ).toHaveLength(1);
    const tooltip = await screen.findByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    expect(
      screen.getByRole('combobox').getAttribute('aria-describedby'),
    ).toContain(tooltip.id);
  });

  it('moves focus to the input when the plain attached icon is clicked', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <Field presentation="popover" statusVariant="attached" />,
    );
    const icon = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(
        '.astryx-input-status-icon',
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await user.click(icon);
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('draws the info-tip on the sheet trigger field, and a click on it opens no sheet', async () => {
    const user = userEvent.setup();
    render(<Field presentation="bottom-sheet" />);
    const trigger = screen.getByRole('button', {name: /Search issues/});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    const button = await screen.findByRole('button', {name: 'Error details'});
    const tooltip = await screen.findByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    const describedBy = (trigger.getAttribute('aria-describedby') ?? '').split(
      ' ',
    );
    expect(describedBy).toContain(tooltip.id);
    for (const id of describedBy) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    await user.click(button);
    expect(button).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the flow when the plain attached icon on the sheet trigger field is tapped', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <Field presentation="bottom-sheet" statusVariant="attached" />,
    );
    const trigger = screen.getByRole('button', {name: /Search issues/});
    const icon = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(
        '.astryx-input-status-icon',
      );
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(trigger.contains(icon)).toBe(false);
    await user.click(icon);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
