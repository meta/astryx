// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InfoTip.pin.test.tsx
 * @input Uses vitest, @testing-library/react, InfoTip, Tooltip, HoverCard
 * @output Tests of InfoTip's press-to-pin on useTooltip's show() and hide():
 *   a press pins and closes the help, and a pin stays when the pointer
 *   leaves. Escape, a second press, a press outside, or focus leaving closes
 *   it. The button carries the toggle state, a press on a hover preview keeps
 *   it shown, and the press stops at the button. Plus the touch trigger's
 *   outside close for a trigger in another document.
 * @position Unit tests beside InfoTip.tsx and useTooltip.tsx
 *
 * SYNC: When InfoTip.tsx or useTooltip.tsx change, update these cases.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import type {ReactElement} from 'react';
import {InfoTip} from './InfoTip';
import {Tooltip} from '../Tooltip/Tooltip';
import {HoverCard} from '../HoverCard/HoverCard';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {Dialog} from '../Dialog/Dialog';
import {Item} from '../Item/Item';
import {announceMessage} from '../hooks/useAnnounce';
import type * as UseAnnounceModule from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {__resetDevWarnings} from '../utils/devWarning';

// useAnnounce routes the pin's message into an open modal's own region.
const {announce} = vi.hoisted(() => ({announce: vi.fn()}));
vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<typeof UseAnnounceModule>()),
  announceMessage: vi.fn(() => null),
  useAnnounce: () => announce,
}));

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    this: HTMLElement,
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

beforeEach(() => {
  __resetInteractionModalityForTest();
  __resetDevWarnings();
  vi.mocked(announceMessage).mockClear();
  announce.mockClear();
  // jsdom does not implement showModal/close.
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
  vi.useRealTimers();
});

/** The layer holding `text`, when it is rendered. */
function layerOf(text: string): HTMLElement | null {
  return (
    screen
      .queryByText(text, {exact: false})
      ?.closest<HTMLElement>('[popover]') ?? null
  );
}

/** Whether the layer holding `text` shows. */
function shows(text: string): boolean {
  const layer = layerOf(text);
  return layer != null && layer.matches(':popover-open');
}

/** A finger's tap, in the order a browser dispatches it. */
function tap(element: HTMLElement) {
  fireEvent.pointerEnter(element, {pointerType: 'touch'});
  fireEvent.pointerDown(element, {pointerType: 'touch'});
  fireEvent.pointerUp(element, {pointerType: 'touch'});
  fireEvent.mouseEnter(element);
  fireEvent.click(element);
}

/** A mouse click: the press, then its click. */
function click(element: HTMLElement) {
  fireEvent.pointerDown(element, {pointerType: 'mouse'});
  fireEvent.pointerUp(element, {pointerType: 'mouse'});
  fireEvent.click(element, {detail: 1});
}

const TIP = 'Billed on the first of each month';

function InfoTooltip(): ReactElement {
  return <InfoTip content={TIP} label="About billing" />;
}

