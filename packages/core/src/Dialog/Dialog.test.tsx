// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.test.tsx
 * @input Uses vitest, @testing-library/react, Dialog component
 * @output Unit tests for Dialog component behavior
 * @position Testing; validates Dialog.tsx implementation
 *
 * SYNC: When Dialog.tsx changes, update tests to match new behavior
 */

import {useState, type SyntheticEvent} from 'react';
import {readFileSync} from 'node:fs';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {MockInstance} from 'vitest';
import {
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
        ).toEqual([[]]);
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
        ).toEqual([[]]);
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
      fireEvent.click(invoker);
      const cancel = screen.getByRole('button', {name: 'Cancel'});
      expect(cancel).toHaveFocus();
      expect(focusCallsOn(focus, cancel)).toEqual([[{focusVisible: false}]]);

      fireEvent.pointerDown(cancel);
      fireEvent.click(cancel);
      expect(invoker).toHaveFocus();
      expect(focusCallsOn(focus, invoker)).toEqual([[{focusVisible: false}]]);
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
      expect(focusCallsOn(focus, invoker)).toEqual([[]]);
    });

    it('clears a ring the browser already drew before refocusing after pointer input', () => {
      render(<LastInputExample />);
      const invoker = screen.getByRole('button', {name: 'Open dialog'});
      invoker.focus();
      fireEvent.pointerDown(invoker);
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
      fireEvent.click(cancel);

      expect(blur).toHaveBeenCalledTimes(1);
      expect(focus.mock.calls.at(-1)).toEqual([{focusVisible: false}]);
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
