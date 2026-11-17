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
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PowerSearch} from './PowerSearch';
import type {PowerSearchConfig} from './types';

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

function Field(props: {presentation: 'popover' | 'bottom-sheet'}) {
  return (
    <PowerSearch
      config={config}
      filters={[]}
      onChange={() => {}}
      label="Search issues"
      presentation={props.presentation}
      status={{type: 'error', message: MESSAGE}}
      statusVariant="tooltip"
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
  it('draws one info-tip whose tooltip holds the message in the popover presentation', () => {
    const {container} = render(<Field presentation="popover" />);
    expect(
      container.querySelector('.astryx-field-status'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: 'Error details'})).toHaveLength(
      1,
    );
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent(MESSAGE);
    expect(
      screen.getByRole('combobox').getAttribute('aria-describedby'),
    ).toContain(tooltip.id);
  });

  it('draws the info-tip on the sheet trigger field, and a click on it opens no sheet', async () => {
    const user = userEvent.setup();
    render(<Field presentation="bottom-sheet" />);
    const trigger = screen.getByRole('button', {name: /Search issues/});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    const button = screen.getByRole('button', {name: 'Error details'});
    const tooltip = screen.getByRole('tooltip', h);
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
});
