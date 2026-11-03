// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.test.tsx
 * @input Uses vitest, @testing-library/react, AlertDialog component
 * @output Unit tests for AlertDialog component behavior
 * @position Testing; validates AlertDialog.tsx implementation
 *
 * SYNC: When AlertDialog.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {getGestureHost} from '../gestures/GestureHost';
import {isTrackedByGroup} from '../privateAttributes/pressGroupItem.stylex';
import {AlertDialog} from './AlertDialog';
import {useImperativeAlertDialog} from './useImperativeAlertDialog';

// The gesture host reads `(pointer: coarse)` once per document and keeps that
// query for the document's life: it gets this live one (see beforeAll), whose
// answer each test's media stub sets.
let isCoarsePrimaryPointer = false;
const hostCoarseQuery = {
  get matches() {
    return isCoarsePrimaryPointer;
  },
  media: '(pointer: coarse)',
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
};

function stubAlertDialogMedia({
  smallScreen,
  coarsePointer,
  noHover,
  reduceMotion = false,
}: {
  smallScreen: boolean;
  coarsePointer: boolean;
  noHover: boolean;
  reduceMotion?: boolean;
}): void {
  isCoarsePrimaryPointer = coarsePointer;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      let matches = false;
      if (query.includes('max-width: 640px')) {
        matches = smallScreen;
      } else if (query.includes('pointer: coarse')) {
        matches = coarsePointer;
      } else if (query.includes('pointer: fine')) {
        matches = !coarsePointer;
      } else if (query.includes('hover: none')) {
        matches = noHover;
      } else if (query.includes('hover: hover')) {
        matches = !noHover;
      } else if (query.includes('prefers-reduced-motion: reduce')) {
        matches = reduceMotion;
      } else if (query.includes('prefers-reduced-motion: no-preference')) {
        matches = !reduceMotion;
      } else if (query.includes('prefers-reduced-motion')) {
        matches = reduceMotion;
      }

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
}

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => hostCoarseQuery),
  );
  getGestureHost(document);
  vi.unstubAllGlobals();
});

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

afterEach(() => {
  vi.unstubAllGlobals();
  isCoarsePrimaryPointer = false;
});

