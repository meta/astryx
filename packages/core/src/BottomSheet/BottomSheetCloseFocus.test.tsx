// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetCloseFocus.test.tsx
 * @input Uses vitest, @testing-library/react and BottomSheet
 * @output Tests the close order for focus: a sheet that closes with focus
 *   inside it is neither inert nor aria-hidden while that focus stays, takes
 *   no pointer or keyboard activation, and when the exit ends closes and
 *   returns focus to the opener; a sheet that focus leaves, or that closes
 *   with focus elsewhere, is inert and hidden at once
 * @position Core testing; validates the exit inertness in BottomSheet.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useRef, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheet} from './BottomSheet';
import {resetBottomSheetStackForTests} from './bottomSheetStack';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

beforeEach(() => {
  resetBottomSheetStackForTests();
  __resetInteractionModalityForTest();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Filters() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Filters
      </button>
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
        <button type="button" onClick={() => setIsOpen(false)}>
          Done
        </button>
      </BottomSheet>
    </>
  );
}

function sheet(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>(
    'dialog[aria-label="Filters"]',
  );
  if (dialog == null) {
    throw new Error('sheet not found');
  }
  return dialog;
}

function finishExit() {
  const panel = sheet().querySelector<HTMLElement>('.astryx-bottom-sheet');
  if (panel == null) {
    throw new Error('sheet panel not found');
  }
  fireEvent.transitionEnd(panel, {propertyName: 'transform'});
}

function openFilters() {
  render(<Filters />);
  const opener = screen.getByRole('button', {name: 'Filters'});
  act(() => opener.focus());
  fireEvent.click(opener);
  return opener;
}

