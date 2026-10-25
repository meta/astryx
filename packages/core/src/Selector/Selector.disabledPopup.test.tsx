// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.disabledPopup.test.tsx
 * @input Uses public Selector, Testing Library, and Vitest
 * @output Regressions for retained disabled popup owners, independent description replacement, and search mutation
 * @position Testing; complements trigger/commit tests with popup availability
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef, StrictMode} from 'react';
import {Selector} from './Selector';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

const options = ['Apple', 'Banana', 'Cherry'];
const modes = [
  {presentation: 'popover', hasSearch: true},
  {presentation: 'bottom-sheet', hasSearch: true},
  {presentation: 'bottom-sheet', hasSearch: false},
] as const;
const cases = modes.flatMap(mode =>
  [false, true].map(reason => ({...mode, reason})),
);
const h = {hidden: true};

function descriptions(owner: HTMLElement) {
  return (owner.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => {
      const node = document.getElementById(id);
      expect(node).not.toBeNull();
      return node?.textContent;
    })
    .join(' ');
}

describe('Selector disabled popup', () => {
  it('tracks independent sheet description replacement, removal and reappearance without rerendering Selector', async () => {
    const user = userEvent.setup();
    const triggerRef = createRef<HTMLButtonElement>();
    const external = render(
      <span id="external-help">
        <a href="#help">Caller help</a>
      </span>,
    );
    const fixture = (isDisabled: boolean) => (
      <StrictMode>
        <Selector
          label="Fruit"
          options={options}
          hasSearch
          presentation="bottom-sheet"
          isDisabled={isDisabled}
          aria-describedby="external-help"
          description="Choose a fruit"
          disabledMessage="Unavailable reason"
          ref={triggerRef}
        />
      </StrictMode>
    );
    const view = render(fixture(false));
    await user.click(screen.getByRole('button', {name: 'Fruit'}));
    await screen.findByRole('listbox', h);
    const input = screen.getByRole('combobox', h);
    await waitFor(() => expect(input).toHaveFocus());
    view.rerender(fixture(true));
    const trigger = triggerRef.current;
    const expectDescription = (help: string) =>
      expect(descriptions(input)).toBe(
        `${help ? `${help} ` : ''}Choose a fruit Unavailable reason`,
      );
    expectDescription('Caller help');
    const mirror = document.getElementById(
      (input.getAttribute('aria-describedby') ?? '').split(/\s+/)[0],
    );
    expect(mirror?.querySelector('a, button, input, [tabindex]')).toBeNull();
    const link = screen.getByRole('link', h);
    act(() => {
      link.textContent = 'Updated help';
    });
    await waitFor(() => expectDescription('Updated help'));
    external.rerender(
      <span key="replacement" id="external-help">
        Replacement help
      </span>,
    );
    // Only the independent source root renders from here on. A Selector
    // rerender would mask a subscription still bound to the disconnected node.
    await waitFor(() => expectDescription('Replacement help'));
    const replacement = document.getElementById('external-help');
    await act(async () => {
      link.textContent = 'Disconnected help';
      if (replacement) {
        replacement.textContent = 'Replacement updated';
      }
    });
    await waitFor(() => expectDescription('Replacement updated'));
    external.rerender(null);
    await waitFor(() => expectDescription(''));
    await act(async () => {
      if (replacement) {
        replacement.textContent = 'Removed help';
      }
    });
    expectDescription('');
    external.rerender(<span id="external-help">Late help</span>);
    await waitFor(() => expectDescription('Late help'));
    await act(async () => {
      const source = document.getElementById('external-help');
      if (source) {
        source.textContent = 'Late update';
      }
    });
    await waitFor(() => expectDescription('Late update'));
    expect(screen.getByRole('combobox', h)).toBe(input);
    expect(input).toHaveFocus();
    expect(triggerRef.current).toBe(trigger);
    expect(mirror?.querySelector('a, button, input, [tabindex]')).toBeNull();
    view.unmount();
    await act(async () => {
      const source = document.getElementById('external-help');
      if (source) {
        source.textContent = 'After unmount';
      }
      await Promise.resolve();
    });
    expect(mirror?.textContent).toBe('Late update Choose a fruit');
  });

  it.each(cases)(
    'retains $presentation search=$hasSearch owner with reason=$reason and blocks edits',
    async ({presentation, hasSearch, reason}) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const changeAction = vi.fn();
      const fixture = (isDisabled: boolean) => (
        <form aria-label="Fruit form">
          <span id="caller-help">
            Caller <a href="#help">help</a>
          </span>
          <Selector
            label="Fruit"
            htmlName="fruit"
            value="Apple"
            options={options}
            presentation={presentation}
            hasSearch={hasSearch}
            isDisabled={isDisabled}
            description="Existing description"
            aria-describedby="caller-help"
            disabledMessage={reason ? 'Unavailable reason' : undefined}
            renderOption={option => (
              <span data-testid={`slot-${option.value}`} aria-disabled="false">
                {option.label}
                {option.value === 'Apple' && <a href="#help">Details</a>}
              </span>
            )}
            onChange={onChange}
            changeAction={changeAction}
          />
        </form>
      );
      const {rerender} = render(fixture(false));
      const trigger = screen.getByRole(hasSearch ? 'button' : 'combobox', {
        name: 'Fruit',
      });
      await user.click(trigger);
      const listbox = await screen.findByRole('listbox', h);
      const owner = hasSearch ? screen.getByRole('combobox', h) : listbox;
      // Browser evidence separately proves the presentation's initial focus.
      act(() => owner.focus());
      rerender(fixture(true));
      expect(owner).toHaveFocus();
      expect(owner).toHaveAttribute('aria-disabled', 'true');
      expect(owner).not.toHaveAttribute('disabled');
      expect(descriptions(owner)).toContain('Existing description');
      expect(descriptions(owner)).toContain('Caller help');
      expect(descriptions(owner).includes('Unavailable reason')).toBe(reason);
      expect(screen.getAllByRole('link', h)).toHaveLength(2);
      expect(screen.getByTestId('slot-Banana')).toHaveAttribute(
        'aria-disabled',
        'false',
      );
      if (hasSearch) {
        expect(owner).toHaveAttribute('readonly');
        await user.keyboard('Ban');
        await user.paste('Cherry');
        // A dispatched change must also be rejected, not just native editing.
        fireEvent.change(owner, {target: {value: 'Ban'}});
        expect(owner).toHaveValue('');
        expect(screen.getAllByRole('option', h)).toHaveLength(3);
      }
      fireEvent.click(screen.getByRole('option', {name: 'Banana', ...h}));
      expect(onChange).not.toHaveBeenCalled();
      expect(changeAction).not.toHaveBeenCalled();
      const form = screen.getByRole<HTMLFormElement>('form', {
        name: 'Fruit form',
      });
      expect(new FormData(form).getAll('fruit')).toEqual([]);
      expect(trigger).toHaveTextContent('Apple');
      rerender(fixture(false));
      expect(
        hasSearch
          ? screen.getByRole('combobox', h)
          : screen.getByRole('listbox', h),
      ).toBe(owner);
      expect(owner).not.toHaveAttribute('aria-disabled', 'true');
      expect(new FormData(form).getAll('fruit')).toEqual(['Apple']);
      if (hasSearch) {
        expect(owner).not.toHaveAttribute('readonly');
        fireEvent.change(owner, {target: {value: 'Ban'}});
        expect(screen.getAllByRole('option', h)).toHaveLength(1);
      }
      fireEvent.click(screen.getByRole('option', {name: 'Banana', ...h}));
      await waitFor(() =>
        expect(changeAction).toHaveBeenCalledExactlyOnceWith('Banana'),
      );
      expect(onChange).toHaveBeenCalledExactlyOnceWith('Banana');
    },
  );

  it.each(cases.filter(mode => mode.hasSearch))(
    'retains focused clear in $presentation reason=$reason until enabled clear',
    async ({presentation, reason}) => {
      const user = userEvent.setup();
      const fixture = (isDisabled: boolean) => (
        <Selector
          label="Fruit"
          options={options}
          hasSearch
          presentation={presentation}
          isDisabled={isDisabled}
          description="Existing description"
          disabledMessage={reason ? 'Unavailable reason' : undefined}
        />
      );
      const {rerender} = render(fixture(false));
      await user.click(screen.getByRole('button', {name: 'Fruit'}));
      await screen.findByRole('listbox', h);
      const input = screen.getByRole('combobox', h);
      await waitFor(() => expect(input).toHaveFocus());
      fireEvent.change(input, {target: {value: 'a'}});
      const clear = screen.getByRole('button', {
        name: 'Clear Search options',
        ...h,
      });
      act(() => clear.focus());
      rerender(fixture(true));
      expect(clear).toHaveFocus();
      expect(clear).not.toHaveAttribute('disabled');
      expect(clear).toHaveAttribute('aria-disabled', 'true');
      expect(descriptions(clear)).toContain('Existing description');
      expect(descriptions(clear)).toContain('Clear');
      expect(descriptions(clear).includes('Unavailable reason')).toBe(reason);
      await user.keyboard('{Enter} ');
      fireEvent.click(clear, {detail: 0});
      expect(clear).toHaveFocus();
      expect(input).toHaveValue('a');
      expect(screen.getAllByRole('option', h)).toHaveLength(2);
      rerender(fixture(false));
      expect(
        screen.getByRole('button', {name: 'Clear Search options', ...h}),
      ).toBe(clear);
      await user.keyboard('{Enter}');
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
    },
  );
});
