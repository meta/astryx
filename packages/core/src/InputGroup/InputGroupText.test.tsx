// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InputGroupText.test.tsx
 * @input Uses vitest, @testing-library/react, user-event, StyleX, InputGroup, InputGroupText, TextInput
 * @output Contract tests for InputGroupText
 * @position Testing; validates the InputGroupText component contract
 *
 * SYNC: When the InputGroupText contract changes, update these tests to match
 */

import {createRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {InputGroup} from './InputGroup';
import {InputGroupText} from './InputGroupText';
import {TextInput} from '../TextInput';

const overrides = stylex.create({
  wrap: {whiteSpace: 'normal'},
});

/** The bordered cell around `text`; plain text sits in a span inside it. */
function cellOf(text: string): HTMLElement {
  return screen
    .getByText(text)
    .closest('.astryx-input-group-text') as HTMLElement;
}

describe('InputGroupText', () => {
  it('is plain text with no role and no tab stop (FR1, AR1)', async () => {
    const user = userEvent.setup();
    render(
      <InputGroup label="Website">
        <InputGroupText>https://</InputGroupText>
        <TextInput label="Address" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    const cell = cellOf('https://');
    expect(cell).not.toHaveAttribute('role');
    expect(cell).not.toHaveAttribute('tabindex');

    await user.tab();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('passes ref, DOM props, className, and style to the cell, which carries its target (FR1, FR4)', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <InputGroup label="Price">
        <InputGroupText
          ref={ref}
          id="currency"
          data-testid="currency-cell"
          className="caller-class"
          style={{paddingInline: '20px'}}>
          $
        </InputGroupText>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    const cell = screen.getByTestId('currency-cell');
    expect(ref.current).toBe(cell);
    expect(cell).toHaveAttribute('id', 'currency');
    expect(cell).toHaveTextContent('$');
    expect(cell).toHaveClass('astryx-input-group-text', 'caller-class');
    expect(cell.style.paddingInline).toBe('20px');
  });

  it('keeps its content on one line, unshrunk and centered on the cross axis (FR2)', () => {
    render(
      <InputGroup label="Website">
        <InputGroupText>https://</InputGroupText>
        <TextInput label="Address" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    const style = getComputedStyle(cellOf('https://'));
    expect(style.display).toBe('flex');
    expect(style.alignItems).toBe('center');
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.flexShrink).toBe('0');
  });

  it('applies caller xstyle after its own styles (ORD1)', () => {
    render(
      <InputGroup label="Website">
        <InputGroupText xstyle={overrides.wrap}>https://</InputGroupText>
        <TextInput label="Address" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(getComputedStyle(cellOf('https://')).whiteSpace).toBe('normal');
  });

  it('puts plain text direction on an inner span, not on the bordered cell (FR3)', () => {
    render(
      <InputGroup label="Website">
        <InputGroupText data-testid="cell">https://</InputGroupText>
        <TextInput label="URL" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );
    const cell = screen.getByTestId('cell');
    expect(cell).not.toHaveAttribute('dir');
    expect(screen.getByText('https://')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('https://').parentElement).toBe(cell);
  });

  it('leaves right-to-left and rich text in the cell unwrapped', () => {
    render(
      <InputGroup label="Price">
        <InputGroupText data-testid="rtl">
          {'\u0631\u064a\u0627\u0644'}
        </InputGroupText>
        <InputGroupText data-testid="rich">
          <span>$</span>
        </InputGroupText>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );
    expect(screen.getByTestId('rtl').querySelector('[dir]')).toBeNull();
    expect(screen.getByTestId('rich').querySelector('[dir]')).toBeNull();
  });
});