describe('AlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    onOpenChange: vi.fn(),
    title: 'Delete item?',
    description: 'This action cannot be undone.',
    actionLabel: 'Delete',
    onAction: vi.fn(),
  };

  // The alertdialog role and the aria-describedby link are asserted by the
  // Alert Dialog accessibility contract binding (AlertDialog.a11y.test.tsx /
  // .chromium.spec.ts), not here.
  it('renders title and description', () => {
    render(<AlertDialog {...defaultProps} />);
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone.'),
    ).toBeInTheDocument();
  });

  it('links title via aria-labelledby', () => {
    render(<AlertDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toHaveTextContent('Delete item?');
  });

  it('renders cancel and action buttons', () => {
    render(<AlertDialog {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('uses custom cancel label', () => {
    render(<AlertDialog {...defaultProps} cancelLabel="Never mind" />);
    expect(screen.getByText('Never mind')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(<AlertDialog {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onAction when action is clicked', () => {
    const onAction = vi.fn();
    render(<AlertDialog {...defaultProps} onAction={onAction} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onAction).toHaveBeenCalled();
  });

  it('does not call onOpenChange when action is clicked', () => {
    const onOpenChange = vi.fn();
    render(<AlertDialog {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("runs onAction for a user-event click on the action and leaves Cancel alone, as a consumer's test clicks it", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AlertDialog
        {...defaultProps}
        onAction={onAction}
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Delete'}));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('opens under a fine pointer with no console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<AlertDialog {...defaultProps} />);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('does not render when isOpen is false', () => {
    render(<AlertDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('accepts custom width', () => {
    render(<AlertDialog {...defaultProps} width={600} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  describe('responsive actions', () => {
    const longCancelLabel = 'Keep this workspace and all of its dashboards';
    const longActionLabel =
      'Permanently delete this workspace and all dashboards';

    it('preserves the preferred width and horizontal order above the small breakpoint', () => {
      stubAlertDialogMedia({
        smallScreen: false,
        coarsePointer: false,
        noHover: false,
      });
      render(<AlertDialog {...defaultProps} />);

      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 640px)');
      // The layout reads the width alone. The pointer query only turns the
      // touch layer on, never the order or the stacking.
      expect(window.matchMedia).not.toHaveBeenCalledWith('(hover: none)');
      const dialog = screen.getByRole('alertdialog');
      const buttons = within(dialog).getAllByRole('button');
      const footerStack = buttons[0].parentElement!;
      expect(dialog.getAttribute('style')).toContain('--x-width: 400px');
      expect(dialog.getAttribute('style')).toContain(
        '--x-maxWidth: min(100%, calc(100dvw - var(--spacing-4) - var(--spacing-4)))',
      );
      expect(buttons.map(button => button.textContent)).toEqual([
        'Cancel',
        'Delete',
      ]);
      expect(getComputedStyle(footerStack).flexWrap).toBe('wrap');
    });

    it('keeps long action buttons within the wide horizontal footer without changing Button sizing', () => {
      stubAlertDialogMedia({
        smallScreen: false,
        coarsePointer: false,
        noHover: false,
      });
      render(
        <AlertDialog
          {...defaultProps}
          cancelLabel={longCancelLabel}
          actionLabel={longActionLabel}
        />,
      );

      const dialog = screen.getByRole('alertdialog');
      const buttons = within(dialog).getAllByRole('button');
      const footerStack = buttons[0].parentElement!;
      expect(buttons.map(button => button.textContent)).toEqual([
        longCancelLabel,
        longActionLabel,
      ]);
      expect(getComputedStyle(footerStack).flexWrap).toBe('wrap');
      for (const button of buttons) {
        const computed = getComputedStyle(button);
        expect(computed.whiteSpace).toBe('nowrap');
        expect(computed.height).toBe('var(--size-element-md)');
        expect(computed.maxWidth).toBe('100%');
      }
    });

    it('stacks long destructive action labels above cancel on a narrow fine-pointer screen', () => {
      stubAlertDialogMedia({
        smallScreen: true,
        coarsePointer: false,
        noHover: false,
      });
      render(
        <AlertDialog
          {...defaultProps}
          cancelLabel={longCancelLabel}
          actionLabel={longActionLabel}
        />,
      );

      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 640px)');
      // The layout reads the width alone. The pointer query only turns the
      // touch layer on, never the order or the stacking.
      expect(window.matchMedia).not.toHaveBeenCalledWith('(hover: none)');
      const dialog = screen.getByRole('alertdialog');
      const buttons = within(dialog).getAllByRole('button');
      const footerStack = buttons[0].parentElement!;
      expect(dialog.getAttribute('style')).toContain('--x-width: 400px');
      expect(buttons.map(button => button.textContent)).toEqual([
        longActionLabel,
        longCancelLabel,
      ]);
      expect(getComputedStyle(footerStack).flexDirection).toBe('column');
      for (const button of buttons) {
        const computed = getComputedStyle(button);
        expect(computed.whiteSpace).toBe('nowrap');
        expect(computed.width).toBe('100%');
        expect(computed.maxWidth).toBe('100%');
      }
    });

    it('uses the same stacked layout on a mobile touch screen', () => {
      stubAlertDialogMedia({
        smallScreen: true,
        coarsePointer: true,
        noHover: true,
      });
      render(
        <AlertDialog
          {...defaultProps}
          cancelLabel="Keep this workspace"
          actionLabel="Permanently delete workspace"
        />,
      );

      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 640px)');
      // The layout reads the width alone. The pointer query only turns the
      // touch layer on, never the order or the stacking.
      expect(window.matchMedia).not.toHaveBeenCalledWith('(hover: none)');
      const dialog = screen.getByRole('alertdialog');
      const buttons = within(dialog).getAllByRole('button');
      expect(dialog.getAttribute('style')).toContain('--x-width: 400px');
      expect(buttons.map(button => button.textContent)).toEqual([
        'Permanently delete workspace',
        'Keep this workspace',
      ]);
      expect(getComputedStyle(buttons[0]).whiteSpace).toBe('nowrap');
      expect(getComputedStyle(buttons[0]).width).toBe('100%');
      expect(getComputedStyle(buttons[1]).whiteSpace).toBe('nowrap');
      expect(getComputedStyle(buttons[1]).width).toBe('100%');
    });

    it('keeps narrow visual, DOM, and tab order aligned while autofocus stays on cancel', async () => {
      const user = userEvent.setup();
      stubAlertDialogMedia({
        smallScreen: true,
        coarsePointer: false,
        noHover: false,
      });
      render(
        <AlertDialog
          {...defaultProps}
          cancelLabel={longCancelLabel}
          actionLabel={longActionLabel}
        />,
      );

      const action = screen.getByRole('button', {name: longActionLabel});
      const cancel = screen.getByRole('button', {name: longCancelLabel});
      expect(
        action.compareDocumentPosition(cancel) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(cancel).toHaveAttribute('data-autofocus');
      action.focus();
      await user.tab();
      expect(cancel).toHaveFocus();
    });
  });

  it('defaults cancel label to Cancel', () => {
    render(<AlertDialog {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  describe('keyboard', () => {
    it('calls onOpenChange(false) on Escape', async () => {
      const onOpenChange = vi.fn();
      render(<AlertDialog {...defaultProps} onOpenChange={onOpenChange} />);
      fireEvent.keyDown(screen.getByRole('alertdialog'), {key: 'Escape'});
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('does not call onAction on Escape', () => {
      const onAction = vi.fn();
      render(<AlertDialog {...defaultProps} onAction={onAction} />);
      fireEvent.keyDown(screen.getByRole('alertdialog'), {key: 'Escape'});
      expect(onAction).not.toHaveBeenCalled();
    });

    it('activates cancel with Enter', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<AlertDialog {...defaultProps} onOpenChange={onOpenChange} />);
      screen.getByRole('button', {name: 'Cancel'}).focus();
      await user.keyboard('{Enter}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('activates the action button with Space', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(<AlertDialog {...defaultProps} onAction={onAction} />);
      screen.getByRole('button', {name: 'Delete'}).focus();
      await user.keyboard(' ');
      expect(onAction).toHaveBeenCalled();
    });

    it('reaches both buttons by Tab, cancel first', async () => {
      const user = userEvent.setup();
      render(<AlertDialog {...defaultProps} />);
      const cancel = screen.getByRole('button', {name: 'Cancel'});
      const action = screen.getByRole('button', {name: 'Delete'});
      cancel.focus();
      expect(cancel).toHaveFocus();
      await user.tab();
      expect(action).toHaveFocus();
    });
  });

  describe('focus', () => {
    it('marks cancel as the initial focus target', () => {
      render(<AlertDialog {...defaultProps} />);
      // Dialog focuses [data-autofocus] itself after showModal(), so the
      // contract this component owns is which element carries the attribute.
      expect(screen.getByRole('button', {name: 'Cancel'})).toHaveAttribute(
        'data-autofocus',
      );
      expect(screen.getByRole('button', {name: 'Delete'})).not.toHaveAttribute(
        'data-autofocus',
      );
    });

    it('keeps the initial focus target on the least destructive action', () => {
      render(<AlertDialog {...defaultProps} cancelLabel="Never mind" />);
      expect(screen.getByRole('button', {name: 'Never mind'})).toHaveAttribute(
        'data-autofocus',
      );
    });

    it('returns focus to the trigger when it closes', async () => {
      const trigger = document.createElement('button');
      trigger.textContent = 'Open';
      document.body.appendChild(trigger);
      trigger.focus();

      const {rerender} = render(<AlertDialog {...defaultProps} />);
      rerender(<AlertDialog {...defaultProps} isOpen={false} />);

      await waitFor(() => expect(trigger).toHaveFocus());
      trigger.remove();
    });

    it('does not disable the cancel button while the action is loading', () => {
      render(<AlertDialog {...defaultProps} isActionLoading />);
      expect(screen.getByRole('button', {name: 'Cancel'})).toBeEnabled();
    });
  });

  describe('aria', () => {
    it('marks the action button busy while loading', () => {
      render(<AlertDialog {...defaultProps} isActionLoading />);
      expect(screen.getByRole('button', {name: /Delete/})).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });

    it('is a modal alertdialog', () => {
      render(<AlertDialog {...defaultProps} />);
      expect(screen.getByRole('alertdialog')).toHaveAttribute(
        'aria-modal',
        'true',
      );
    });

    describe('the inline preview path', () => {
      it('does not claim the alertdialog role', () => {
        render(<AlertDialog {...defaultProps} isInline />);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });

      it('exposes a named group instead, with no aria-modal', () => {
        render(<AlertDialog {...defaultProps} isInline />);
        const group = screen.getByRole('group', {name: 'Delete item?'});
        expect(group).not.toHaveAttribute('aria-modal');
        const describedBy = group.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy!)).toHaveTextContent(
          'This action cannot be undone.',
        );
      });
    });
  });
});

/**
 * Touch tracking: a finger is tracked across both actions as one group, as
 * UIKit tracks an alert's actions (measured on iOS 26.2). The tracking hook's
 * own contract is covered in hooks/useActionGroupTracking.test.tsx; these
 * cover AlertDialog's wiring of it.
 */
describe('AlertDialog action tracking', () => {
  let touchClock = 10_000;
  let touchId = 500;

  function touch(
    type: 'touchstart' | 'touchmove' | 'touchend',
    target: Element,
    point: {x: number; y: number},
    id: number,
  ): void {
    touchClock += 16;
    const event = new Event(type, {bubbles: true, cancelable: true});
    const entry = {identifier: id, clientX: point.x, clientY: point.y, target};
    Object.defineProperty(event, 'changedTouches', {value: [entry]});
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [entry],
    });
    Object.defineProperty(event, 'timeStamp', {value: touchClock});
    target.dispatchEvent(event);
  }

  function place(element: Element, left: number, top: number): void {
    const rect = DOMRect.fromRect({x: left, y: top, width: 120, height: 32});
    element.getBoundingClientRect = () => rect;
  }

  function renderOpen(props: {isInline?: boolean; coarse?: boolean} = {}) {
    const isCoarse = props.coarse ?? true;
    stubAlertDialogMedia({
      smallScreen: true,
      coarsePointer: isCoarse,
      noHover: isCoarse,
    });
    const onOpenChange = vi.fn();
    const onAction = vi.fn();
    render(
      <AlertDialog
        isOpen
        isInline={props.isInline}
        onOpenChange={onOpenChange}
        title="Delete item?"
        description="This cannot be undone."
        actionLabel="Delete"
        onAction={onAction}
      />,
    );
    const cancel = screen.getByRole('button', {name: 'Cancel'});
    const action = screen.getByRole('button', {name: 'Delete'});
    // Stacked on a narrow screen: the action above Cancel.
    place(action, 16, 100);
    place(cancel, 16, 140);
    return {onOpenChange, onAction, cancel, action};
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks both actions as tracked group items from the first render, keeping their pressable marker', () => {
    const {cancel, action} = renderOpen();
    for (const button of [cancel, action]) {
      // The document press controller leaves a pointer's press on a marked
      // item to the group's tracker, its one painter; it still records the
      // touch for the scroll brake, through the pressable marker.
      expect(isTrackedByGroup(button)).toBe(true);
      expect(button).toHaveAttribute('data-astryx-pressable');
    }
  });

  it('leaves the actions to the document press controller in the inline preview, which is not tracked', () => {
    const {cancel, action} = renderOpen({isInline: true});
    for (const button of [cancel, action]) {
      expect(isTrackedByGroup(button)).toBe(false);
      expect(button).toHaveAttribute('data-astryx-pressable');
    }
  });

  it('runs the action a finger lifts on: from the action to Cancel cancels, from Cancel to the action runs it', () => {
    const {onOpenChange, onAction, cancel, action} = renderOpen();
    let id = touchId++;
    touch('touchstart', action, {x: 60, y: 116}, id);
    expect(action).toHaveAttribute('data-astryx-press', 'on');
    touch('touchmove', action, {x: 60, y: 156}, id);
    expect(action).not.toHaveAttribute('data-astryx-press');
    expect(cancel).toHaveAttribute('data-astryx-press', 'on');
    touch('touchend', action, {x: 60, y: 156}, id);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAction).not.toHaveBeenCalled();
    id = touchId++;
    touch('touchstart', cancel, {x: 60, y: 156}, id);
    touch('touchmove', cancel, {x: 60, y: 116}, id);
    touch('touchend', cancel, {x: 60, y: 116}, id);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });
  it('keeps the keyboard on the buttons under every pointer: Enter runs the action and Space cancels (FR8)', async () => {
    for (const coarse of [true, false]) {
      const user = userEvent.setup();
      const {onOpenChange, onAction, cancel, action} = renderOpen({coarse});
      action.focus();
      await user.keyboard('{Enter}');
      expect(onAction).toHaveBeenCalledTimes(1);
      cancel.focus();
      await user.keyboard(' ');
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onAction).toHaveBeenCalledTimes(1);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('tracks only the actions: a press that lands on the title, the message or the backdrop and slides onto an action runs nothing', () => {
    const {onOpenChange, onAction, cancel} = renderOpen();
    const dialog = screen.getByRole('alertdialog');
    // A touch on ::backdrop targets the dialog element itself.
    for (const start of [
      screen.getByText('Delete item?'),
      screen.getByText('This cannot be undone.'),
      dialog,
    ]) {
      const id = touchId++;
      touch('touchstart', start, {x: 60, y: 40}, id);
      touch('touchmove', start, {x: 60, y: 156}, id);
      expect(cancel).not.toHaveAttribute('data-astryx-press');
      touch('touchend', start, {x: 60, y: 156}, id);
    }
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('useImperativeAlertDialog', () => {
  const noop = () => {};

  function Harness({onAction = noop}: {onAction?: () => unknown}) {
    const alert = useImperativeAlertDialog();
    return (
      <>
        <button
          type="button"
          onClick={() =>
            alert.show({
              title: 'Delete item?',
              description: 'This action cannot be undone.',
              actionLabel: 'Delete',
              onAction,
            })
          }>
          Open
        </button>
        <button type="button" onClick={alert.hide}>
          Close it
        </button>
        <span data-testid="is-open">{String(alert.isOpen)}</span>
        {alert.element}
      </>
    );
  }

  it('renders nothing until show is called', () => {
    render(<Harness />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('shows the dialog with the given options', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', {name: 'Open'}));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
  });

  it('hides on hide()', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', {name: 'Open'}));
    await user.click(screen.getByRole('button', {name: 'Close it'}));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('closes when the dialog cancels', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', {name: 'Open'}));
    await user.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('is-open')).toHaveTextContent('false');
  });

  it('forwards onAction and leaves closing to the caller', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await user.click(screen.getByRole('button', {name: 'Open'}));
    await user.click(screen.getByRole('button', {name: 'Delete'}));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('can be shown again after being hidden', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', {name: 'Open'}));
    await user.click(screen.getByRole('button', {name: 'Close it'}));
    await user.click(screen.getByRole('button', {name: 'Open'}));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByTestId('is-open')).toHaveTextContent('true');
  });
});
