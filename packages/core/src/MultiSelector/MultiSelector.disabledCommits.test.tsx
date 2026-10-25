// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.disabledCommits.test.tsx
 * @input Uses Testing Library, user-event, and the public MultiSelector API
 * @output Regression coverage for disabled commits from an already-open panel
 * @position Tests; complements trigger-only focusable-disabled coverage
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MultiSelector, type MultiSelectorChange} from './MultiSelector';

const OPTIONS = ['Apple', 'Banana'];
const VALUE = ['Apple'];
const h = {hidden: true} as const;

// jsdom does not implement the Popover API. Keep its state observable without
// replacing any MultiSelector event handler or selection implementation.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
});

describe('MultiSelector disabled while open (spec:AST-085 FR2)', () => {
  it.each(['Banana', 'Apple', 'Select all'])(
    'blocks pointer commits on %s, including the Action, until re-enabled',
    async optionName => {
      const user = userEvent.setup();
      const order: string[] = [];
      const onChange = vi.fn(() => order.push('change'));
      const changeAction = vi.fn(() => {
        order.push('action');
      });
      const field = (isDisabled: boolean) => (
        <form aria-label="Form">
          <MultiSelector
            label="Fruit"
            options={OPTIONS}
            value={VALUE}
            onChange={onChange}
            changeAction={changeAction}
            isDisabled={isDisabled}
            htmlName="fruit"
            hasSelectAll
          />
        </form>
      );
      const {rerender} = render(field(false));
      const trigger = screen.getByRole('combobox', {name: 'Fruit'});
      await user.click(trigger);
      const option = screen.getByRole('option', {
        name: optionName === 'Select all' ? /^Select all/ : optionName,
        ...h,
      });
      rerender(field(true));
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      await user.click(option);
      expect(onChange).not.toHaveBeenCalled();
      expect(changeAction).not.toHaveBeenCalled();
      expect(screen.getByRole('option', {name: 'Apple', ...h})).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(
        screen.getByRole('option', {name: 'Banana', ...h}),
      ).toHaveAttribute('aria-selected', 'false');
      const form = screen.getByRole<HTMLFormElement>('form', {name: 'Form'});
      expect(new FormData(form).getAll('fruit')).toEqual([]);
      rerender(field(false));
      expect(new FormData(form).getAll('fruit')).toEqual(VALUE);
      await user.click(option);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(
        optionName === 'Apple' ? [] : ['Apple', 'Banana'],
      );
      expect(changeAction).toHaveBeenCalledExactlyOnceWith(
        optionName === 'Apple' ? [] : ['Apple', 'Banana'],
      );
      expect(order).toEqual(['change', 'action']);
    },
  );

  it.each(['pointer', 'Enter', 'highlighted Enter'])(
    'blocks create via %s without clearing the query or losing the search focus',
    async route => {
      const user = userEvent.setup();
      const onChange =
        vi.fn<(value: string[], change?: MultiSelectorChange) => void>();
      const changeAction = vi.fn();
      const field = (isDisabled: boolean) => (
        <MultiSelector
          label="Fruit"
          options={OPTIONS}
          value={VALUE}
          onChange={onChange}
          changeAction={changeAction}
          isDisabled={isDisabled}
          hasSearch
          hasCreate
        />
      );
      const {rerender} = render(field(false));
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      const search = screen.getByRole('combobox', h);
      await user.type(search, 'Cherry');
      const option = screen.getByRole('option', {
        name: 'Create "Cherry"',
        ...h,
      });
      if (route === 'highlighted Enter') {
        await user.keyboard('{ArrowDown}');
        expect(search).toHaveAttribute('aria-activedescendant', option.id);
      } else {
        expect(search).not.toHaveAttribute('aria-activedescendant');
      }
      rerender(field(true));
      expect(search).toHaveFocus();
      if (route === 'pointer') {
        await user.click(option);
      } else {
        await user.keyboard('{Enter}');
      }
      expect(onChange).not.toHaveBeenCalled();
      expect(changeAction).not.toHaveBeenCalled();
      expect(search).toHaveValue('Cherry');
      expect(screen.getByRole('option', {name: 'Create "Cherry"', ...h})).toBe(
        option,
      );
      rerender(field(false));
      await user.click(option);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(['Apple', 'Cherry'], {
        type: 'create',
        query: 'Cherry',
      });
      expect(changeAction).toHaveBeenCalledExactlyOnceWith(['Apple', 'Cherry']);
      expect(search).toHaveValue('');
    },
  );

  it('guards grid option commits with a caller-rendered trigger without disabling caller actions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const changeAction = vi.fn();
    const onAction = vi.fn();
    const options = [
      'Apple',
      {
        value: 'Banana',
        action: (
          <button type="button" onClick={onAction}>
            Inspect Banana
          </button>
        ),
      },
    ];
    const field = (isDisabled: boolean) => (
      <MultiSelector
        label="Fruit"
        options={options}
        value={VALUE}
        onChange={onChange}
        changeAction={changeAction}
        isDisabled={isDisabled}
        renderTrigger={props => (
          <button type="button" {...props}>
            Choose fruit
          </button>
        )}
      />
    );
    const {rerender} = render(field(false));
    await user.click(screen.getByRole('button', {name: 'Choose fruit'}));
    const optionCell = screen.getByRole('gridcell', {name: 'Banana', ...h});
    rerender(field(true));
    await user.click(optionCell);
    expect(onChange).not.toHaveBeenCalled();
    expect(changeAction).not.toHaveBeenCalled();
    // The caller owns this control's availability. Do not clone or disable it
    // to prevent MultiSelector's own value commits.
    const action = screen.getByRole('button', {name: 'Inspect Banana', ...h});
    expect(action).not.toHaveAttribute('disabled');
    expect(action).not.toHaveAttribute('aria-disabled');
    await user.click(action);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    rerender(field(false));
    await user.click(optionCell);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['Apple', 'Banana']);
    expect(changeAction).toHaveBeenCalledExactlyOnceWith(['Apple', 'Banana']);
  });

  it('keeps the focused trigger and its descriptions when the open selector becomes disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const field = (isDisabled: boolean) => (
      <>
        <button type="button">Before</button>
        <span id="caller-help">Caller help</span>
        <MultiSelector
          label="Fruit"
          options={OPTIONS}
          value={VALUE}
          onChange={onChange}
          isDisabled={isDisabled}
          disabledMessage="Fruit unavailable"
          aria-describedby="caller-help"
        />
        <button type="button">After</button>
      </>
    );
    const {rerender} = render(field(false));
    await user.click(screen.getByRole('button', {name: 'Before'}));
    await user.tab();
    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    await user.keyboard('{ArrowDown}');
    rerender(field(true));
    expect(screen.getByRole('combobox', {name: 'Fruit'})).toBe(trigger);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleDescription(
      'Caller help Fruit unavailable',
    );
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
  });
});
