// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PanelSearchInput.disabled.test.tsx
 * @input Uses the private panel search, public clear props, and Testing Library
 * @output Tests opt-in query/clear availability and unchanged enabled defaults
 * @position Testing; guards the private shared search transport and public API boundary
 */

import {createRef} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PanelSearchInput} from './PanelSearchInput';
import {InputClearButton, type InputClearButtonProps} from './InputClearButton';

it('keeps availability and popup descriptions off the public clear props', () => {
  const hasDisabled: 'isDisabled' extends keyof InputClearButtonProps
    ? true
    : false = false;
  const hasReadOnly: 'isReadOnly' extends keyof InputClearButtonProps
    ? true
    : false = false;
  const hasDescription: 'aria-describedby' extends keyof InputClearButtonProps
    ? true
    : false = false;
  expect([hasDisabled, hasReadOnly, hasDescription]).toEqual([
    false,
    false,
    false,
  ]);
  const onClick = vi.fn();
  render(<InputClearButton label="Clear field" onClick={onClick} />);
  const clear = screen.getByRole('button', {name: 'Clear field'});
  expect(clear).not.toHaveAttribute('disabled');
  expect(clear).not.toHaveAttribute('aria-disabled');
  fireEvent.click(clear);
  expect(onClick).toHaveBeenCalledOnce();
});

describe('PanelSearchInput private availability', () => {
  it('leaves omitted availability enabled and retains ordinary change/clear focus behavior', () => {
    const ref = createRef<HTMLInputElement>();
    const onValueChange = vi.fn();
    render(
      <PanelSearchInput
        ref={ref}
        label="Search options"
        clearLabel="Clear search"
        value="a"
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('aria-disabled');
    expect(input).not.toHaveAttribute('readonly');
    fireEvent.change(input, {target: {value: 'Ban'}});
    expect(onValueChange).toHaveBeenLastCalledWith('Ban');
    const clear = screen.getByRole('button', {name: 'Clear search'});
    act(() => clear.focus());
    fireEvent.click(clear, {detail: 0});
    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(input).toHaveFocus();
  });

  it('keeps both owners and descriptions while blocking typing, paste, synthetic change and clear', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    const onValueChange = vi.fn();
    const fixture = (isDisabled: boolean) => (
      <>
        <span id="search-help">Search help</span>
        <span id="search-reason">Unavailable reason</span>
        <PanelSearchInput
          ref={ref}
          label="Search options"
          clearLabel="Clear search"
          value="a"
          aria-describedby="search-help search-reason"
          isDisabled={isDisabled}
          onValueChange={onValueChange}
        />
      </>
    );
    const {rerender} = render(fixture(false));
    const input = screen.getByRole('textbox');
    const clear = screen.getByRole('button', {name: 'Clear search'});
    act(() => input.focus());
    rerender(fixture(true));
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toHaveAttribute('disabled');
    await user.keyboard('Ban');
    await user.paste('Cherry');
    fireEvent.change(input, {target: {value: 'Ban'}});
    expect(input).toHaveValue('a');
    await user.tab();
    expect(clear).toHaveFocus();
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    expect(clear).not.toHaveAttribute('disabled');
    expect(clear).toHaveAccessibleDescription(
      'Search help Unavailable reason Clear',
    );
    await user.keyboard('{Enter} ');
    fireEvent.click(clear, {detail: 0});
    expect(clear).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
    rerender(fixture(false));
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getByRole('button', {name: 'Clear search'})).toBe(clear);
    expect(clear).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('');
    expect(input).toHaveFocus();
  });
});
