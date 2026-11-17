// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokenizer.statusTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Tokenizer
 * @output Unit tests for the on-field status icon: the `tooltip` variant's
 *   info-tip button reveals the message in the inline field and in the sheet
 *   field, and the `attached` and `detached` variants draw what TextInput
 *   draws
 * @position Testing; validates Tokenizer.tsx with useInputStatusIcon
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Tokenizer} from './Tokenizer';
import type {SearchSource, SearchableItem} from '../Typeahead/types';

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
  it('draws an info-tip button whose tooltip holds the message for statusVariant="tooltip"', () => {
    const {container} = render(<Field statusVariant="tooltip" />);
    expect(
      container.querySelector('.astryx-field-status'),
    ).not.toBeInTheDocument();
    const button = screen.getByRole('button', {name: 'Error details'});
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    expect(button.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('describes the input by the tooltip, not by an absent message box', () => {
    render(<Field statusVariant="tooltip" />);
    const input = screen.getByRole('combobox');
    const tooltip = screen.getByRole('tooltip', h);
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(
      ' ',
    );
    expect(describedBy).toContain(tooltip.id);
    for (const id of describedBy) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('reveals the message on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Field statusVariant="tooltip" />);
    const tooltip = screen.getByRole('tooltip', h);
    await user.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'Error details'})).toHaveFocus();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('keeps focus on the info-tip when it is clicked', async () => {
    const user = userEvent.setup();
    render(<Field statusVariant="tooltip" />);
    const button = screen.getByRole('button', {name: 'Error details'});
    await user.click(button);
    expect(button).toHaveFocus();
  });

  it('draws a plain status icon for statusVariant="attached", as TextInput does', () => {
    const {container} = render(<Field statusVariant="attached" />);
    expect(
      container.querySelector('.astryx-input-status-icon'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Error details'}),
    ).not.toBeInTheDocument();
  });

  it('draws no on-field icon for statusVariant="detached"', () => {
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
    const button = screen.getByRole('button', {name: 'Error details'});
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    await user.click(button);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
