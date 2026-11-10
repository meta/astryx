// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BaseTypeahead.menu.test.tsx
 * @input BaseTypeahead, Typeahead and Tokenizer with a `menu` config and a handle
 * @output The menu's listbox and dialog roles, the handle, focus return, and role switches
 * @position Colocated verification for the BaseTypeahead menu
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef, useRef, useState} from 'react';
import {
  BaseTypeahead,
  type BaseTypeaheadHandle,
  type BaseTypeaheadMenu,
} from './BaseTypeahead';
import {Typeahead} from './Typeahead';
import {Tokenizer, type TokenizerHandle} from '../Tokenizer';
import type {SearchSource, SearchableItem} from './types';

const popoverOpenState = new WeakMap<HTMLElement, boolean>();
const originalMatchesDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'matches',
);
const originalMatches = HTMLElement.prototype.matches;

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  };
  HTMLElement.prototype.hidePopover = function () {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  };
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    ...originalMatchesDescriptor,
    value(this: HTMLElement, selector: string) {
      if (selector === ':popover-open') {
        return popoverOpenState.get(this) ?? false;
      }
      return originalMatches.call(this, selector);
    },
  });
});

afterAll(() => {
  if (originalMatchesDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'matches',
      originalMatchesDescriptor,
    );
  }
});