describe('BottomSheet close order for focus', () => {
  it('keeps a closing sheet out of inert and aria-hidden while focus is inside', () => {
    openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());

    fireEvent.click(done);

    const dialog = sheet();
    expect(dialog).toHaveAttribute('open');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).not.toHaveAttribute('inert');
    expect(dialog).not.toHaveAttribute('aria-hidden');
    expect(done).toHaveFocus();
  });

  it('does not run the closing control again during the exit', () => {
    let presses = 0;
    function Counting() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
          <button
            type="button"
            onClick={() => {
              presses += 1;
              setIsOpen(false);
            }}>
            Done
          </button>
        </BottomSheet>
      );
    }
    render(<Counting />);
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());

    // The first activation closes; a repeated Enter or Space during the exit
    // dispatches another click on the still-focused control.
    fireEvent.click(done);
    fireEvent.click(done);

    expect(presses).toBe(1);
    expect(done).toHaveFocus();
  });

  it('does not pass Enter or Space to the focused control during the exit', () => {
    let submits = 0;
    function Search() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
          <input
            aria-label="Search"
            onKeyDown={event => {
              if (event.key === 'Enter') {
                submits += 1;
                setIsOpen(false);
              }
            }}
          />
        </BottomSheet>
      );
    }
    render(<Search />);
    const search = screen.getByRole('textbox', {name: 'Search'});
    act(() => search.focus());

    fireEvent.keyDown(search, {key: 'Enter'});
    fireEvent.keyDown(search, {key: 'Enter'});
    fireEvent.keyDown(search, {key: ' '});

    expect(submits).toBe(1);
    expect(search).toHaveFocus();
  });

  it('stops every key but Tab during the exit', () => {
    const keys: string[] = [];
    function Search() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
          <input
            aria-label="Search"
            onKeyDown={event => {
              keys.push(event.key);
              if (event.key === 'Enter') {
                setIsOpen(false);
              }
            }}
          />
        </BottomSheet>
      );
    }
    render(<Search />);
    const search = screen.getByRole('textbox', {name: 'Search'});
    act(() => search.focus());
    fireEvent.keyDown(search, {key: 'Enter'});

    const letter = fireEvent.keyDown(search, {key: 'a'});
    const backspace = fireEvent.keyDown(search, {key: 'Backspace'});
    const arrow = fireEvent.keyDown(search, {key: 'ArrowDown'});
    const tab = fireEvent.keyDown(search, {key: 'Tab'});

    // fireEvent returns false when the event was cancelled.
    expect([letter, backspace, arrow]).toEqual([false, false, false]);
    expect(tab).toBe(true);
    expect(keys).toEqual(['Enter', 'Tab']);
  });

  it('goes inert and hidden once its focused control is removed during the exit', async () => {
    function Removing({isDoneShown}: {isDoneShown: boolean}) {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
          {isDoneShown && (
            <button type="button" onClick={() => setIsOpen(false)}>
              Done
            </button>
          )}
        </BottomSheet>
      );
    }
    const {rerender} = render(<Removing isDoneShown />);
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());
    fireEvent.click(done);
    expect(sheet()).not.toHaveAttribute('inert');

    rerender(<Removing isDoneShown={false} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(sheet()).toHaveAttribute('inert');
    expect(sheet()).toHaveAttribute('aria-hidden', 'true');
  });

  it('goes inert and hidden once focus leaves it during the exit', async () => {
    openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());
    fireEvent.click(done);
    expect(sheet()).not.toHaveAttribute('inert');

    await act(async () => {
      screen.getByRole('button', {name: 'Filters'}).focus();
      await Promise.resolve();
    });

    expect(sheet()).toHaveAttribute('inert');
    expect(sheet()).toHaveAttribute('aria-hidden', 'true');
  });

  it('closes and returns focus to the opener when the exit ends', () => {
    const opener = openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => done.focus());
    fireEvent.click(done);

    finishExit();

    expect(opener).toHaveFocus();
    expect(sheet()).not.toHaveAttribute('open');
  });

  it('marks a closing sheet inert and hidden at once when focus is elsewhere', () => {
    openFilters();
    const done = screen.getByRole('button', {name: 'Done'});
    act(() => (document.activeElement as HTMLElement | null)?.blur());

    fireEvent.click(done);

    expect(sheet()).toHaveAttribute('inert');
    expect(sheet()).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('BottomSheet removed while open', () => {
  // A non-modal sheet is a manual popover; jsdom's stand-ins keep the same
  // `open` marker the dialog paths use, as the other BottomSheet tests do.
  beforeEach(() => {
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      this.setAttribute('open', '');
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      this.removeAttribute('open');
    });
  });

  // Lets the removal's focus repair run: it waits for the commit to finish.
  async function settle() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  function sheetNamed(label: string): HTMLDialogElement | null {
    return document.querySelector<HTMLDialogElement>(
      `dialog[aria-label="${label}"]`,
    );
  }

  function RenderedWhileOpen({
    hasScrim,
    withFinalFocus = false,
  }: {
    hasScrim: boolean;
    withFinalFocus?: boolean;
  }) {
    const [isOpen, setIsOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    return (
      <>
        <input aria-label="Search" ref={searchRef} />
        <button type="button" onClick={() => setIsOpen(true)}>
          Filters
        </button>
        {isOpen && (
          <BottomSheet
            isOpen
            onOpenChange={setIsOpen}
            label="Filters"
            hasScrim={hasScrim}
            finalFocusRef={withFinalFocus ? searchRef : undefined}>
            <button type="button" onClick={() => setIsOpen(false)}>
              Done
            </button>
          </BottomSheet>
        )}
      </>
    );
  }

  function openAndPressDone(element: React.ReactElement) {
    render(element);
    const opener = screen.getByRole('button', {name: 'Filters'});
    act(() => opener.focus());
    fireEvent.click(opener);
    const done = screen.getByRole('button', {name: 'Done', hidden: true});
    act(() => done.focus());
    fireEvent.click(done);
    return opener;
  }

  it.each([
    ['a modal', true],
    ['a non-modal', false],
  ])(
    'returns focus to the opener when %s sheet is removed from inside',
    async (_label, hasScrim) => {
      const opener = openAndPressDone(
        <RenderedWhileOpen hasScrim={hasScrim} />,
      );
      await settle();

      expect(sheetNamed('Filters')).toBeNull();
      expect(opener).toHaveFocus();
    },
  );

  it('leaves focus on the body when it rested there before a non-modal sheet was removed', async () => {
    function NonModal() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Filters
          </button>
          <button type="button" onClick={() => setIsOpen(false)}>
            Remove
          </button>
          {isOpen && (
            <BottomSheet
              isOpen
              onOpenChange={setIsOpen}
              label="Filters"
              hasScrim={false}>
              <button type="button">Done</button>
            </BottomSheet>
          )}
        </>
      );
    }
    render(<NonModal />);
    const opener = screen.getByRole('button', {name: 'Filters'});
    act(() => opener.focus());
    fireEvent.click(opener);
    // The person clicked the page behind the sheet: focus rests on the body.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(screen.getByRole('button', {name: 'Remove'}));
    await settle();

    expect(sheetNamed('Filters')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('returns focus to finalFocusRef when one is given', async () => {
    openAndPressDone(<RenderedWhileOpen hasScrim withFinalFocus />);
    await settle();

    expect(screen.getByRole('textbox', {name: 'Search'})).toHaveFocus();
  });

  it('moves no focus when the opener was removed too', async () => {
    function View() {
      const [isShown, setIsShown] = useState(true);
      const [isOpen, setIsOpen] = useState(false);
      return isShown ? (
        <div>
          <button type="button" onClick={() => setIsOpen(true)}>
            Filters
          </button>
          {isOpen && (
            <BottomSheet isOpen onOpenChange={setIsOpen} label="Filters">
              <button type="button" onClick={() => setIsShown(false)}>
                Done
              </button>
            </BottomSheet>
          )}
        </div>
      ) : null;
    }
    openAndPressDone(<View />);
    await settle();

    expect(sheetNamed('Filters')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('returns focus into the revealed sheet when the top sheet is removed', async () => {
    function Stack() {
      const [isOpen, setIsOpen] = useState(false);
      const [isSortOpen, setIsSortOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Filters
          </button>
          <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
            <button type="button" onClick={() => setIsSortOpen(true)}>
              Sort
            </button>
            {isSortOpen && (
              <BottomSheet isOpen onOpenChange={setIsSortOpen} label="Sort by">
                <button type="button" onClick={() => setIsSortOpen(false)}>
                  Done
                </button>
              </BottomSheet>
            )}
          </BottomSheet>
        </>
      );
    }
    render(<Stack />);
    fireEvent.click(screen.getByRole('button', {name: 'Filters'}));
    const sort = screen.getByRole('button', {name: 'Sort', hidden: true});
    act(() => sort.focus());
    fireEvent.click(sort);
    const done = screen.getByRole('button', {name: 'Done', hidden: true});
    act(() => done.focus());

    fireEvent.click(done);
    await settle();

    expect(sheetNamed('Sort by')).toBeNull();
    expect(sort).toHaveFocus();
  });

  it('returns focus to the first opener when a whole stack is removed', async () => {
    function Stack() {
      const [isOpen, setIsOpen] = useState(false);
      const [isSortOpen, setIsSortOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Filters
          </button>
          {isOpen && (
            <BottomSheet isOpen onOpenChange={setIsOpen} label="Filters">
              <button type="button" onClick={() => setIsSortOpen(true)}>
                Sort
              </button>
              {isSortOpen && (
                <BottomSheet
                  isOpen
                  onOpenChange={setIsSortOpen}
                  label="Sort by">
                  <button type="button" onClick={() => setIsOpen(false)}>
                    Apply all
                  </button>
                </BottomSheet>
              )}
            </BottomSheet>
          )}
        </>
      );
    }
    render(<Stack />);
    const opener = screen.getByRole('button', {name: 'Filters'});
    act(() => opener.focus());
    fireEvent.click(opener);
    const sort = screen.getByRole('button', {name: 'Sort', hidden: true});
    act(() => sort.focus());
    fireEvent.click(sort);
    const applyAll = screen.getByRole('button', {
      name: 'Apply all',
      hidden: true,
    });
    act(() => applyAll.focus());

    fireEvent.click(applyAll);
    await settle();

    expect(sheetNamed('Filters')).toBeNull();
    expect(sheetNamed('Sort by')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('returns focus to the bottom sheet opener when a sibling stack declared top first is removed', async () => {
    function Siblings() {
      const [isOpen, setIsOpen] = useState(false);
      const [isSortOpen, setIsSortOpen] = useState(false);
      const searchRef = useRef<HTMLInputElement>(null);
      return (
        <>
          <input aria-label="Search" ref={searchRef} />
          <button type="button" onClick={() => setIsOpen(true)}>
            Filters
          </button>
          {isOpen && isSortOpen && (
            <BottomSheet
              isOpen
              onOpenChange={setIsSortOpen}
              label="Sort by"
              finalFocusRef={searchRef}>
              <button type="button" onClick={() => setIsOpen(false)}>
                Apply all
              </button>
            </BottomSheet>
          )}
          {isOpen && (
            <BottomSheet isOpen onOpenChange={setIsOpen} label="Filters">
              <button type="button" onClick={() => setIsSortOpen(true)}>
                Sort
              </button>
            </BottomSheet>
          )}
        </>
      );
    }
    render(<Siblings />);
    const opener = screen.getByRole('button', {name: 'Filters'});
    act(() => opener.focus());
    fireEvent.click(opener);
    const sort = screen.getByRole('button', {name: 'Sort', hidden: true});
    act(() => sort.focus());
    fireEvent.click(sort);
    const applyAll = screen.getByRole('button', {
      name: 'Apply all',
      hidden: true,
    });
    act(() => applyAll.focus());

    fireEvent.click(applyAll);
    await settle();

    expect(sheetNamed('Filters')).toBeNull();
    expect(sheetNamed('Sort by')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('moves no focus when a covered sheet is removed under a top sheet that stays', async () => {
    function Siblings() {
      const [isFiltersShown, setIsFiltersShown] = useState(true);
      const [isSortOpen, setIsSortOpen] = useState(false);
      return (
        <>
          {isFiltersShown && (
            <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
              <button type="button" onClick={() => setIsSortOpen(true)}>
                Sort
              </button>
            </BottomSheet>
          )}
          <BottomSheet
            isOpen={isSortOpen}
            onOpenChange={setIsSortOpen}
            label="Sort by">
            <button type="button" onClick={() => setIsFiltersShown(false)}>
              Remove filters
            </button>
          </BottomSheet>
        </>
      );
    }
    render(<Siblings />);
    const sort = screen.getByRole('button', {name: 'Sort', hidden: true});
    act(() => sort.focus());
    fireEvent.click(sort);
    const remove = screen.getByRole('button', {
      name: 'Remove filters',
      hidden: true,
    });
    act(() => remove.focus());

    fireEvent.click(remove);
    await settle();

    expect(sheetNamed('Filters')).toBeNull();
    expect(remove).toHaveFocus();
  });

  it('leaves focus in a sheet that opens in the update that removes this one', async () => {
    function Flow() {
      const [step, setStep] = useState<'none' | 'filters' | 'sort'>('none');
      return (
        <>
          <button type="button" onClick={() => setStep('filters')}>
            Filters
          </button>
          {step === 'filters' && (
            <BottomSheet
              isOpen
              onOpenChange={() => setStep('none')}
              label="Filters">
              <button type="button" onClick={() => setStep('sort')}>
                Next
              </button>
            </BottomSheet>
          )}
          {step === 'sort' && (
            <BottomSheet
              isOpen
              onOpenChange={() => setStep('none')}
              label="Sort by">
              <button type="button">Apply</button>
            </BottomSheet>
          )}
        </>
      );
    }
    render(<Flow />);
    const opener = screen.getByRole('button', {name: 'Filters'});
    act(() => opener.focus());
    fireEvent.click(opener);
    const next = screen.getByRole('button', {name: 'Next', hidden: true});
    act(() => next.focus());

    fireEvent.click(next);
    await settle();

    const sortSheet = sheetNamed('Sort by');
    expect(sortSheet).not.toBeNull();
    expect(sortSheet?.contains(document.activeElement)).toBe(true);
    expect(opener).not.toHaveFocus();
  });
});
