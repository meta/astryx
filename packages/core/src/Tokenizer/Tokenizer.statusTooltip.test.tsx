// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokenizer.statusTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Tokenizer
 * @output Unit tests for the on-field status icon: the `tooltip` variant's
 *   info-tip button reveals the message in the inline field and in the sheet
 *   field, the `attached` and `detached` variants draw what TextInput draws,
 *   and a tap on the plain icon in the sheet field opens the sheet
 * @position Testing; validates Tokenizer.tsx with useInputStatusIcon
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Tokenizer} from './Tokenizer';
import type {SearchSource, SearchableItem} from '../Typeahead/types';

// A field in the sheet presentation loads the sheet module on mount, and the
// load runs past the test that started it. The file loads it before any test
// runs, so no load is still running when the test environment is torn down.
await import('./TokenizerBottomSheet');

const h = {hidden: true} as const;
const MESSAGE = 'Select at least one member';

const source: SearchSource = {
  search: () => [],
  bootstrap: () => [],
};

function Field(props: {
  statusVariant?: 'attached' | 'detached' | 'tooltip';
  presentation?: 'popover' | 'bottom-sheet';
  value?: SearchableItem[];
}) {
  return (
    <Tokenizer
      label="Members"
      searchSource={source}
      value={props.value ?? []}
      onChange={() => {}}
      status={{type: 'error', message: MESSAGE}}
      statusVariant={props.statusVariant}
      presentation={props.presentation ?? 'popover'}
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

describe('Tokenizer status icon', () => {
  it('draws an info-tip button whose tooltip holds the message for statusVariant="tooltip"', async () => {
    const {container} = render(<Field statusVariant="tooltip" />);
    expect(
      container.querySelector('.astryx-field-status'),
    ).not.toBeInTheDocument();
    const button = await screen.findByRole('button', {name: 'Error details'});
    const tooltip = await screen.findByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    expect(button.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('describes the input by the tooltip, not by an absent message box', async () => {
    render(<Field statusVariant="tooltip" />);
    const input = screen.getByRole('combobox');
    const tooltip = await screen.findByRole('tooltip', h);
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(
      ' ',
    );
    expect(describedBy).toContain(tooltip.id);
    for (const id of describedBy) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  for (const statusVariant of ['attached', 'detached'] as const) {
    it(`describes the input by the message box for statusVariant="${statusVariant}"`, async () => {
      render(<Field statusVariant={statusVariant} />);
      const describedBy = (
        screen.getByRole('combobox').getAttribute('aria-describedby') ?? ''
      ).split(' ');
      const box = describedBy
        .map(id => document.getElementById(id))
        .find(el => el?.textContent?.includes(MESSAGE));
      expect(box).toBeDefined();
      expect(box).not.toHaveAttribute('role', 'tooltip');
    });
  }

  it('reveals the message on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Field statusVariant="tooltip" />);
    const tooltip = await screen.findByRole('tooltip', h);
    await user.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.tab();
    expect(
      await screen.findByRole('button', {name: 'Error details'}),
    ).toHaveFocus();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('lands Shift+Tab from after the field on the info-tip, as TextInput does', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Field statusVariant="tooltip" />
        <button type="button">After</button>
      </>,
    );
    const button = await screen.findByRole('button', {name: 'Error details'});
    screen.getByRole('button', {name: 'After'}).focus();
    await user.tab({shift: true});
    expect(button).toHaveFocus();
  });

  it('keeps focus on the info-tip when it is clicked', async () => {
    const user = userEvent.setup();
    render(<Field statusVariant="tooltip" />);
    const button = await screen.findByRole('button', {name: 'Error details'});
    await user.click(button);
    expect(button).toHaveFocus();
  });

  it('draws a plain status icon for statusVariant="attached", as TextInput does', async () => {
    const {container} = render(<Field statusVariant="attached" />);
    await waitFor(() => {
      expect(
        container.querySelector('.astryx-input-status-icon'),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', {name: 'Error details'}),
    ).not.toBeInTheDocument();
  });

  it('moves focus to the input when the plain attached icon is clicked', async () => {
    const user = userEvent.setup();
    const {container} = render(<Field statusVariant="attached" />);
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

  it('draws no on-field icon for statusVariant="detached"', async () => {
    const {container} = render(<Field statusVariant="detached" />);
    expect(
      container.querySelector('.astryx-input-status-icon'),
    ).not.toBeInTheDocument();
  });

  it('draws the info-tip in the sheet field, and a click on it opens no sheet', async () => {
    const user = userEvent.setup();
    render(<Field statusVariant="tooltip" presentation="bottom-sheet" />);
    const trigger = screen.getByRole('button', {name: /Members/});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    const button = await screen.findByRole('button', {name: 'Error details'});
    const tooltip = await screen.findByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    await user.click(button);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the sheet when the plain attached icon in the sheet field is tapped', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <Field statusVariant="attached" presentation="bottom-sheet" />,
    );
    const trigger = screen.getByRole('button', {name: /Members/});
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
