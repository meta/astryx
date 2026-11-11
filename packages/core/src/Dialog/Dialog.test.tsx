// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.test.tsx
 * @input Uses vitest, @testing-library/react, Dialog component
 * @output Unit tests for Dialog component behavior
 * @position Testing; validates Dialog.tsx implementation
 *
 * SYNC: When Dialog.tsx changes, update tests to match new behavior
 */

import {
  StrictMode,
  useLayoutEffect,
  useState,
  type SyntheticEvent,
} from 'react';
import {readFileSync} from 'node:fs';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {MockInstance} from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from '@testing-library/react';
import {createPortal} from 'react-dom';
import {
  Dialog,
  dialogFullscreenSafeAreaPaddingContract,
  resolveDialogPositionOffsets,
} from './Dialog';
import {DialogHeader} from './DialogHeader';
import {getFocusableElements, useFocusTrap} from '../hooks/useFocusTrap';
import {useDialogContext} from './DialogContext';
import {defineTheme, generateThemeCSS} from '../theme';
import {
  __resetInteractionModalityForTest,
  getInteractionModality,
} from '../utils/interactionModality';

function generateThemeTestCSS(
  theme: Parameters<typeof generateThemeCSS>[0],
): string {
  return Object.values(generateThemeCSS(theme)).join('\n');
}

