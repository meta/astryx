// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typeahead.statusTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Typeahead
 * @output Unit tests for the on-field status icon: the `tooltip` variant's
 *   info-tip button reveals the message, and the `attached` and `detached`
 *   variants draw what TextInput draws
 * @position Testing; validates Typeahead.tsx with useInputStatusIcon
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Typeahead} from './Typeahead';
import type {SearchSource, SearchableItem} from './types';

const h = {hidden: true} as const;
const MESSAGE = 'Please make a selection';

const source: SearchSource = {
  search: () => [],
  bootstrap: () => [],
};

function Field(props: {
  statusVariant?: 'attached' | 'detached' | 'tooltip';
  value?: SearchableItem | null;
}) {
  return (
    <Typeahead
      label="Fruit"
      searchSource={source}
      value={props.value ?? null}
      onChange={() => {}}
      status={{type: 'error', message: MESSAGE}}
      statusVariant={props.statusVariant}
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

describe('Typeahead status icon', () => {
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

  it('keeps focus on the info-tip when it is clicked, with or without a value', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<Field statusVariant="tooltip" />);
    await user.click(
      await screen.findByRole('button', {name: 'Error details'}),
    );
    expect(
      await screen.findByRole('button', {name: 'Error details'}),
    ).toHaveFocus();
    rerender(
      <Field statusVariant="tooltip" value={{id: 'apple', label: 'Apple'}} />,
    );
    await user.click(
      await screen.findByRole('button', {name: 'Error details'}),
    );
    expect(
      await screen.findByRole('button', {name: 'Error details'}),
    ).toHaveFocus();
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
});