describe('InfoTip press-to-pin (component:InfoTip FR2)', () => {
  it('renders its button with no wrapper; the rest is the layer’s own nodes', () => {
    const {container} = render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    const [first, ...rest] = Array.from(container.children);
    expect(first).toBe(trigger);
    // The layer renders its surface and a placeholder template, and nothing
    // wraps the button.
    expect(
      rest.map(node =>
        node.hasAttribute('popover') ? 'layer' : node.tagName.toLowerCase(),
      ),
    ).toEqual(['template', 'layer']);
  });

  it('a pen tap pins it, and the next pen tap closes it', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    const penTap = () => {
      fireEvent.pointerDown(trigger, {pointerType: 'pen'});
      fireEvent.pointerUp(trigger, {pointerType: 'pen'});
      fireEvent.click(trigger, {detail: 1});
    };
    penTap();
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    penTap();
    expect(shows(TIP)).toBe(false);
  });

  it('a click pins the tooltip open, and the same click closes it', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    expect(shows(TIP)).toBe(true);
    click(trigger);
    expect(shows(TIP)).toBe(false);
  });

  it('a pinned tooltip stays when the pointer leaves the trigger', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shows(TIP)).toBe(true);
  });

  it('a tap pins it, and the next tap on the trigger closes it', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    tap(trigger);
    expect(shows(TIP)).toBe(true);
    tap(trigger);
    expect(shows(TIP)).toBe(false);
  });

  it('a keyboard press (Enter or Space: a click with no pointer) pins and closes it', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.click(trigger, {detail: 0});
    expect(shows(TIP)).toBe(true);
    fireEvent.click(trigger, {detail: 0});
    expect(shows(TIP)).toBe(false);
  });

  it('a mouse press on a hover preview pins it without hiding it first', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shows(TIP)).toBe(true);
    vi.mocked(HTMLElement.prototype.hidePopover).mockClear();
    fireEvent.pointerDown(trigger, {pointerType: 'mouse'});
    expect(shows(TIP)).toBe(true);
    // The press keeps it in view; only its click pins it.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerUp(trigger, {pointerType: 'mouse'});
    fireEvent.click(trigger, {detail: 1});
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
    click(trigger);
    expect(shows(TIP)).toBe(false);
  });

  it('a pen held on a hover preview pins it without hiding it first', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'pen'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shows(TIP)).toBe(true);
    vi.mocked(HTMLElement.prototype.hidePopover).mockClear();
    fireEvent.pointerDown(trigger, {pointerType: 'pen'});
    // The pen stays down past the hover delay, then lifts.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(shows(TIP)).toBe(true);
    fireEvent.pointerUp(trigger, {pointerType: 'pen'});
    fireEvent.click(trigger, {detail: 1});
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
  });

  it('after a press on a preview that ends off the button, Enter and Space still pin and close it', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // The press lifts outside the button, so no click follows.
    fireEvent.pointerDown(trigger, {pointerType: 'mouse', button: 0});
    fireEvent.pointerUp(document.body, {pointerType: 'mouse', button: 0});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger, {detail: 0});
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger, {detail: 0});
    expect(shows(TIP)).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a press on a preview released on the help ends its hold; hover then decides, and the next press pins it', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const help = layerOf(TIP) as HTMLElement;
    fireEvent.pointerDown(trigger, {pointerType: 'mouse', button: 0});
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(help);
    fireEvent.pointerUp(help, {pointerType: 'mouse', button: 0});
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // The pointer rests on the help: it stays, unpinned.
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.mouseLeave(help);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shows(TIP)).toBe(false);
    click(trigger);
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('a press on a preview released away from the button and the help ends its hold and closes it', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerDown(trigger, {pointerType: 'mouse', button: 0});
    fireEvent.mouseLeave(trigger);
    fireEvent.pointerUp(document.body, {pointerType: 'mouse', button: 0});
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shows(TIP)).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a right or middle press on a preview does not hold it', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    for (const button of [2, 1]) {
      fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(shows(TIP)).toBe(true);
      fireEvent.pointerDown(trigger, {pointerType: 'mouse', button});
      fireEvent.pointerUp(trigger, {pointerType: 'mouse', button});
      fireEvent.pointerLeave(trigger, {pointerType: 'mouse'});
      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(shows(TIP)).toBe(false);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('Escape closes a pinned tooltip', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    fireEvent.keyDown(trigger, {key: 'Escape'});
    expect(shows(TIP)).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a press outside closes it, and a press on the tooltip keeps it', () => {
    render(
      <>
        <InfoTooltip />
        <p>Elsewhere</p>
      </>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    const layer = layerOf(TIP) as HTMLElement;
    fireEvent.pointerDown(layer);
    fireEvent.pointerUp(layer);
    expect(shows(TIP)).toBe(true);
    // The outside dismissal (useTouchTrigger) closes it when the press lifts.
    const elsewhere = screen.getByText('Elsewhere');
    fireEvent.pointerDown(elsewhere);
    fireEvent.pointerUp(elsewhere);
    expect(shows(TIP)).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a scroll that starts outside closes it', () => {
    render(
      <>
        <InfoTooltip />
        <p>Elsewhere</p>
      </>,
    );
    click(screen.getByRole('button', {name: 'About billing'}));
    fireEvent.pointerCancel(screen.getByText('Elsewhere'));
    expect(shows(TIP)).toBe(false);
  });

  it('focus moving outside closes it', () => {
    render(
      <>
        <InfoTooltip />
        <button type="button">Next field</button>
      </>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    act(() => {
      trigger.focus();
    });
    click(trigger);
    expect(shows(TIP)).toBe(true);
    act(() => {
      screen.getByRole('button', {name: 'Next field'}).focus();
    });
    expect(shows(TIP)).toBe(false);
  });

  it('a press on the pinned tooltip’s own text keeps it, though focus moves to no element', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    act(() => {
      trigger.focus();
    });
    click(trigger);
    // In Chromium a press on text that takes no focus moves focus from the
    // trigger to the body: the focusout names no element.
    const text = screen.getByText(TIP);
    fireEvent.pointerDown(text);
    fireEvent.focusOut(trigger, {relatedTarget: null});
    fireEvent.pointerUp(text);
    fireEvent.click(text);
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('a pinned InfoTip and a caller ref that changes on each render', () => {
  it('stays pinned when the parent renders again with an inline ref', () => {
    const Parent = ({count}: {count: number}) => (
      <div data-count={count}>
        <InfoTip ref={() => {}} content={TIP} label="About billing" />
      </div>
    );
    const {rerender} = render(<Parent count={0} />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    expect(shows(TIP)).toBe(true);
    rerender(<Parent count={1} />);
    rerender(<Parent count={2} />);
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('InfoTip trigger state (component:InfoTip FR2)', () => {
  it('carries aria-expanded, true only while pinned, and aria-controls while it shows', () => {
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
    click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute(
      'aria-controls',
      (layerOf(TIP) as HTMLElement).id,
    );
    // The description link is kept (FR2).
    expect(trigger.getAttribute('aria-describedby')).toContain(
      (layerOf(TIP) as HTMLElement).id,
    );
    click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('a hover preview leaves aria-expanded false', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('announces its text once when it pins, and nothing for a preview', () => {
    vi.useFakeTimers();
    render(<InfoTooltip />);
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(announce).not.toHaveBeenCalled();
    click(trigger);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(TIP, 'polite');
  });
});

describe('an InfoTip press stops at its button', () => {
  it('a clickable row around the button does not activate', () => {
    const onRow = vi.fn();
    // The stop is React-only: page-level listeners still see each press.
    const onPage = vi.fn();
    document.addEventListener('click', onPage);
    render(
      <div onClick={onRow}>
        <InfoTooltip />
      </div>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    tap(trigger);
    expect(shows(TIP)).toBe(true);
    expect(onRow).not.toHaveBeenCalled();
    click(trigger);
    expect(shows(TIP)).toBe(false);
    expect(onRow).not.toHaveBeenCalled();
    expect(onPage).toHaveBeenCalledTimes(2);
    document.removeEventListener('click', onPage);
  });

  it('a press inside a label does not operate the labelled control', () => {
    render(
      <label>
        <input type="checkbox" /> Email me
        <InfoTooltip />
      </label>,
    );
    click(screen.getByRole('button', {name: 'About billing'}));
    expect(shows(TIP)).toBe(true);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('inside a ClickableCard, the card does not open', () => {
    const onCard = vi.fn();
    render(
      <ClickableCard label="Billing" onClick={onCard}>
        Billing
        <InfoTooltip />
      </ClickableCard>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    tap(trigger);
    expect(shows(TIP)).toBe(true);
    click(trigger);
    expect(shows(TIP)).toBe(false);
    expect(onCard).not.toHaveBeenCalled();
  });

  it('inside an Item row, the row does not activate', () => {
    const onRow = vi.fn();
    render(
      <Item label="Billing" onClick={onRow} endContent={<InfoTooltip />} />,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    expect(shows(TIP)).toBe(true);
    tap(trigger);
    expect(shows(TIP)).toBe(false);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('a plain Tooltip trigger still passes a tap to the row (released behavior)', () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <Tooltip content={TIP}>
          <button type="button" aria-label="About billing">
            i
          </button>
        </Tooltip>
      </div>,
    );
    tap(screen.getByRole('button', {name: 'About billing'}));
    expect(onRow).toHaveBeenCalledTimes(1);
  });
});

describe('a pin inside a modal Dialog (spec:AST-086 FR14)', () => {
  it('is announced through the modal, not the page body behind it', async () => {
    render(
      <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Billing">
        <InfoTooltip />
      </Dialog>,
    );
    click(screen.getByRole('button', {name: 'About billing'}));
    expect(shows(TIP)).toBe(true);
    expect(announce).toHaveBeenCalledWith(TIP, 'polite');
    expect(announceMessage).not.toHaveBeenCalled();
  });
});

describe('a hover layer whose trigger is in another document', () => {
  /** Renders `ui` into an iframe whose HTMLElement gets this file's popover stubs. */
  function renderInFrame(ui: ReactElement) {
    const iframe = document.body.appendChild(document.createElement('iframe'));
    const frame = iframe.contentWindow as Window & typeof globalThis;
    const proto = frame.HTMLElement.prototype;
    const frameMatches = proto.matches;
    proto.showPopover = HTMLElement.prototype.showPopover;
    proto.hidePopover = HTMLElement.prototype.hidePopover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (proto as any).matches = function (this: HTMLElement, selector: string) {
      return selector === ':popover-open'
        ? (popoverOpenState.get(this) ?? false)
        : frameMatches.call(this, selector);
    };
    const container = frame.document.body.appendChild(
      frame.document.createElement('div'),
    );
    const view = render(ui, {container, baseElement: frame.document.body});
    const done = () => {
      view.unmount();
      iframe.remove();
    };
    return {view, frame, done};
  }

  it('closes a pin when focus moves to another control in that document', () => {
    const {view, done} = renderInFrame(
      <>
        <InfoTooltip />
        <button type="button">Next</button>
      </>,
    );
    try {
      const trigger = view.getByRole('button', {name: 'About billing'});
      click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const next = view.getByRole('button', {name: 'Next'});
      fireEvent.focusOut(trigger, {relatedTarget: next});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    } finally {
      done();
    }
  });

  it('closes a pin on a press outside in that document', () => {
    const {view, done} = renderInFrame(
      <>
        <InfoTooltip />
        <p>Elsewhere</p>
      </>,
    );
    try {
      const trigger = view.getByRole('button', {name: 'About billing'});
      click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      // A press on content that takes no focus reaches only the listener.
      const elsewhere = view.getByText('Elsewhere');
      fireEvent.pointerDown(elsewhere);
      fireEvent.pointerUp(elsewhere);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    } finally {
      done();
    }
  });

  // A trigger that takes focus also closes through focus leaving in a real
  // engine, so these triggers take none.
  it('closes a tap-opened tooltip on a tap outside in that document', () => {
    const {view, frame, done} = renderInFrame(
      <>
        <Tooltip content={TIP}>
          <span>Billing date</span>
        </Tooltip>
        <p>Elsewhere</p>
      </>,
    );
    const open = () =>
      [document, frame.document].some(
        doc =>
          doc
            .querySelector<HTMLElement>('[popover]')
            ?.matches(':popover-open') === true,
      );
    try {
      tap(view.getByText('Billing date'));
      expect(open()).toBe(true);
      const elsewhere = view.getByText('Elsewhere');
      fireEvent.pointerDown(elsewhere, {pointerType: 'touch'});
      fireEvent.pointerUp(elsewhere, {pointerType: 'touch'});
      expect(open()).toBe(false);
      // A scroll that starts outside closes it too.
      tap(view.getByText('Billing date'));
      expect(open()).toBe(true);
      fireEvent.pointerCancel(elsewhere, {pointerType: 'touch'});
      expect(open()).toBe(false);
    } finally {
      done();
    }
  });

  it('closes a tap-opened HoverCard on a tap outside in that document', () => {
    const {view, frame, done} = renderInFrame(
      <>
        <HoverCard content={<p>Ada Lovelace, analyst</p>}>
          <span>Ada</span>
        </HoverCard>
        <p>Elsewhere</p>
      </>,
    );
    const open = () =>
      [document, frame.document].some(
        doc =>
          doc
            .querySelector<HTMLElement>('[popover]')
            ?.matches(':popover-open') === true,
      );
    try {
      tap(view.getByText('Ada'));
      expect(open()).toBe(true);
      const elsewhere = view.getByText('Elsewhere');
      fireEvent.pointerDown(elsewhere, {pointerType: 'touch'});
      fireEvent.pointerUp(elsewhere, {pointerType: 'touch'});
      expect(open()).toBe(false);
    } finally {
      done();
    }
  });
});