function extractConstDeclaration(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = stylex.keyframes({`);
  if (start === -1) {
    throw new Error(`Missing ${name} keyframes`);
  }

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 3);
      }
    }
  }

  throw new Error(`Unterminated ${name} keyframes`);
}

function extractThemeVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const match of css.matchAll(/(--astryx-dialog-[\w-]+):\s*([^;]+);/g)) {
    vars.set(match[1], match[2].trim());
  }
  return vars;
}

function resolveCSSVarFallback(
  value: string,
  vars: ReadonlyMap<string, string>,
): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('var(') || !trimmed.endsWith(')')) {
    return trimmed;
  }

  const inner = trimmed.slice(4, -1);
  let depth = 0;
  let commaIndex = -1;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      commaIndex = index;
      break;
    }
  }

  const varName = (
    commaIndex === -1 ? inner : inner.slice(0, commaIndex)
  ).trim();
  const fallback = commaIndex === -1 ? '' : inner.slice(commaIndex + 1).trim();
  return vars.has(varName)
    ? vars.get(varName)!
    : resolveCSSVarFallback(fallback, vars);
}

function normalizeCSSValue(value: string): string {
  return value.replace(/\s+/g, '');
}

// Mock showModal and close methods since they're not fully implemented in jsdom
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

describe('Dialog', () => {
  // AR2: a dialog that unmounts while open (rendered only while open, or
  // removed with the rest of a view) returns focus to its opener, as a close
  // does.
  describe('unmounting while open', () => {
    function Editor({unmountWith}: {unmountWith: 'save' | 'view'}) {
      const [isEditing, setIsEditing] = useState(false);
      const [showView, setShowView] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsEditing(true)}>
            Edit
          </button>
          {showView && isEditing ? (
            <Dialog
              isOpen
              onOpenChange={setIsEditing}
              aria-label="Edit profile">
              <button
                type="button"
                onClick={() =>
                  unmountWith === 'save'
                    ? setIsEditing(false)
                    : setShowView(false)
                }>
                Save
              </button>
            </Dialog>
          ) : null}
        </>
      );
    }

    it.each([['save'], ['view']] as const)(
      'returns focus to the opener when the dialog unmounts (%s)',
      async unmountWith => {
        render(<Editor unmountWith={unmountWith} />);
        const edit = screen.getByRole('button', {name: 'Edit'});
        edit.focus();
        fireEvent.click(edit);
        const save = screen.getByRole('button', {name: 'Save'});
        save.focus();

        fireEvent.click(save);
        await Promise.resolve();

        expect(screen.queryByRole('button', {name: 'Save'})).toBeNull();
        expect(document.activeElement).toBe(edit);
      },
    );

    it('keeps focus inside an open dialog through StrictMode effects, then returns it on unmount', async () => {
      render(
        <StrictMode>
          <Editor unmountWith="save" />
        </StrictMode>,
      );
      const edit = screen.getByRole('button', {name: 'Edit'});
      edit.focus();
      fireEvent.click(edit);
      const save = screen.getByRole('button', {name: 'Save'});
      save.focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(save);

      fireEvent.click(save);
      await Promise.resolve();

      expect(document.activeElement).toBe(edit);
    });

    // The case table for a dialog that disappears while it is open. Focus
    // goes back to the opener only when the removal lost it: it was inside
    // the dialog, or nowhere. A control the user pressed outside the dialog
    // (or outside the frame that holds it) keeps its focus, and an opener
    // that left with a removed frame gets nothing.
    type Place = 'page' | 'frame';
    type Row = {
      dialogIn: Place;
      openerIn: Place;
      removed: 'dialog' | 'frame';
      focusBefore: 'inside' | 'pageControl' | 'nowhere';
      expected: 'opener' | 'pageControl' | 'nothing';
    };
    const rows: Row[] = [
      {
        dialogIn: 'page',
        openerIn: 'page',
        removed: 'dialog',
        focusBefore: 'inside',
        expected: 'opener',
      },
      {
        dialogIn: 'page',
        openerIn: 'page',
        removed: 'dialog',
        focusBefore: 'nowhere',
        expected: 'opener',
      },
      {
        dialogIn: 'page',
        openerIn: 'page',
        removed: 'dialog',
        focusBefore: 'pageControl',
        expected: 'pageControl',
      },
      {
        dialogIn: 'frame',
        openerIn: 'page',
        removed: 'dialog',
        focusBefore: 'inside',
        expected: 'opener',
      },
      {
        dialogIn: 'frame',
        openerIn: 'page',
        removed: 'dialog',
        focusBefore: 'nowhere',
        expected: 'opener',
      },
      {
        dialogIn: 'frame',
        openerIn: 'page',
        removed: 'dialog',
        focusBefore: 'pageControl',
        expected: 'pageControl',
      },
      {
        dialogIn: 'frame',
        openerIn: 'page',
        removed: 'frame',
        focusBefore: 'inside',
        expected: 'opener',
      },
      {
        dialogIn: 'frame',
        openerIn: 'page',
        removed: 'frame',
        focusBefore: 'pageControl',
        expected: 'pageControl',
      },
      {
        dialogIn: 'frame',
        openerIn: 'frame',
        removed: 'dialog',
        focusBefore: 'inside',
        expected: 'opener',
      },
      {
        dialogIn: 'frame',
        openerIn: 'frame',
        removed: 'dialog',
        focusBefore: 'pageControl',
        expected: 'pageControl',
      },
      {
        dialogIn: 'frame',
        openerIn: 'frame',
        removed: 'frame',
        focusBefore: 'inside',
        expected: 'nothing',
      },
      {
        dialogIn: 'frame',
        openerIn: 'frame',
        removed: 'frame',
        focusBefore: 'pageControl',
        expected: 'pageControl',
      },
    ];

    it.each(rows)(
      'dialog in $dialogIn, opener in $openerIn, $removed removed, focus $focusBefore: focus goes to $expected',
      async ({dialogIn, openerIn, removed, focusBefore, expected}) => {
        const needsFrame = dialogIn === 'frame' || openerIn === 'frame';
        const frame = needsFrame ? document.createElement('iframe') : null;
        if (frame != null) {
          document.body.append(frame);
          // jsdom gives each document its own HTMLDialogElement prototype.
          const {prototype} =
            frame.contentDocument!.defaultView!.HTMLDialogElement;
          prototype.showModal = HTMLDialogElement.prototype.showModal;
          prototype.close = HTMLDialogElement.prototype.close;
        }
        const into = (place: Place, node: React.ReactNode): React.ReactNode =>
          place === 'frame'
            ? createPortal(node, frame!.contentDocument!.body)
            : node;
        let setOpen: (isOpen: boolean) => void = () => {};
        function Harness() {
          const [isOpen, setIsOpen] = useState(false);
          setOpen = setIsOpen;
          return (
            <>
              {into(
                openerIn,
                <button type="button" onClick={() => setIsOpen(true)}>
                  Opener
                </button>,
              )}
              {isOpen
                ? into(
                    dialogIn,
                    <Dialog isOpen onOpenChange={setIsOpen} aria-label="Case">
                      <button type="button">Inside</button>
                    </Dialog>,
                  )
                : null}
              <button type="button">Page control</button>
            </>
          );
        }
        // Focus in a frame is also the frame element's focus in the page,
        // as in a browser.
        const focusIn = (element: HTMLElement) => {
          if (frame != null && element.ownerDocument !== document) {
            frame.focus();
          }
          element.focus();
        };
        const findIn = (place: Place, name: string) =>
          Array.from(
            (place === 'frame'
              ? frame!.contentDocument!
              : document
            ).querySelectorAll('button'),
          ).find(button => button.textContent === name)!;

        const {unmount} = render(<Harness />);
        const opener = findIn(openerIn, 'Opener');
        focusIn(opener);
        act(() => setOpen(true));
        const pageControl = findIn('page', 'Page control');
        if (focusBefore === 'inside') {
          focusIn(findIn(dialogIn, 'Inside'));
        } else if (focusBefore === 'pageControl') {
          pageControl.focus();
        } else {
          (document.activeElement as HTMLElement | null)?.blur();
          (frame?.contentDocument?.activeElement as HTMLElement | null)?.blur();
        }

        // The dialog unmounts; a removed frame goes in the same task,
        // before the focus check runs.
        act(() => setOpen(false));
        if (removed === 'frame') {
          frame!.remove();
          // A browser drops a removed frame's window; jsdom keeps it.
          Object.defineProperty(frame!.contentDocument ?? {}, 'defaultView', {
            configurable: true,
            get: () => null,
          });
        }
        await Promise.resolve();

        if (expected === 'opener') {
          expect(opener.ownerDocument.activeElement).toBe(opener);
        } else if (expected === 'pageControl') {
          expect(document.activeElement).toBe(pageControl);
        } else {
          expect(opener.isConnected).toBe(false);
          expect(document.activeElement).not.toBe(opener);
        }

        try {
          unmount();
        } catch (error) {
          // jsdom empties a removed frame's document, so React can no longer
          // take a portal out of it; a browser keeps the nodes.
          if (removed !== 'frame' || !String(error).includes('not a child')) {
            throw error;
          }
        }
        frame?.remove();
      },
    );
  });

  it('focuses the title of a header that mounts with the opening commit only after the dialog is modal', () => {
    const order: string[] = [];
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      order.push(`showModal open=${this.open}`);
      showModal.call(this);
    });
    const focus = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLElement) {
        if (this.tagName === 'H2') {
          order.push(`title focus open=${this.closest('dialog')?.open}`);
        }
      });
    function Harness({open}: {open: boolean}) {
      return (
        <Dialog isOpen={open} onOpenChange={() => {}}>
          {open ? <DialogHeader title="Review" /> : null}
        </Dialog>
      );
    }
    const harness = render(<Harness open={false} />);
    harness.rerender(<Harness open />);
    focus.mockRestore();
    expect(order).toEqual(['showModal open=false', 'title focus open=true']);
  });

  it('restores focus to the opener when content mounts in the open commit', () => {
    function Harness({
      open,
      onOpenChange,
    }: {
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) {
      return (
        <>
          <button type="button" onClick={() => onOpenChange(true)}>
            Open
          </button>
          <Dialog isOpen={open} onOpenChange={onOpenChange}>
            {open ? (
              <div>
                <DialogHeader title="Review" />
                <p>Body</p>
              </div>
            ) : null}
          </Dialog>
        </>
      );
    }

    let open = false;
    const setOpen = (v: boolean) => {
      open = v;
    };
    const harness = render(<Harness open={open} onOpenChange={setOpen} />);
    const opener = screen.getByRole('button', {name: 'Open'});
    opener.focus();

    fireEvent.click(opener);
    harness.rerender(<Harness open={open} onOpenChange={setOpen} />);

    // The freshly mounted header title is the focused screen reader anchor
    // while the dialog is open...
    expect(document.activeElement).toBe(screen.getByText('Review'));

    // ...but closing restores the element that opened the dialog, not the
    // (now unmounted) title.
    harness.rerender(<Harness open={false} onOpenChange={setOpen} />);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps the opener when StrictMode re-runs the capture on a dialog first mounted open', () => {
    // StrictMode simulates an unmount/remount after the first commit, which
    // re-runs the layout effect AFTER DialogHeader's own passive effect has
    // already focused the title. Capturing on every run would take the title
    // as the opener, and closing would return focus to a node about to unmount.
    const opener = document.createElement('button');
    opener.type = 'button';
    document.body.appendChild(opener);
    opener.focus();

    const {rerender} = render(
      <StrictMode>
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <DialogHeader title="Review" />
        </Dialog>
      </StrictMode>,
    );
    expect(document.activeElement).toBe(screen.getByText('Review'));

    rerender(
      <StrictMode>
        <Dialog isOpen={false} onOpenChange={() => {}}>
          {null}
        </Dialog>
      </StrictMode>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('captures a fresh opener on each open, not only the first', () => {
    const first = document.createElement('button');
    const second = document.createElement('button');
    for (const b of [first, second]) {
      b.type = 'button';
      document.body.appendChild(b);
    }
    // Content mounts only while open, as it does in the other opener test.
    const dialog = (isOpen: boolean) => (
      <Dialog isOpen={isOpen} onOpenChange={() => {}}>
        {isOpen ? <DialogHeader title="Review" /> : null}
      </Dialog>
    );

    first.focus();
    const {rerender} = render(dialog(false));
    rerender(dialog(true));
    rerender(dialog(false));
    expect(document.activeElement).toBe(first);

    second.focus();
    rerender(dialog(true));
    rerender(dialog(false));
    expect(document.activeElement).toBe(second);

    first.remove();
    second.remove();
  });

  it('renders when isOpen is true', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        Dialog content
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dialog content')).toBeInTheDocument();
  });

  it('calls showModal when opened', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        Content
      </Dialog>,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('does not show when isOpen is false', () => {
    render(
      <Dialog isOpen={false} onOpenChange={() => {}}>
        Hidden content
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog).not.toHaveAttribute('open');
  });

  it('has aria-modal attribute', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        Content
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('honors an initial-focus request from an action descendant', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        <DialogHeader title="Choose an action" />
        <button type="button" data-autofocus>
          Continue
        </button>
      </Dialog>,
    );

    expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
  });

  it('skips a hidden or inert initial-focus request for the next eligible one', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        <div hidden>
          <button type="button" data-autofocus>
            Hidden
          </button>
        </div>
        <div inert>
          <button type="button" data-autofocus>
            Inert
          </button>
        </div>
        <button type="button" data-autofocus>
          Continue
        </button>
      </Dialog>,
    );

    expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
  });

  it('honors its own initial-focus request inside an inert region of the page', () => {
    render(
      <div inert>
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <button type="button" data-autofocus>
            Continue
          </button>
        </Dialog>
      </div>,
    );

    expect(
      screen.getByRole('button', {name: 'Continue', hidden: true}),
    ).toHaveFocus();
  });

  it('falls through an initial-focus request that cannot take focus', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        <button type="button" disabled data-autofocus>
          Unavailable
        </button>
        <button type="button" data-autofocus>
          Continue
        </button>
      </Dialog>,
    );

    expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
  });

  it("honors an explicit request before a header's title request", () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        <h2 tabIndex={-1} data-autofocus="dialog-title">
          Hero title
        </h2>
        <button type="button" data-autofocus>
          Continue
        </button>
      </Dialog>,
    );

    expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
  });

  it("focuses a header's title request when no explicit request is eligible", () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}}>
        <h2 tabIndex={-1} data-autofocus="dialog-title">
          Hero title
        </h2>
        <div hidden>
          <button type="button" data-autofocus>
            Hidden
          </button>
        </div>
      </Dialog>,
    );

    expect(screen.getByRole('heading', {name: 'Hero title'})).toHaveFocus();
  });

  describe('purpose: info (default)', () => {
    it('calls onOpenChange(false) when Escape is pressed', () => {
      const handleHide = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={handleHide} purpose="info">
          Content
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      dialog.dispatchEvent(escapeEvent);
      expect(handleHide).toHaveBeenCalledTimes(1);
    });
  });

  describe('purpose: form', () => {
    it('calls onOpenChange(false) when Escape is pressed', () => {
      const handleHide = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={handleHide} purpose="form">
          Content
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      dialog.dispatchEvent(escapeEvent);
      expect(handleHide).toHaveBeenCalledTimes(1);
    });
  });

  describe('purpose: required', () => {
    it('does not call onOpenChange when Escape is pressed', () => {
      const handleHide = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={handleHide} purpose="required">
          Content
        </Dialog>,
      );

      const dialog = screen.getByRole('alertdialog');
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      dialog.dispatchEvent(escapeEvent);
      expect(handleHide).not.toHaveBeenCalled();
    });

    it('prevents default on cancel event', () => {
      const handleHide = vi.fn();
      render(
        <Dialog isOpen={true} onOpenChange={handleHide} purpose="required">
          Content
        </Dialog>,
      );

      const dialog = screen.getByRole('alertdialog');
      const cancelEvent = new Event('cancel', {cancelable: true});
      dialog.dispatchEvent(cancelEvent);

      expect(cancelEvent.defaultPrevented).toBe(true);
      expect(handleHide).not.toHaveBeenCalled();
    });
  });

  describe('a cancel from inside the dialog', () => {
    // A file input fires a bubbling `cancel` at itself when its picker is
    // dismissed (Escape, or Cancel in the chooser). It reaches the <dialog>
    // like a close request but is not one.
    function DialogWithFilePicker({onOpenChange}: {onOpenChange: () => void}) {
      return (
        <Dialog isOpen onOpenChange={onOpenChange} aria-label="Upload">
          <input type="file" aria-label="Picture" />
        </Dialog>
      );
    }

    it('stays open when a file picker inside it is dismissed', () => {
      const onOpenChange = vi.fn();
      render(<DialogWithFilePicker onOpenChange={onOpenChange} />);

      const fromPicker = new Event('cancel', {bubbles: true, cancelable: true});
      screen.getByLabelText('Picture').dispatchEvent(fromPicker);

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(fromPicker.defaultPrevented).toBe(false);
    });

    it('still closes on its own close request', () => {
      const onOpenChange = vi.fn();
      render(<DialogWithFilePicker onOpenChange={onOpenChange} />);

      screen
        .getByLabelText('Picture')
        .dispatchEvent(new Event('cancel', {bubbles: true, cancelable: true}));
      screen
        .getByRole('dialog')
        .dispatchEvent(new Event('cancel', {cancelable: true}));

      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('IME composition', () => {
    // A CJK user presses Escape to cancel a half-formed character several times
    // a sentence. jsdom models neither composition nor the close watcher, so
    // these pin the wiring; the behaviour itself is measured in Chromium
    // against the Layer Dismissal stories.
    function DialogWithField({onOpenChange}: {onOpenChange: () => void}) {
      return (
        <Dialog isOpen onOpenChange={onOpenChange} aria-label="Filters">
          <input aria-label="Search" />
        </Dialog>
      );
    }

    it('claims the composing Escape instead of letting the browser act', () => {
      const onOpenChange = vi.fn();
      render(<DialogWithField onOpenChange={onOpenChange} />);

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'isComposing', {value: true});
      screen.getByRole('textbox', {name: 'Search'}).dispatchEvent(event);

      // Unclaimed, this press becomes a close request that arrives at
      // handleCancel and closes the dialog on the same keystroke.
      expect(event.defaultPrevented).toBe(true);
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('ignores a close request that arrives mid-composition', () => {
      // The back gesture and the platform close watcher carry no composition
      // state, so the dialog asks the stack rather than the event.
      const onOpenChange = vi.fn();
      render(<DialogWithField onOpenChange={onOpenChange} />);
      const field = screen.getByRole('textbox', {name: 'Search'});

      fireEvent.compositionStart(field);
      const duringComposition = new Event('cancel', {cancelable: true});
      screen.getByRole('dialog').dispatchEvent(duringComposition);

      expect(duringComposition.defaultPrevented).toBe(true);
      expect(onOpenChange).not.toHaveBeenCalled();

      fireEvent.compositionEnd(field);
      screen
        .getByRole('dialog')
        .dispatchEvent(new Event('cancel', {cancelable: true}));

      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('nested-modal dismissal', () => {
    function NestedModals({
      isInnerOpen,
      onOuterChange,
      onInnerChange,
    }: {
      isInnerOpen: boolean;
      onOuterChange: (isOpen: boolean) => void;
      onInnerChange: (isOpen: boolean) => void;
    }) {
      return (
        <Dialog
          isOpen={true}
          onOpenChange={onOuterChange}
          purpose="info"
          aria-label="Outer">
          Outer content
          <Dialog
            isOpen={isInnerOpen}
            onOpenChange={onInnerChange}
            purpose="info"
            aria-label="Inner">
            Inner content
          </Dialog>
        </Dialog>
      );
    }

    const getDialog = (label: string) =>
      screen
        .getAllByRole('dialog', {hidden: true})
        .find(d => d.getAttribute('aria-label') === label)!;

    const pressEscape = (target: Element) => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    it('closes only the inner modal, not the outer, on Escape', () => {
      const onOuterChange = vi.fn();
      const onInnerChange = vi.fn();

      render(
        <NestedModals
          isInnerOpen={true}
          onOuterChange={onOuterChange}
          onInnerChange={onInnerChange}
        />,
      );

      const outer = getDialog('Outer');
      const inner = getDialog('Inner');
      expect(outer.contains(inner)).toBe(true);

      pressEscape(inner);

      expect(onInnerChange).toHaveBeenCalledTimes(1);
      expect(onInnerChange).toHaveBeenCalledWith(false);
      expect(onOuterChange).not.toHaveBeenCalled();
    });

    it('closes the outer modal on the next Escape once the inner one is gone', () => {
      const onOuterChange = vi.fn();
      const onInnerChange = vi.fn();

      const {rerender} = render(
        <NestedModals
          isInnerOpen={true}
          onOuterChange={onOuterChange}
          onInnerChange={onInnerChange}
        />,
      );
      rerender(
        <NestedModals
          isInnerOpen={false}
          onOuterChange={onOuterChange}
          onInnerChange={onInnerChange}
        />,
      );

      pressEscape(getDialog('Outer'));

      expect(onOuterChange).toHaveBeenCalledTimes(1);
      expect(onOuterChange).toHaveBeenCalledWith(false);
      expect(onInnerChange).not.toHaveBeenCalled();
    });

    it('closes the top-most modal on a browser-initiated cancel', () => {
      const onOuterChange = vi.fn();
      const onInnerChange = vi.fn();

      render(
        <NestedModals
          isInnerOpen={true}
          onOuterChange={onOuterChange}
          onInnerChange={onInnerChange}
        />,
      );

      const cancelEvent = new Event('cancel', {cancelable: true});
      getDialog('Inner').dispatchEvent(cancelEvent);

      expect(cancelEvent.defaultPrevented).toBe(true);
      expect(onInnerChange).toHaveBeenCalledTimes(1);
      expect(onInnerChange).toHaveBeenCalledWith(false);
      expect(onOuterChange).not.toHaveBeenCalled();
    });

    it('leaves a modal that is not top-most open on a browser-initiated cancel', () => {
      const onOuterChange = vi.fn();
      const onInnerChange = vi.fn();

      render(
        <NestedModals
          isInnerOpen={true}
          onOuterChange={onOuterChange}
          onInnerChange={onInnerChange}
        />,
      );

      const cancelEvent = new Event('cancel', {cancelable: true});
      getDialog('Outer').dispatchEvent(cancelEvent);

      expect(cancelEvent.defaultPrevented).toBe(true);
      expect(onOuterChange).not.toHaveBeenCalled();
      expect(onInnerChange).not.toHaveBeenCalled();
    });
  });

  describe('focus restoration', () => {
    it('closes without error when the captured invoker is removed', () => {
      function RemovedInvokerExample() {
        const [isOpen, setIsOpen] = useState(false);
        const [showInvoker, setShowInvoker] = useState(true);
        return (
          <>
            {showInvoker && (
              <button type="button" onClick={() => setIsOpen(true)}>
                Open dialog
              </button>
            )}
            <Dialog
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              aria-label="Review changes">
              <button type="button" onClick={() => setShowInvoker(false)}>
                Remove opener
              </button>
              <button type="button" onClick={() => setIsOpen(false)}>
                Close dialog
              </button>
            </Dialog>
          </>
        );
      }

      render(<RemovedInvokerExample />);
      const invoker = screen.getByRole('button', {name: 'Open dialog'});
      invoker.focus();
      fireEvent.click(invoker);
      const dialog = screen.getByRole('dialog');

      fireEvent.click(screen.getByRole('button', {name: 'Remove opener'}));
      expect(invoker.isConnected).toBe(false);

      expect(() => {
        fireEvent.click(screen.getByRole('button', {name: 'Close dialog'}));
      }).not.toThrow();
      expect(dialog).not.toHaveAttribute('open');
    });

    describe('in a second document', () => {
      // An app can render a Dialog into a same-origin iframe or a Document
      // Picture-in-Picture window through a portal. The control that opens it
      // is focused in that document; the page's document reports only the
      // iframe element.
      let frame: HTMLIFrameElement;
      let secondDocument: Document;

      beforeEach(() => {
        frame = document.createElement('iframe');
        document.body.appendChild(frame);
        secondDocument = frame.contentDocument!;
        // The showModal/close stand-ins above, on the second window's own
        // prototype.
        const {prototype} = secondDocument.defaultView!.HTMLDialogElement;
        prototype.showModal = HTMLDialogElement.prototype.showModal;
        prototype.close = HTMLDialogElement.prototype.close;
      });

      afterEach(() => {
        // Unmount before the frame goes, or React removes nodes from a
        // document that no longer exists.
        cleanup();
        frame.remove();
      });

      function SecondDocumentDialog({isOpen}: {isOpen: boolean}) {
        return createPortal(
          <>
            <button type="button">Open dialog</button>
            <Dialog isOpen={isOpen} onOpenChange={() => {}} aria-label="Review">
              <button type="button">Inside</button>
            </Dialog>
          </>,
          secondDocument.body,
        );
      }

      function PageOpensSecondDocumentDialog({isOpen}: {isOpen: boolean}) {
        return (
          <>
            <button type="button">Open from the page</button>
            {createPortal(
              <Dialog
                isOpen={isOpen}
                onOpenChange={() => {}}
                aria-label="Review">
                <button type="button">Inside</button>
              </Dialog>,
              secondDocument.body,
            )}
          </>
        );
      }

      it("honors an explicit request before a header's title request", () => {
        render(
          createPortal(
            <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Review">
              <h2 tabIndex={-1} data-autofocus="dialog-title">
                Hero title
              </h2>
              <button type="button" data-autofocus>
                Continue
              </button>
            </Dialog>,
            secondDocument.body,
          ),
        );

        const continueButton = secondDocument.querySelector('button')!;
        expect(secondDocument.activeElement).toBe(continueButton);
      });

      function SecondDocumentFieldDialog({isOpen}: {isOpen: boolean}) {
        return createPortal(
          <>
            <input aria-label="Search" />
            <Dialog isOpen={isOpen} onOpenChange={() => {}} aria-label="Review">
              <button type="button">Inside</button>
            </Dialog>
          </>,
          secondDocument.body,
        );
      }

      function SecondDocumentDialogs({count}: {count: number}) {
        return createPortal(
          <>
            {count > 0 && (
              <Dialog isOpen={false} onOpenChange={() => {}} aria-label="First">
                First
              </Dialog>
            )}
            {count > 1 && (
              <Dialog
                isOpen={false}
                onOpenChange={() => {}}
                aria-label="Second">
                Second
              </Dialog>
            )}
          </>,
          secondDocument.body,
        );
      }

      it('returns focus to the control that opened it, in its own document', () => {
        const {rerender} = render(<SecondDocumentDialog isOpen={false} />);
        const view = within(secondDocument.body);
        const opener = view.getByRole('button', {name: 'Open dialog'});
        opener.focus();
        expect(document.activeElement).toBe(frame);

        rerender(<SecondDocumentDialog isOpen={true} />);
        view.getByRole('button', {name: 'Inside', hidden: true}).focus();

        rerender(<SecondDocumentDialog isOpen={false} />);
        expect(opener).toHaveFocus();
      });

      it('returns focus to a control in the page that opened it', () => {
        const {rerender} = render(
          <PageOpensSecondDocumentDialog isOpen={false} />,
        );
        const opener = screen.getByRole('button', {name: 'Open from the page'});
        opener.focus();

        rerender(<PageOpensSecondDocumentDialog isOpen={true} />);
        within(secondDocument.body)
          .getByRole('button', {name: 'Inside', hidden: true})
          .focus();

        rerender(<PageOpensSecondDocumentDialog isOpen={false} />);
        expect(opener).toHaveFocus();
      });

      it('takes the ring from the last input in its own document', () => {
        __resetInteractionModalityForTest();
        const {rerender} = render(<SecondDocumentDialog isOpen={false} />);
        const opener = within(secondDocument.body).getByRole('button', {
          name: 'Open dialog',
        });
        // The page's last input was a pointer press (say, on the control that
        // popped the window out); the dialog then closes from the keyboard in
        // its own document.
        fireEvent.pointerDown(document.body);
        opener.focus();
        rerender(<SecondDocumentDialog isOpen={true} />);
        // A modal dialog holds focus while it is open, as showModal() makes it.
        within(secondDocument.body)
          .getByRole('button', {name: 'Inside', hidden: true})
          .focus();
        fireEvent.keyDown(secondDocument.body, {key: 'Escape'});
        const focus = vi.spyOn(
          secondDocument.defaultView!.HTMLElement.prototype,
          'focus',
        );

        rerender(<SecondDocumentDialog isOpen={false} />);
        expect(opener).toHaveFocus();
        expect(
          focus.mock.calls.filter(
            (_call, index) => focus.mock.contexts[index] === opener,
          ),
        ).toEqual([[{preventScroll: true}]]);
        focus.mockRestore();
      });

      it('keeps plain focus on a text field that opened it after a pointer close', () => {
        const {rerender} = render(<SecondDocumentFieldDialog isOpen={false} />);
        const field = within(secondDocument.body).getByRole('textbox', {
          name: 'Search',
        });
        field.focus();
        rerender(<SecondDocumentFieldDialog isOpen={true} />);
        const inside = within(secondDocument.body).getByRole('button', {
          name: 'Inside',
          hidden: true,
        });
        inside.focus();
        fireEvent.pointerDown(inside);
        // The field's own window's prototype: a field there is never an
        // instance of the page's constructors.
        const {prototype} = secondDocument.defaultView!.HTMLElement;
        const focus = vi.spyOn(prototype, 'focus');
        const blur = vi.spyOn(prototype, 'blur');

        rerender(<SecondDocumentFieldDialog isOpen={false} />);
        expect(field).toHaveFocus();
        expect(
          focus.mock.calls.filter(
            (_call, index) => focus.mock.contexts[index] === field,
          ),
        ).toEqual([[{preventScroll: true}]]);
        expect(blur.mock.contexts).not.toContain(field);
        focus.mockRestore();
        blur.mockRestore();
      });

      it('tracks its document while any Dialog there is mounted, and releases it after the last', () => {
        const removeEventListener = vi.spyOn(
          secondDocument,
          'removeEventListener',
        );
        const removedModalityListeners = () =>
          removeEventListener.mock.calls
            .map(([type]) => type)
            .filter(type => type === 'pointerdown' || type === 'keydown')
            .sort();
        const {rerender} = render(<SecondDocumentDialogs count={2} />);
        fireEvent.pointerDown(secondDocument.body);
        expect(getInteractionModality(secondDocument)).toBe('pointer');

        rerender(<SecondDocumentDialogs count={1} />);
        fireEvent.keyDown(secondDocument.body, {key: 'Tab'});
        expect(getInteractionModality(secondDocument)).toBe('keyboard');
        expect(removedModalityListeners()).toEqual([]);

        rerender(<SecondDocumentDialogs count={0} />);
        expect(removedModalityListeners()).toEqual(['keydown', 'pointerdown']);
        fireEvent.pointerDown(secondDocument.body);
        expect(getInteractionModality(secondDocument)).toBe('keyboard');
        removeEventListener.mockRestore();
      });
    });
  });

  // jsdom draws no focus ring, so these prove only which focus call Dialog
  // makes. Dialog.a11y.browser.spec.ts proves the rendered outcome.
  describe('last-input focus visibility', () => {
    function LastInputExample() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open dialog
          </button>
          <Dialog
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            aria-label="Review changes">
            <button
              type="button"
              data-autofocus
              onClick={() => setIsOpen(false)}>
              Cancel
            </button>
          </Dialog>
        </>
      );
    }

    function focusCallsOn(
      focus: MockInstance<HTMLElement['focus']>,
      element: HTMLElement,
    ): unknown[][] {
      return focus.mock.calls.filter(
        (_call, index) => focus.mock.contexts[index] === element,
      );
    }

    beforeEach(() => {
      __resetInteractionModalityForTest();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('hides the ring on both focus moves after pointer input', () => {
      render(<LastInputExample />);
      const invoker = screen.getByRole('button', {name: 'Open dialog'});
      invoker.focus();
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');

      fireEvent.pointerDown(invoker);
      fireEvent.pointerUp(invoker);
      fireEvent.click(invoker);
      const cancel = screen.getByRole('button', {name: 'Cancel'});
      expect(cancel).toHaveFocus();
      expect(focusCallsOn(focus, cancel)).toEqual([[{focusVisible: false}]]);

      fireEvent.pointerDown(cancel);
      fireEvent.pointerUp(cancel);
      fireEvent.click(cancel);
      expect(invoker).toHaveFocus();
      // The return reveals nothing: the opener was on screen when the dialog
      // opened and the page has not moved since.
      expect(focusCallsOn(focus, invoker)).toEqual([
        [{preventScroll: true, focusVisible: false}],
      ]);
    });

    it('keeps plain focus on both moves after keyboard input', () => {
      render(<LastInputExample />);
      const invoker = screen.getByRole('button', {name: 'Open dialog'});
      invoker.focus();
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');

      fireEvent.keyDown(invoker, {key: 'Enter'});
      fireEvent.click(invoker);
      const cancel = screen.getByRole('button', {name: 'Cancel'});
      expect(focusCallsOn(focus, cancel)).toEqual([[]]);

      fireEvent.keyDown(cancel, {key: 'Enter'});
      fireEvent.click(cancel);
      expect(invoker).toHaveFocus();
      expect(focusCallsOn(focus, invoker)).toEqual([[{preventScroll: true}]]);
    });

    it('clears a ring the browser already drew before refocusing after pointer input', () => {
      render(<LastInputExample />);
      const invoker = screen.getByRole('button', {name: 'Open dialog'});
      invoker.focus();
      fireEvent.pointerDown(invoker);
      fireEvent.pointerUp(invoker);
      fireEvent.click(invoker);

      // WebKit's native close restores focus to the invoker with a ring before
      // Dialog moves focus, and focusing the focused element is a no-op.
      HTMLDialogElement.prototype.close = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.removeAttribute('open');
        invoker.focus();
      });
      const matches = HTMLElement.prototype.matches;
      vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
        this: HTMLElement,
        selector: string,
      ) {
        return selector === ':focus-visible'
          ? this === invoker
          : matches.call(this, selector);
      });
      const blur = vi.spyOn(invoker, 'blur');
      const focus = vi.spyOn(invoker, 'focus');

      const cancel = screen.getByRole('button', {name: 'Cancel'});
      fireEvent.pointerDown(cancel);
      fireEvent.pointerUp(cancel);
      fireEvent.click(cancel);

      expect(blur).toHaveBeenCalledTimes(1);
      expect(focus.mock.calls.at(-1)).toEqual([
        {preventScroll: true, focusVisible: false},
      ]);
      expect(blur.mock.invocationCallOrder[0]).toBeLessThan(
        focus.mock.invocationCallOrder.at(-1) ?? 0,
      );
      expect(invoker).toHaveFocus();
    });

    // Consumer focus callbacks see at most one extra blur and focus, and only
    // where the browser already drew a ring on a non-text target after a
    // pointer press. The mocks stand in for WebKit: showModal() and close()
    // move focus themselves, and every focused element matches :focus-visible.
    describe('consumer focus callbacks', () => {
      type Counts = {focus: number; blur: number};
      type Kind = 'button' | 'tabindex' | 'text';

      function counter(): Counts & {
        props: {onFocus: () => void; onBlur: () => void};
      } {
        const counts = {
          focus: 0,
          blur: 0,
          props: {
            onFocus: () => {
              counts.focus += 1;
            },
            onBlur: () => {
              counts.blur += 1;
            },
          },
        };
        return counts;
      }

      function Focusable({
        kind,
        label,
        counts,
        ...rest
      }: {
        kind: Kind;
        label: string;
        counts: ReturnType<typeof counter>;
        onClick?: () => void;
        'data-autofocus'?: boolean;
      }) {
        if (kind === 'text') {
          return <input aria-label={label} {...counts.props} {...rest} />;
        }
        return kind === 'tabindex' ? (
          <div role="button" tabIndex={0} {...counts.props} {...rest}>
            {label}
          </div>
        ) : (
          <button type="button" {...counts.props} {...rest}>
            {label}
          </button>
        );
      }

      function setup(invokerKind: Kind, targetKind: Kind) {
        const invokerCounts = counter();
        const targetCounts = counter();
        function Example() {
          const [isOpen, setIsOpen] = useState(false);
          return (
            <>
              <Focusable
                kind={invokerKind}
                label="Invoker"
                counts={invokerCounts}
                onClick={() => setIsOpen(true)}
              />
              <Dialog
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                aria-label="Review changes">
                <Focusable
                  kind={targetKind}
                  label="Target"
                  counts={targetCounts}
                  data-autofocus
                />
                <button type="button" onClick={() => setIsOpen(false)}>
                  Done
                </button>
              </Dialog>
            </>
          );
        }
        render(<Example />);
        const invoker = screen.getByRole(
          invokerKind === 'text' ? 'textbox' : 'button',
          {name: 'Invoker'},
        );
        invoker.focus();
        HTMLDialogElement.prototype.showModal = vi.fn(function (
          this: HTMLDialogElement,
        ) {
          this.setAttribute('open', '');
          this.querySelector<HTMLElement>('[data-autofocus]')?.focus();
        });
        HTMLDialogElement.prototype.close = vi.fn(function (
          this: HTMLDialogElement,
        ) {
          this.removeAttribute('open');
          invoker.focus();
        });
        const matches = HTMLElement.prototype.matches;
        vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
          this: HTMLElement,
          selector: string,
        ) {
          return selector === ':focus-visible'
            ? this === document.activeElement
            : matches.call(this, selector);
        });
        const reset = () => {
          for (const counts of [invokerCounts, targetCounts]) {
            counts.focus = 0;
            counts.blur = 0;
          }
        };
        reset();
        return {invoker, invokerCounts, targetCounts, reset};
      }

      function press(element: HTMLElement, modality: 'pointer' | 'keyboard') {
        if (modality === 'pointer') {
          fireEvent.pointerDown(element);
        } else {
          fireEvent.keyDown(element, {key: 'Enter'});
        }
        fireEvent.click(element);
      }

      function counts({focus, blur}: Counts): Counts {
        return {focus, blur};
      }

      it.each([
        ['button', 'pointer', {focus: 2, blur: 1}],
        ['button', 'keyboard', {focus: 1, blur: 0}],
        ['text', 'pointer', {focus: 1, blur: 0}],
        ['text', 'keyboard', {focus: 1, blur: 0}],
      ] as const)(
        'gives a %s autofocus target on a %s open %j',
        (targetKind, modality, expected) => {
          const {invoker, targetCounts} = setup('button', targetKind);
          press(invoker, modality);
          expect(counts(targetCounts)).toEqual(expected);
        },
      );

      it.each([
        ['button', 'pointer', {focus: 2, blur: 1}],
        ['button', 'keyboard', {focus: 1, blur: 0}],
        ['tabindex', 'pointer', {focus: 2, blur: 1}],
        ['tabindex', 'keyboard', {focus: 1, blur: 0}],
        ['text', 'pointer', {focus: 1, blur: 0}],
      ] as const)(
        'gives a %s invoker on a %s close %j',
        (invokerKind, modality, expected) => {
          const {invoker, invokerCounts, reset} = setup(invokerKind, 'button');
          press(invoker, 'keyboard');
          reset();
          press(screen.getByRole('button', {name: 'Done'}), modality);
          expect(invoker).toHaveFocus();
          expect(counts(invokerCounts)).toEqual(expected);
        },
      );
    });
  });

  describe('variant: standard', () => {
    it('renders with default variant', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('accepts custom width', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} width={600}>
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('accepts custom maxHeight', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} maxHeight="50vh">
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('variant: fullscreen', () => {
    it('renders fullscreen variant', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} variant="fullscreen">
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('responsive sizing', () => {
    it('keeps the requested width but clamps standard dialogs to container and dynamic viewport gutters', () => {
      render(
        <Dialog
          isOpen={true}
          onOpenChange={() => {}}
          width={600}
          maxHeight="70dvh"
          aria-label="Sized dialog">
          Content
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      const inlineStyle = dialog.getAttribute('style') ?? '';
      expect(inlineStyle).toContain('--x-width: 600px');
      expect(inlineStyle).toContain(
        '--x-maxWidth: min(100%, calc(100dvw - var(--spacing-4) - var(--spacing-4)))',
      );
      expect(inlineStyle).toContain('--x-maxHeight: 70dvh');
    });

    it('uses opacity-only fullscreen keyframes while standard dialogs keep directional movement', () => {
      const source = readFileSync(
        'packages/core/src/Dialog/Dialog.tsx',
        'utf8',
      );
      const enterDirectional = extractConstDeclaration(
        source,
        'enterDirectional',
      );
      const enterFullscreen = extractConstDeclaration(
        source,
        'enterFullscreen',
      );
      const fullscreenOpen = source.slice(
        source.indexOf('  fullscreenOpen: {'),
        source.indexOf('  fullscreenSafeArea: {'),
      );

      expect(enterDirectional).toContain('transform');
      expect(enterDirectional).toContain('translate(var(--dialog-dir-x');
      expect(enterDirectional).toContain('scale(0.95)');
      expect(enterFullscreen).toContain('opacity');
      expect(enterFullscreen).not.toContain('transform');
      expect(enterFullscreen).not.toContain('translate');
      expect(enterFullscreen).not.toContain('scale(');
      expect(fullscreenOpen).toContain('enterFullscreen');
      expect(fullscreenOpen).not.toContain('enterDirectional');
    });

    it('maps fullscreen safe-area insets to logical sides in LTR and RTL', () => {
      expect(dialogFullscreenSafeAreaPaddingContract.inlineStart.ltr).toContain(
        'safe-area-inset-left',
      );
      expect(dialogFullscreenSafeAreaPaddingContract.inlineEnd.ltr).toContain(
        'safe-area-inset-right',
      );
      expect(dialogFullscreenSafeAreaPaddingContract.inlineStart.rtl).toContain(
        'safe-area-inset-right',
      );
      expect(dialogFullscreenSafeAreaPaddingContract.inlineEnd.rtl).toContain(
        'safe-area-inset-left',
      );
      expect(dialogFullscreenSafeAreaPaddingContract.inlineStart.rtl).not.toBe(
        dialogFullscreenSafeAreaPaddingContract.inlineStart.ltr,
      );
      expect(dialogFullscreenSafeAreaPaddingContract.inlineEnd.rtl).not.toBe(
        dialogFullscreenSafeAreaPaddingContract.inlineEnd.ltr,
      );
    });

    it('protects default fullscreen content with safe-area padding', () => {
      render(
        <Dialog
          isOpen={true}
          onOpenChange={() => {}}
          variant="fullscreen"
          aria-label="Fullscreen dialog">
          <div data-testid="child">Content</div>
        </Dialog>,
      );

      const wrapper = screen.getByTestId('child').parentElement!;
      const computed = window.getComputedStyle(wrapper);
      expect(normalizeCSSValue(computed.paddingInlineStart)).toBe(
        normalizeCSSValue(
          dialogFullscreenSafeAreaPaddingContract.inlineStart.ltr,
        ),
      );
      expect(normalizeCSSValue(computed.paddingInlineEnd)).toBe(
        normalizeCSSValue(
          dialogFullscreenSafeAreaPaddingContract.inlineEnd.ltr,
        ),
      );
      expect(wrapper.parentElement!.tagName).toBe('DIALOG');
    });

    it('applies RTL fullscreen safe-area padding to the opposite logical edges', () => {
      render(
        <div dir="rtl">
          <Dialog
            isOpen={true}
            onOpenChange={() => {}}
            variant="fullscreen"
            aria-label="Fullscreen RTL dialog">
            <div data-testid="rtl-child">Content</div>
          </Dialog>
        </div>,
      );

      const wrapper = screen.getByTestId('rtl-child').parentElement!;
      const computed = window.getComputedStyle(wrapper);
      expect(normalizeCSSValue(computed.paddingInlineStart)).toBe(
        normalizeCSSValue(
          dialogFullscreenSafeAreaPaddingContract.inlineStart.rtl,
        ),
      );
      expect(normalizeCSSValue(computed.paddingInlineEnd)).toBe(
        normalizeCSSValue(
          dialogFullscreenSafeAreaPaddingContract.inlineEnd.rtl,
        ),
      );
    });

    it('resolves theme zero padding before the default fullscreen safe-area fallback', () => {
      const zeroPaddingTheme = defineTheme({
        name: 'dialog-zero-padding-test',
        components: {
          dialog: {
            base: {padding: '0'},
          },
        },
      });

      const vars = extractThemeVars(generateThemeTestCSS(zeroPaddingTheme));
      expect(vars.get('--astryx-dialog-padding')).toBe('0');
      expect(
        resolveCSSVarFallback(
          dialogFullscreenSafeAreaPaddingContract.blockStart,
          vars,
        ),
      ).toBe('0');
      expect(
        resolveCSSVarFallback(
          dialogFullscreenSafeAreaPaddingContract.inlineStart.ltr,
          vars,
        ),
      ).toBe('0');
      expect(
        resolveCSSVarFallback(
          dialogFullscreenSafeAreaPaddingContract.inlineEnd.rtl,
          vars,
        ),
      ).toBe('0');
    });
  });

  describe('position prop', () => {
    it('accepts position configuration', () => {
      render(
        <Dialog
          isOpen={true}
          onOpenChange={() => {}}
          position={{top: 100, end: 20}}>
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('handles string position values', () => {
      render(
        <Dialog
          isOpen={true}
          onOpenChange={() => {}}
          position={{top: '10vh', start: '5vw'}}>
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('accepts logical start/end position configuration', () => {
      render(
        <Dialog
          isOpen={true}
          onOpenChange={() => {}}
          position={{top: 100, start: 20, end: 40}}>
          Content
        </Dialog>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // Physical-vs-logical mapping is verified against the pure resolver so we can
  // assert the exact emitted CSS offsets without relying on StyleX class
  // compilation or a browser. The public DialogPosition union forbids mixing
  // logical and physical inline offsets (enforced at compile time, below), so
  // the resolver has no precedence logic — it just maps what it's given.
  describe('resolveDialogPositionOffsets (physical-vs-logical mapping)', () => {
    it('maps logical start/end to inset-inline offsets (mirror under RTL)', () => {
      // insetInlineStart/End are direction-relative: the browser resolves them
      // to left/right per `dir`, so the same value mirrors under RTL.
      const offsets = resolveDialogPositionOffsets({start: 20, end: 40});
      expect(offsets.insetInlineStart).toBe('20px');
      expect(offsets.insetInlineEnd).toBe('40px');
      // No physical offsets requested → auto.
    });

    it('combines block-axis top/bottom with an inline pair', () => {
      const offsets = resolveDialogPositionOffsets({top: 100, start: 12});
      expect(offsets.top).toBe('100px');
      expect(offsets.insetInlineStart).toBe('12px');
      // Everything unset falls back to auto.
      expect(offsets.bottom).toBe('auto');
      expect(offsets.insetInlineEnd).toBe('auto');
    });

    it('passes through string offsets (vw/vh/etc.) for logical offsets', () => {
      const logical = resolveDialogPositionOffsets({start: '5vw', end: '10%'});
      expect(logical.insetInlineStart).toBe('5vw');
      expect(logical.insetInlineEnd).toBe('10%');
    });
  });

  it('forwards additional props to dialog element', () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}} data-testid="custom-dialog">
        Content
      </Dialog>,
    );
    expect(screen.getByTestId('custom-dialog')).toBeInTheDocument();
  });

  it('runs backdrop dismissal before a consumer onClick', () => {
    const callOrder: string[] = [];
    const onClick = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
      callOrder.push('consumer');
    });
    const onOpenChange = vi.fn(() => {
      callOrder.push('dialog');
    });
    render(
      <Dialog
        isOpen={true}
        onOpenChange={onOpenChange}
        onClick={onClick}
        data-testid="click-dialog">
        Content
      </Dialog>,
    );

    fireEvent.pointerDown(screen.getByTestId('click-dialog'));
    fireEvent.pointerUp(screen.getByTestId('click-dialog'));
    fireEvent.click(screen.getByTestId('click-dialog'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(callOrder).toEqual(['dialog', 'consumer']);
  });

  it('does not forward native open prop to dialog element', () => {
    render(
      <Dialog
        isOpen={false}
        onOpenChange={() => {}}
        {...({open: true} as Record<string, unknown>)}>
        Content
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {hidden: true});
    // isOpen=false controls state; native open prop must not leak through
    expect(dialog).not.toHaveAttribute('open');
  });

  describe('alertdialog role', () => {
    it('sets role="alertdialog" when purpose is "required"', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} purpose="required">
          Content
        </Dialog>,
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('does not set role="alertdialog" when purpose is "info"', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} purpose="info">
          Content
        </Dialog>,
      );
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not set role="alertdialog" when purpose is "form"', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} purpose="form">
          Content
        </Dialog>,
      );
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('accessible name', () => {
    it('is labelled by the DialogHeader title by default', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <DialogHeader title="Dialog title" />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      const heading = screen.getByRole('heading', {name: 'Dialog title'});
      expect(heading.id).not.toBe('');
      expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
      expect(dialog).toHaveAccessibleName('Dialog title');
    });

    it('is labelled by the text content of a node title', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <DialogHeader
            title={
              <span>
                Rich <strong>dialog</strong> title
              </span>
            }
          />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      const heading = screen.getByRole('heading', {level: 2});
      expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
      expect(dialog).toHaveAccessibleName('Rich dialog title');
    });

    it('names itself by a header title that renders after the dialog mounts', () => {
      // A composed header whose title arrives in a later commit asks the
      // dialog to check its default name again.
      function LateTitleHeader({isReady}: {isReady: boolean}) {
        const context = useDialogContext();
        const syncDefaultName = context?.syncDefaultName;
        useLayoutEffect(() => {
          syncDefaultName?.();
        }, [isReady, syncDefaultName]);
        return isReady ? <h2 id={context?.titleId}>Late title</h2> : null;
      }
      const {rerender} = render(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <LateTitleHeader isReady={false} />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveAttribute('aria-labelledby');
      rerender(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <LateTitleHeader isReady={true} />
        </Dialog>,
      );
      expect(dialog).toHaveAccessibleName('Late title');
      rerender(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <LateTitleHeader isReady={false} />
        </Dialog>,
      );
      expect(dialog).not.toHaveAttribute('aria-labelledby');
    });

    it('prefers a consumer-provided aria-label over the header title', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Custom name">
          <DialogHeader title="Dialog title" />
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveAttribute('aria-labelledby');
      expect(dialog).toHaveAccessibleName('Custom name');
    });

    it('prefers a consumer-provided aria-labelledby over the header title', () => {
      render(
        <>
          <span id="external-label">External name</span>
          <Dialog
            isOpen={true}
            onOpenChange={() => {}}
            aria-labelledby="external-label">
            <DialogHeader title="Dialog title" />
          </Dialog>
        </>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'external-label');
      expect(dialog).toHaveAccessibleName('External name');
    });

    it('omits aria-labelledby and warns when open with no name source', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        render(
          <Dialog isOpen={true} onOpenChange={() => {}}>
            Content
          </Dialog>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog).not.toHaveAttribute('aria-labelledby');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('accessible name'),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('does not warn when the header provides a title', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        render(
          <Dialog isOpen={true} onOpenChange={() => {}}>
            <DialogHeader title="Dialog title" />
          </Dialog>,
        );
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('inner flex wrapper', () => {
    it('wraps children in a flex container for scroll support', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          <div data-testid="child">Content</div>
        </Dialog>,
      );
      const child = screen.getByTestId('child');
      const wrapper = child.parentElement!;
      expect(wrapper.tagName).toBe('DIV');
      expect(wrapper.parentElement!.tagName).toBe('DIALOG');
    });
  });

  describe('edge compensation isolation', () => {
    it('does not inherit edge compensation from ancestor containers', () => {
      // With container-driven edge compensation (via :has() + data attributes),
      // dialogs no longer need to reset CSS custom properties — the compensation
      // is scoped to each container's own slot wrappers.
      render(
        <div>
          <Dialog isOpen={true} onOpenChange={() => {}}>
            <div data-testid="child">Content</div>
          </Dialog>
        </div>,
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('isInline', () => {
    it('renders children in a div without a <dialog> element', () => {
      const {container} = render(
        <Dialog isOpen={true} isInline onOpenChange={() => {}}>
          <div data-testid="child">Inline content</div>
        </Dialog>,
      );
      expect(screen.getByText('Inline content')).toBeInTheDocument();
      expect(container.querySelector('dialog')).toBeNull();
    });

    it('renders nothing when isOpen is false', () => {
      const {container} = render(
        <Dialog isOpen={false} isInline onOpenChange={() => {}}>
          <div data-testid="child">Hidden content</div>
        </Dialog>,
      );
      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
      expect(container.querySelector('dialog')).toBeNull();
    });

    it('does not call showModal', () => {
      render(
        <Dialog isOpen={true} isInline onOpenChange={() => {}}>
          Content
        </Dialog>,
      );
      expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    });

    it('suppresses DialogHeader auto-focus', () => {
      const before = document.createElement('button');
      before.type = 'button';
      document.body.appendChild(before);
      before.focus();

      render(
        <Dialog isOpen={true} isInline onOpenChange={() => {}}>
          <DialogHeader title="Inline title" />
        </Dialog>,
      );

      expect(before).toHaveFocus();
      before.remove();
    });
  });

  describe('container padding isolation', () => {
    it('resets container padding custom properties on the root dialog element', () => {
      render(
        <Dialog isOpen={true} onOpenChange={() => {}}>
          Content
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog');
      const computed = window.getComputedStyle(dialog);
      expect(
        computed.getPropertyValue('--container-padding-inline-start'),
      ).toBe('0px');
      expect(computed.getPropertyValue('--container-padding-inline-end')).toBe(
        '0px',
      );
      expect(computed.getPropertyValue('--container-padding-block-start')).toBe(
        '0px',
      );
      expect(computed.getPropertyValue('--container-padding-block-end')).toBe(
        '0px',
      );
    });
  });
});

// Tab from the last tabbable control wraps to the first and Shift+Tab from the
// first wraps to the last, so focus never leaves the modal for the browser's
// own UI.
function expectTabWrapsInside(modal: HTMLElement) {
  const tabbables = getFocusableElements(modal);
  expect(tabbables.length).toBeGreaterThan(0);
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];

  last.focus();
  expect(last).toHaveFocus();
  expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
  expect(first).toHaveFocus();

  expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(last).toHaveFocus();
}

function PanelRegion() {
  const {containerRef} = useFocusTrap<HTMLDivElement>({isActive: true});
  return (
    <div ref={containerRef}>
      <button type="button">Panel first</button>
      <button type="button">Panel last</button>
    </div>
  );
}

describe('Dialog focus region (DEC-2)', () => {
  it('lets a region opened last inside the Dialog answer its own Tab', () => {
    // The panel's last control is also the Dialog's last Tab stop. The
    // Dialog's listener runs first because it was activated first, so only
    // the innermost-region rule keeps Tab inside the panel.
    const {rerender} = render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Settings">
        <button type="button">Dialog first</button>
      </Dialog>,
    );
    rerender(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Settings">
        <button type="button">Dialog first</button>
        <PanelRegion />
      </Dialog>,
    );
    const panelLast = screen.getByRole('button', {name: 'Panel last'});
    panelLast.focus();

    expect(fireEvent.keyDown(panelLast, {key: 'Tab'})).toBe(false);
    expect(screen.getByRole('button', {name: 'Panel first'})).toHaveFocus();
  });

  it('leaves a Tab that the last control handles itself where it is', () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Settings">
        <button type="button">First</button>
        <textarea
          aria-label="Notes"
          onKeyDown={event => {
            if (event.key === 'Tab') {
              // An editor that indents on Tab.
              event.preventDefault();
            }
          }}
        />
      </Dialog>,
    );
    const notes = screen.getByRole('textbox', {name: 'Notes'});
    notes.focus();

    fireEvent.keyDown(notes, {key: 'Tab'});
    expect(notes).toHaveFocus();
  });

  it('wraps Tab and Shift+Tab inside the open modal', () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Settings">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>,
    );
    expectTabWrapsInside(screen.getByRole('dialog'));
  });

  it('wraps Shift+Tab from the focused title to the last control', () => {
    render(
      <Dialog isOpen onOpenChange={() => {}}>
        <DialogHeader title="Settings" />
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const title = screen.getByRole('heading', {name: 'Settings'});
    // The title takes programmatic focus (tabIndex -1) and is not a Tab stop.
    title.focus();
    expect(title).toHaveFocus();
    const tabbables = getFocusableElements(dialog);
    expect(tabbables).not.toContain(title);

    expect(fireEvent.keyDown(title, {key: 'Tab', shiftKey: true})).toBe(false);
    expect(tabbables[tabbables.length - 1]).toHaveFocus();
  });

  it('lets the inner modal answer Tab when a Dialog opens from a Dialog', () => {
    function Nested({isInnerOpen}: {isInnerOpen: boolean}) {
      return (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Outer">
          <button type="button">Outer first</button>
          <Dialog
            isOpen={isInnerOpen}
            onOpenChange={() => {}}
            aria-label="Inner">
            <button type="button">Inner first</button>
            <button type="button">Inner last</button>
          </Dialog>
        </Dialog>
      );
    }
    // The outer modal's region is active before the inner one opens, as when
    // a person opens a Dialog from a Dialog.
    const {rerender} = render(<Nested isInnerOpen={false} />);
    rerender(<Nested isInnerOpen />);
    expectTabWrapsInside(screen.getByRole('dialog', {name: 'Inner'}));
  });

  it('leaves Tab alone when the Dialog renders inline', () => {
    render(
      <>
        <Dialog isOpen isInline onOpenChange={() => {}} aria-label="Preview">
          <button type="button">Only</button>
        </Dialog>
        <button type="button">After</button>
      </>,
    );
    const only = screen.getByRole('button', {name: 'Only'});
    only.focus();
    expect(fireEvent.keyDown(only, {key: 'Tab'})).toBe(true);
  });
});

// A same-name native radio group is one Tab stop: its checked radio, or its
// first when none is checked. Medium is checked and is neither first nor last.
function SizeRadios({name}: {name: string}) {
  return (
    <fieldset>
      <legend>Size</legend>
      <input type="radio" name={name} value="s" aria-label="Small" />
      <input
        type="radio"
        name={name}
        value="m"
        aria-label="Medium"
        defaultChecked
      />
      <input type="radio" name={name} value="l" aria-label="Large" />
    </fieldset>
  );
}

function expectRadioGroupEndsTheCycle() {
  const medium = screen.getByRole('radio', {name: 'Medium', hidden: true});
  const first = screen.getByRole('button', {name: 'First', hidden: true});
  medium.focus();
  expect(fireEvent.keyDown(medium, {key: 'Tab'})).toBe(false);
  expect(first).toHaveFocus();
  expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(medium).toHaveFocus();
}

function expectRadioGroupStartsTheCycle() {
  const medium = screen.getByRole('radio', {name: 'Medium', hidden: true});
  const last = screen.getByRole('button', {name: 'Last', hidden: true});
  medium.focus();
  expect(fireEvent.keyDown(medium, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(last).toHaveFocus();
  expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
  expect(medium).toHaveFocus();
}

describe('Dialog focus region: a radio group is one Tab stop', () => {
  it('wraps Tab from the checked radio of a group that ends the dialog', () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Visit">
        <button type="button">First</button>
        <SizeRadios name="size" />
      </Dialog>,
    );
    expectRadioGroupEndsTheCycle();
  });

  it('wraps Shift+Tab from the checked radio of a group that starts the dialog', () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Visit">
        <SizeRadios name="size" />
        <button type="button">Last</button>
      </Dialog>,
    );
    expectRadioGroupStartsTheCycle();
  });
});