const fruits: SearchSource<SearchableItem> = {
  search: query =>
    [
      {id: 'apple', label: 'Apple'},
      {id: 'apricot', label: 'Apricot'},
      {id: 'see-all', label: 'See all results'},
    ].filter(item =>
      item.id === 'see-all'
        ? true
        : item.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => [],
};

const isLayerOpen = (element: HTMLElement): boolean =>
  element.closest<HTMLElement>('[popover]')?.matches(':popover-open') ?? false;

describe('BaseTypeahead menu', () => {
  describe('listbox role', () => {
    it('shows information around the result list, and the list stays the only listbox', async () => {
      const user = userEvent.setup();
      render(
        <BaseTypeahead
          aria-label="Fruit"
          searchSource={fruits}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          menu={{
            role: 'listbox',
            render: ({listbox, query}) => (
              <>
                <div>Results for {query}</div>
                {listbox}
                <div>Arrow keys move</div>
              </>
            ),
          }}
        />,
      );

      const input = screen.getByRole('combobox');
      await user.type(input, 'ap');
      const listbox = await screen.findByRole('listbox', {hidden: true});
      const header = screen.getByText('Results for ap');
      expect(screen.getAllByRole('listbox', {hidden: true})).toHaveLength(1);
      expect(listbox.contains(header)).toBe(false);
      expect(header.closest('[role]')).not.toBe(listbox);
      expect(input).toHaveAttribute('aria-controls', listbox.id);

      // The arrow keys reach every result, "See all results" included.
      await user.keyboard('{ArrowDown}{ArrowDown}');
      const active = document.getElementById(
        input.getAttribute('aria-activedescendant') ?? '',
      );
      expect(active).toHaveTextContent('See all results');
      expect(listbox.contains(active)).toBe(true);
    });

    it('warns in development when a control sits outside the result list', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const user = userEvent.setup();
      render(
        <BaseTypeahead
          aria-label="Fruit"
          searchSource={fruits}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          menu={{
            role: 'listbox',
            render: ({listbox}) => (
              <>
                {listbox}
                <button type="button">Create</button>
              </>
            ),
          }}
        />,
      );

      await user.type(screen.getByRole('combobox'), 'ap');
      await screen.findByRole('listbox', {hidden: true});
      await waitFor(() =>
        expect(
          warn.mock.calls.some(call =>
            call.join(' ').includes('outside the result list'),
          ),
        ).toBe(true),
      );
      warn.mockRestore();
    });
  });

  describe('dialog role', () => {
    function Editor({
      onOpenChange,
      removeOpener = false,
    }: {
      onOpenChange?: (isOpen: boolean) => void;
      removeOpener?: boolean;
    }) {
      const handleRef = useRef<BaseTypeaheadHandle>(null);
      const [isOpenerShown, setIsOpenerShown] = useState(true);
      return (
        <>
          {isOpenerShown && (
            <button
              type="button"
              onClick={() => {
                if (removeOpener) {
                  setIsOpenerShown(false);
                }
                handleRef.current?.open();
              }}>
              Status: is Open
            </button>
          )}
          <BaseTypeahead
            aria-label="Filters"
            searchSource={fruits}
            value={null}
            onChange={() => {}}
            debounceMs={0}
            handleRef={handleRef}
            onOpenChange={onOpenChange}
            menu={{
              role: 'dialog',
              label: 'Status',
              render: ({close}) => (
                <>
                  <input aria-label="Value" defaultValue="Open" />
                  <button type="button" onClick={close}>
                    Cancel
                  </button>
                </>
              ),
            }}
          />
        </>
      );
    }

    it('opens a named dialog from the handle and moves focus into it', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<Editor onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('button', {name: 'Status: is Open'}));
      const dialog = await screen.findByRole('dialog', {
        name: 'Status',
        hidden: true,
      });
      expect(isLayerOpen(dialog)).toBe(true);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-haspopup', 'dialog');
      expect(input).toHaveAttribute('aria-expanded', 'true');
      const controlled = document.getElementById(
        input.getAttribute('aria-controls') ?? '',
      );
      expect(controlled?.contains(dialog)).toBe(true);
      expect(input).not.toHaveAttribute('aria-activedescendant');
      // Focus moves to a control inside the dialog. (jsdom's selector engine
      // lists a comma selector's matches by group, so which control comes
      // first differs from a browser; the Chromium spec checks the first.)
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
    });

    it('returns focus on Escape to the element focused when it opened', async () => {
      const user = userEvent.setup();
      render(<Editor />);
      const opener = screen.getByRole('button', {name: 'Status: is Open'});

      opener.focus();
      await user.keyboard('{Enter}');
      const value = await screen.findByRole('textbox', {
        name: 'Value',
        hidden: true,
      });
      const dialog = screen.getByRole('dialog', {hidden: true});
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      await user.keyboard('{Escape}');

      await waitFor(() => expect(opener).toHaveFocus());
      expect(isLayerOpen(value)).toBe(false);
    });

    it('returns focus to the input when the opener is gone', async () => {
      const user = userEvent.setup();
      render(<Editor removeOpener />);

      screen.getByRole('button', {name: 'Status: is Open'}).focus();
      await user.keyboard('{Enter}');
      const cancel = await screen.findByRole('button', {
        name: 'Cancel',
        hidden: true,
      });
      const dialog = screen.getByRole('dialog', {hidden: true});
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      await user.click(cancel);

      await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
    });

    it('closes on a press outside the field and the dialog, and keeps a press inside', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Editor />
          <p>Elsewhere</p>
        </>,
      );
      await user.click(screen.getByRole('button', {name: 'Status: is Open'}));
      const value = await screen.findByRole('textbox', {
        name: 'Value',
        hidden: true,
      });
      await waitFor(() => expect(isLayerOpen(value)).toBe(true));
      const press = (target: Element) => {
        fireEvent.pointerDown(target, {composed: true});
        fireEvent.pointerUp(target, {composed: true});
      };
      press(value);
      expect(isLayerOpen(value)).toBe(true);
      press(screen.getByText('Elsewhere'));
      await waitFor(() => expect(isLayerOpen(value)).toBe(false));
    });

    it('opens only from the handle: typing, focus and ArrowDown leave it closed', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <BaseTypeahead
          aria-label="Filters"
          searchSource={fruits}
          value={null}
          onChange={() => {}}
          debounceMs={0}
          hasEntriesOnFocus
          onOpenChange={onOpenChange}
          menu={{
            role: 'dialog',
            label: 'Status',
            render: () => <input aria-label="Value" />,
          }}
        />,
      );
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'ap');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveValue('ap');
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('stays open when the input is emptied or loses focus', async () => {
      const user = userEvent.setup();
      const handle = createRef<BaseTypeaheadHandle>();
      render(
        <>
          <button type="button">Elsewhere</button>
          <BaseTypeahead
            aria-label="Filters"
            searchSource={fruits}
            value={null}
            onChange={() => {}}
            debounceMs={0}
            handleRef={handle}
            menu={{
              role: 'dialog',
              label: 'Status',
              render: () => <p>Editor</p>,
            }}
          />
        </>,
      );
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'a');
      act(() => handle.current?.open());
      const dialog = await screen.findByRole('dialog', {hidden: true});
      await waitFor(() => expect(isLayerOpen(dialog)).toBe(true));

      input.focus();
      await user.clear(input);
      expect(isLayerOpen(dialog)).toBe(true);
      act(() => screen.getByRole('button', {name: 'Elsewhere'}).focus());
      expect(isLayerOpen(dialog)).toBe(true);

      act(() => handle.current?.close());
      expect(isLayerOpen(dialog)).toBe(false);
    });
  });

  describe('switching role', () => {
    function FieldPicker({
      onOpenChange,
    }: {
      onOpenChange: (open: boolean) => void;
    }) {
      const handleRef = useRef<BaseTypeaheadHandle>(null);
      const [field, setField] = useState<string | null>(null);
      const menu: BaseTypeaheadMenu =
        field == null
          ? {role: 'listbox'}
          : {
              role: 'dialog',
              label: field,
              render: () => <input aria-label="Value" />,
            };
      return (
        <BaseTypeahead
          aria-label="Filters"
          searchSource={fruits}
          value={null}
          onChange={item => {
            setField(item?.label ?? null);
            handleRef.current?.open();
          }}
          debounceMs={0}
          handleRef={handleRef}
          onOpenChange={onOpenChange}
          menu={menu}
        />
      );
    }

    it('keeps the menu open when a pick switches it to a dialog', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<FieldPicker onOpenChange={onOpenChange} />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'apr');
      const listbox = await screen.findByRole('listbox', {hidden: true});
      const layer = listbox.closest<HTMLElement>('[popover]');
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      onOpenChange.mockClear();

      await user.keyboard('{Enter}');

      const dialog = await screen.findByRole('dialog', {
        name: 'Apricot',
        hidden: true,
      });
      // The same layer, never hidden between the list and the dialog.
      expect(dialog.closest('[popover]')).toBe(layer);
      expect(isLayerOpen(dialog)).toBe(true);
      expect(onOpenChange).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          screen.getByRole('textbox', {name: 'Value', hidden: true}),
        ).toHaveFocus(),
      );
    });
  });

  describe('closing a dialog that a pick opened, in a field with focus entries', () => {
    function FilterField({isSaveDeferred = false}: {isSaveDeferred?: boolean}) {
      const handleRef = useRef<BaseTypeaheadHandle>(null);
      const [field, setField] = useState<string | null>(null);
      return (
        <>
          <BaseTypeahead
            aria-label="Filters"
            searchSource={{
              ...fruits,
              bootstrap: () => [
                {id: 'apple', label: 'Apple'},
                {id: 'apricot', label: 'Apricot'},
              ],
            }}
            value={null}
            onChange={item => {
              setField(item?.label ?? null);
              handleRef.current?.open();
            }}
            onOpenChange={isOpen => {
              if (!isOpen) {
                setField(null);
              }
            }}
            debounceMs={0}
            hasEntriesOnFocus
            handleRef={handleRef}
            menu={
              field == null
                ? {role: 'listbox'}
                : {
                    role: 'dialog',
                    label: field,
                    render: ({close}) => (
                      <>
                        <button type="button" onClick={close}>
                          Cancel
                        </button>
                        {isSaveDeferred ? (
                          <button
                            type="button"
                            onClick={() => {
                              // An editor that saves before it closes.
                              void new Promise(resolve =>
                                setTimeout(resolve, 30),
                              ).then(close);
                            }}>
                            Save
                          </button>
                        ) : null}
                      </>
                    ),
                  }
            }
          />
          <p>Elsewhere</p>
        </>
      );
    }

    async function openDialogFromPick(isSaveDeferred = false) {
      const user = userEvent.setup();
      render(<FilterField isSaveDeferred={isSaveDeferred} />);
      const input = screen.getByRole('combobox');
      await user.click(input);
      await screen.findByRole('option', {name: 'Apple', hidden: true});
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog', {
        name: 'Apple',
        hidden: true,
      });
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      return {user, input};
    }

    it('Escape closes it in one press and does not reopen the list', async () => {
      const {user, input} = await openDialogFromPick();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(input).toHaveFocus());
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('close() does not reopen the list', async () => {
      const {user, input} = await openDialogFromPick();
      await user.click(
        screen.getByRole('button', {name: 'Cancel', hidden: true}),
      );
      await waitFor(() => expect(input).toHaveFocus());
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('close() after an await does not reopen the list', async () => {
      const {user, input} = await openDialogFromPick(true);
      await user.click(
        screen.getByRole('button', {name: 'Save', hidden: true}),
      );
      await waitFor(() => expect(input).toHaveFocus());
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('a press outside closes it and leaves the list closed', async () => {
      const {input} = await openDialogFromPick();
      const elsewhere = screen.getByText('Elsewhere');
      fireEvent.pointerDown(elsewhere, {composed: true});
      fireEvent.pointerUp(elsewhere, {composed: true});
      await waitFor(() =>
        expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
      );
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('a pick that calls open() and stays a listbox', () => {
    function Picker({hasEntriesOnFocus}: {hasEntriesOnFocus: boolean}) {
      const handleRef = useRef<BaseTypeaheadHandle>(null);
      return (
        <BaseTypeahead
          aria-label="Fruit"
          searchSource={{
            ...fruits,
            bootstrap: () => [{id: 'banana', label: 'Banana'}],
          }}
          value={null}
          onChange={() => handleRef.current?.open()}
          debounceMs={0}
          hasEntriesOnFocus={hasEntriesOnFocus}
          handleRef={handleRef}
          menu={{role: 'listbox'}}
        />
      );
    }

    it('reloads the focus entries, with focus back in the input', async () => {
      const user = userEvent.setup();
      render(<Picker hasEntriesOnFocus />);
      const input = screen.getByRole('combobox');
      await user.type(input, 'apr');
      await user.click(
        await screen.findByRole('option', {name: 'Apricot', hidden: true}),
      );
      expect(input).toHaveFocus();
      expect(
        await screen.findByRole('option', {name: 'Banana', hidden: true}),
      ).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes with focus in the input when there are no focus entries', async () => {
      const user = userEvent.setup();
      render(<Picker hasEntriesOnFocus={false} />);
      const input = screen.getByRole('combobox');
      await user.type(input, 'apr');
      await user.click(
        await screen.findByRole('option', {name: 'Apricot', hidden: true}),
      );
      expect(input).toHaveFocus();
      await waitFor(() =>
        expect(input).toHaveAttribute('aria-expanded', 'false'),
      );
    });
  });

  describe('forwarding', () => {
    it('Typeahead forwards the menu and the handle', async () => {
      const handle = createRef<BaseTypeaheadHandle>();
      render(
        <Typeahead
          label="Fruit"
          searchSource={fruits}
          value={null}
          onChange={() => {}}
          handleRef={handle}
          menu={{role: 'dialog', label: 'Pick', render: () => <p>Panel</p>}}
        />,
      );
      act(() => handle.current?.open());
      const dialog = await screen.findByRole('dialog', {
        name: 'Pick',
        hidden: true,
      });
      expect(isLayerOpen(dialog)).toBe(true);
    });

    it.each([
      ['Escape', 'escape'],
      ['close()', 'close'],
      ['close() after an awaited save', 'save'],
    ] as const)(
      'closing a dialog a pick opened in a Typeahead with a value returns focus to the token, with %s',
      async (_, closeBy) => {
        function FruitField() {
          const handleRef = useRef<BaseTypeaheadHandle>(null);
          const [value, setValue] = useState<SearchableItem | null>({
            id: 'apple',
            label: 'Apple',
          });
          const [field, setField] = useState<string | null>(null);
          return (
            <Typeahead
              label="Fruit"
              searchSource={fruits}
              value={value}
              onChange={item => {
                setValue(item);
                setField(item?.label ?? null);
                handleRef.current?.open();
              }}
              onOpenChange={isOpen => {
                if (!isOpen) {
                  setField(null);
                }
              }}
              debounceMs={0}
              handleRef={handleRef}
              menu={
                field == null
                  ? {role: 'listbox'}
                  : {
                      role: 'dialog',
                      label: field,
                      render: ({close}) => (
                        <button
                          type="button"
                          onClick={() => {
                            if (closeBy === 'save') {
                              void new Promise(resolve =>
                                setTimeout(resolve, 50),
                              ).then(close);
                            } else {
                              close();
                            }
                          }}>
                          Done
                        </button>
                      ),
                    }
              }
            />
          );
        }
        const user = userEvent.setup();
        render(<FruitField />);
        // Enter edit mode from the token and pick another fruit.
        await user.click(screen.getAllByText('Apple')[0]);
        const input = screen.getByRole('combobox', {name: 'Fruit'});
        await user.clear(input);
        await user.type(input, 'Apri');
        await user.click(
          await screen.findByRole('option', {name: 'Apricot', hidden: true}),
        );
        const dialog = await screen.findByRole('dialog', {
          name: 'Apricot',
          hidden: true,
        });
        await waitFor(() => expect(isLayerOpen(dialog)).toBe(true));
        // The hidden input never takes focus on the way back: a screen reader
        // would announce a control the person cannot see.
        const inputFocus = vi.fn();
        input.addEventListener('focus', inputFocus);
        if (closeBy !== 'escape') {
          await user.click(
            screen.getByRole('button', {name: 'Done', hidden: true}),
          );
        } else {
          fireEvent.keyDown(document.activeElement ?? document.body, {
            key: 'Escape',
          });
        }
        // Focus lands on the token's button, not the hidden input.
        await waitFor(() => {
          const active = document.activeElement;
          expect(active).not.toBe(input);
          expect(active?.closest('[class]')?.textContent).toContain('Apricot');
          expect(active?.tagName).toBe('BUTTON');
        });
        expect(inputFocus).not.toHaveBeenCalled();
        input.removeEventListener('focus', inputFocus);
      },
    );

    it('Escape returns focus to a Tokenizer token whose button opened the dialog', async () => {
      function TokenFilters() {
        const handleRef = useRef<TokenizerHandle>(null);
        const [editing, setEditing] = useState<string | null>(null);
        return (
          <Tokenizer
            label="Filters"
            presentation="popover"
            searchSource={fruits}
            value={[{id: 'apple', label: 'Apple'}]}
            onChange={() => {}}
            handleRef={handleRef}
            onOpenChange={isOpen => {
              if (!isOpen) {
                setEditing(null);
              }
            }}
            renderToken={item => (
              <button
                type="button"
                onClick={() => {
                  setEditing(item.label);
                  handleRef.current?.open();
                }}>
                {`Edit ${item.label}`}
              </button>
            )}
            menu={
              editing == null
                ? {role: 'listbox'}
                : {
                    role: 'dialog',
                    label: editing,
                    render: () => <input aria-label="Value" />,
                  }
            }
          />
        );
      }
      const user = userEvent.setup();
      render(<TokenFilters />);
      const token = screen.getByRole('button', {name: 'Edit Apple'});
      await user.click(token);
      const dialog = await screen.findByRole('dialog', {
        name: 'Apple',
        hidden: true,
      });
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      await user.keyboard('{Escape}');
      await waitFor(() => expect(token).toHaveFocus());

      // By keyboard too.
      await user.keyboard('{Enter}');
      await waitFor(() =>
        expect(
          screen
            .getByRole('dialog', {name: 'Apple', hidden: true})
            .contains(document.activeElement),
        ).toBe(true),
      );
      await user.keyboard('{Escape}');
      await waitFor(() => expect(token).toHaveFocus());
    });

    it.each([
      ['nothing focused', false],
      ['focus already in the field', true],
    ])(
      'Escape returns focus to a token whose click did not focus it, as in Safari, with %s',
      async (_, startsInField) => {
        function TokenFilters() {
          const handleRef = useRef<TokenizerHandle>(null);
          const [editing, setEditing] = useState<string | null>(null);
          return (
            <Tokenizer
              label="Filters"
              presentation="popover"
              searchSource={fruits}
              value={[{id: 'apple', label: 'Apple'}]}
              onChange={() => {}}
              handleRef={handleRef}
              onOpenChange={isOpen => {
                if (!isOpen) {
                  setEditing(null);
                }
              }}
              renderToken={item => (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item.label);
                    handleRef.current?.open();
                  }}>
                  {`Edit ${item.label}`}
                </button>
              )}
              menu={
                editing == null
                  ? {role: 'listbox'}
                  : {
                      role: 'dialog',
                      label: editing,
                      render: () => <input aria-label="Value" />,
                    }
              }
            />
          );
        }
        render(<TokenFilters />);
        const token = screen.getByRole('button', {name: 'Edit Apple'});
        const input = screen.getByRole('combobox', {name: 'Filters'});
        if (startsInField) {
          act(() => input.focus());
        }
        // A press and click that do not focus the button, as Safari does: the
        // press's mousedown only blurs the focused input.
        fireEvent.pointerDown(token);
        if (startsInField) {
          act(() => input.blur());
        }
        fireEvent.pointerUp(token);
        fireEvent.click(token);
        const dialog = await screen.findByRole('dialog', {
          name: 'Apple',
          hidden: true,
        });
        await waitFor(() =>
          expect(dialog.contains(document.activeElement)).toBe(true),
        );
        fireEvent.keyDown(document.activeElement ?? document.body, {
          key: 'Escape',
        });
        await waitFor(() => expect(token).toHaveFocus());
      },
    );

    it('a press on a token released outside the field records no opener for a later dialog', async () => {
      function TokenFilters() {
        const handleRef = useRef<TokenizerHandle>(null);
        const [editing, setEditing] = useState<string | null>(null);
        return (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing('Apple');
                handleRef.current?.open();
              }}>
              Open from outside
            </button>
            <Tokenizer
              label="Filters"
              presentation="popover"
              searchSource={fruits}
              value={[{id: 'apple', label: 'Apple'}]}
              onChange={() => {}}
              handleRef={handleRef}
              onOpenChange={isOpen => {
                if (!isOpen) {
                  setEditing(null);
                }
              }}
              renderToken={item => (
                <button type="button">{`Edit ${item.label}`}</button>
              )}
              menu={
                editing == null
                  ? {role: 'listbox'}
                  : {
                      role: 'dialog',
                      label: editing,
                      render: () => <input aria-label="Value" />,
                    }
              }
            />
          </>
        );
      }
      render(<TokenFilters />);
      const token = screen.getByRole('button', {name: 'Edit Apple'});
      const outside = screen.getByRole('button', {name: 'Open from outside'});
      // A press on the token that ends outside the field: no click follows.
      fireEvent.pointerDown(token);
      fireEvent.pointerUp(document.body);
      act(() => outside.focus());
      fireEvent.click(outside);
      const dialog = await screen.findByRole('dialog', {
        name: 'Apple',
        hidden: true,
      });
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
      });
      await waitFor(() => expect(outside).toHaveFocus());
    });

    it('a token click that stops propagation records no opener for a later dialog', async () => {
      function TokenFilters() {
        const handleRef = useRef<TokenizerHandle>(null);
        const [editing, setEditing] = useState<string | null>(null);
        return (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing('Apple');
                handleRef.current?.open();
              }}>
              Open from outside
            </button>
            <Tokenizer
              label="Filters"
              presentation="popover"
              searchSource={fruits}
              value={[{id: 'apple', label: 'Apple'}]}
              onChange={() => {}}
              handleRef={handleRef}
              onOpenChange={isOpen => {
                if (!isOpen) {
                  setEditing(null);
                }
              }}
              renderToken={item => (
                <button
                  type="button"
                  onClick={event => event.stopPropagation()}>
                  {`Edit ${item.label}`}
                </button>
              )}
              menu={
                editing == null
                  ? {role: 'listbox'}
                  : {
                      role: 'dialog',
                      label: editing,
                      render: () => <input aria-label="Value" />,
                    }
              }
            />
          </>
        );
      }
      render(<TokenFilters />);
      const token = screen.getByRole('button', {name: 'Edit Apple'});
      const outside = screen.getByRole('button', {name: 'Open from outside'});
      // The token's click stops before it bubbles back to the field.
      fireEvent.click(token);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      act(() => outside.focus());
      fireEvent.click(outside);
      const dialog = await screen.findByRole('dialog', {
        name: 'Apple',
        hidden: true,
      });
      await waitFor(() =>
        expect(dialog.contains(document.activeElement)).toBe(true),
      );
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
      });
      await waitFor(() => expect(outside).toHaveFocus());
    });

    it("a click on a custom token's own control leaves focus on it", async () => {
      const user = userEvent.setup();
      render(
        <Tokenizer
          label="Filters"
          presentation="popover"
          searchSource={fruits}
          value={[{id: 'apple', label: 'Apple'}]}
          onChange={() => {}}
          renderToken={item => (
            <button type="button">{`Details ${item.label}`}</button>
          )}
        />,
      );
      const details = screen.getByRole('button', {name: 'Details Apple'});
      await user.click(details);
      expect(details).toHaveFocus();
    });

    it('a press on a token released outside the field still lets Tab land on the input', async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          <Tokenizer
            label="Filters"
            presentation="popover"
            searchSource={fruits}
            value={[{id: 'apple', label: 'Apple'}]}
            onChange={() => {}}
          />
        </>,
      );
      const remove = screen.getByRole('button', {name: /remove apple/i});
      // A press that starts on the token's control and is called off by
      // releasing it outside the field.
      fireEvent.pointerDown(remove);
      fireEvent.pointerUp(document.body);
      screen.getByRole('button', {name: 'Before'}).focus();
      await user.tab();
      expect(screen.getByRole('combobox', {name: 'Filters'})).toHaveFocus();
    });

    it('Tokenizer forwards the menu, the handle and onOpenChange', async () => {
      const handle = createRef<TokenizerHandle>();
      const onOpenChange = vi.fn();
      render(
        <Tokenizer
          label="Filters"
          presentation="popover"
          searchSource={fruits}
          value={[]}
          onChange={() => {}}
          handleRef={handle}
          onOpenChange={onOpenChange}
          menu={{role: 'dialog', label: 'Status', render: () => <p>Panel</p>}}
        />,
      );
      act(() => handle.current?.open());
      const dialog = await screen.findByRole('dialog', {
        name: 'Status',
        hidden: true,
      });
      expect(isLayerOpen(dialog)).toBe(true);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
      act(() => handle.current?.close());
      expect(isLayerOpen(dialog)).toBe(false);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });
  });
});
