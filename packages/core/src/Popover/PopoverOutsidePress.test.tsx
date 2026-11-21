// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverOutsidePress.test.tsx
 * @input usePopover with `tabBehavior` `'pageOrder'` and `'contain'`
 * @output Tests for how a press outside closes a `'pageOrder'` popover, which
 *   the browser's light dismiss does not own
 * @position Colocated with usePopover.tsx
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {usePopover} from './usePopover';

afterEach(() => {
  vi.restoreAllMocks();
});

interface TipProps {
  tabBehavior?: 'contain' | 'pageOrder';
  isModal?: boolean;
  hasLightDismiss?: boolean;
  onHide?: () => void;
  onShow?: () => void;
}

function Tip({
  tabBehavior = 'pageOrder',
  isModal,
  hasLightDismiss,
  onHide,
  onShow,
}: TipProps) {
  const popover = usePopover({
    dialogLabel: 'Tip',
    tabBehavior,
    isModal,
    hasLightDismiss,
    hasAutoFocus: false,
    onHide,
    onShow,
  });
  return (
    <>
      <button
        type="button"
        ref={popover.triggerRef}
        {...popover.triggerProps}
        onClick={() => popover.toggle()}>
        Filters
      </button>
      <button type="button">Elsewhere</button>
      <button type="button" onClick={() => popover.toggle()}>
        Toggle from the page
      </button>
      <output>{popover.isOpen ? 'open' : 'closed'}</output>
      {popover.render(<button type="button">Got it</button>)}
    </>
  );
}

const pointer = (pointerType: string, x = 0, y = 0) => ({
  pointerType,
  pointerId: 1,
  clientX: x,
  clientY: y,
  composed: true,
});

function press(element: Element, pointerType = 'mouse') {
  fireEvent.pointerDown(element, pointer(pointerType));
  fireEvent.pointerUp(element, pointer(pointerType));
}

function open() {
  fireEvent.click(screen.getByRole('button', {name: 'Filters'}));
  expect(screen.getByRole('status')).toHaveTextContent('open');
}

describe('usePopover: a press outside a pageOrder popover', () => {
  it('leaves light dismiss to its own watch: the layer is a manual popover', () => {
    render(<Tip />);
    open();
    expect(document.querySelector('[popover]')).toHaveAttribute(
      'popover',
      'manual',
    );
  });

  it.each([[true], [false]])(
    'keeps the browser light dismiss for a contain popover with isModal %s',
    isModal => {
      render(<Tip tabBehavior="contain" isModal={isModal} />);
      open();
      expect(document.querySelector('[popover]')).toHaveAttribute(
        'popover',
        'auto',
      );
    },
  );

  it('leaves a press in a modal dialog above it to that dialog', () => {
    render(
      <>
        <Tip />
        <dialog data-testid="modal" open>
          <button type="button">In dialog</button>
        </dialog>
      </>,
    );
    open();
    // jsdom answers false to `:modal` for everything, so give this dialog
    // the browser's answer.
    const modal = screen.getByTestId('modal');
    const nativeMatches = modal.matches.bind(modal);
    vi.spyOn(modal, 'matches').mockImplementation((selectors: string) =>
      selectors === ':modal' ? true : nativeMatches(selectors),
    );

    press(screen.getByRole('button', {name: 'In dialog'}));
    expect(screen.getByRole('status')).toHaveTextContent('open');
    // A press on the backdrop targets the dialog element.
    press(modal);
    expect(screen.getByRole('status')).toHaveTextContent('open');
  });

  it('closes for a press on the backdrop of the modal dialog that holds it', () => {
    render(
      <dialog data-testid="modal" open>
        <Tip />
      </dialog>,
    );
    open();
    const modal = screen.getByTestId('modal');
    const nativeMatches = modal.matches.bind(modal);
    vi.spyOn(modal, 'matches').mockImplementation((selectors: string) =>
      selectors === ':modal' ? true : nativeMatches(selectors),
    );

    // A press on the backdrop targets the dialog element.
    press(modal);
    expect(screen.getByRole('status')).toHaveTextContent('closed');
  });

  it('stays closed when the pressed control toggles it in the same press', () => {
    const onHide = vi.fn();
    const onShow = vi.fn();
    render(<Tip onHide={onHide} onShow={onShow} />);
    open();
    const pageToggle = screen.getByRole('button', {
      name: 'Toggle from the page',
    });

    press(pageToggle);
    expect(screen.getByRole('status')).toHaveTextContent('closed');
    // The click of the press that closed it does not open it again.
    fireEvent.click(pageToggle);
    expect(screen.getByRole('status')).toHaveTextContent('closed');
    expect(onHide).toHaveBeenCalledOnce();
    expect(onShow).toHaveBeenCalledOnce();

    // A later press opens it.
    press(pageToggle);
    fireEvent.click(pageToggle);
    expect(screen.getByRole('status')).toHaveTextContent('open');
  });

  it('closes for a press that starts and ends outside, and reports the hide', () => {
    const onHide = vi.fn();
    render(<Tip onHide={onHide} />);
    open();
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(screen.getByRole('status')).toHaveTextContent('closed');
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('stays open for a press inside it', () => {
    render(<Tip />);
    open();
    press(screen.getByRole('button', {name: 'Got it', hidden: true}));
    expect(screen.getByRole('status')).toHaveTextContent('open');
  });

  it('leaves a press on its trigger to the trigger', () => {
    const onHide = vi.fn();
    render(<Tip onHide={onHide} />);
    open();
    press(screen.getByRole('button', {name: 'Filters'}));
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('open');
  });

  it('stays open while a finger outside pans the page, and closes for a tap', () => {
    render(<Tip />);
    open();
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    fireEvent.pointerDown(elsewhere, pointer('touch'));
    fireEvent.pointerMove(elsewhere, pointer('touch', 0, 40));
    fireEvent.pointerUp(elsewhere, pointer('touch', 0, 40));
    expect(screen.getByRole('status')).toHaveTextContent('open');
    press(elsewhere, 'touch');
    expect(screen.getByRole('status')).toHaveTextContent('closed');
  });

  it('stays open for a press outside when light dismiss is off', () => {
    render(<Tip hasLightDismiss={false} />);
    open();
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(screen.getByRole('status')).toHaveTextContent('open');
  });

  it('stops closing when light dismiss turns off while it is open', () => {
    const {rerender} = render(<Tip />);
    open();
    rerender(<Tip hasLightDismiss={false} />);
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(screen.getByRole('status')).toHaveTextContent('open');
  });

  it('reports nothing more for a second press outside after the close', () => {
    const onHide = vi.fn();
    render(<Tip onHide={onHide} />);
    open();
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    press(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(onHide).toHaveBeenCalledOnce();
  });
});
