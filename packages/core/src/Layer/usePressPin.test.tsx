// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePressPin.test.tsx
 * @input Uses vitest, @testing-library/react, Tooltip, usePressPin
 * @output Tests of Tooltip's press-to-pin path: a press pins and closes the
 *   layer, and a pin stays when the pointer leaves. Escape, a second press, a
 *   press outside, or focus leaving closes it. The trigger carries the toggle
 *   state, the press stops at the trigger, and a non-button trigger warns.
 * @position Unit tests beside usePressPin
 *
 * SYNC: When usePressPin.ts or useTooltip.tsx change, update these cases.
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
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {Tooltip, TooltipWithTriggerBehavior} from '../Tooltip/Tooltip';
import {HoverCard} from '../HoverCard/HoverCard';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {Dialog} from '../Dialog/Dialog';
import {Item} from '../Item/Item';
import {Table} from '../Table/Table';
import {useTableRowExpansion} from '../Table/plugins/rowExpansion/useTableRowExpansion';
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

function InfoTooltip({
  children,
  ...props
}: {
  children?: ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}): ReactElement {
  return (
    <TooltipWithTriggerBehavior
      content="Billed on the first of each month"
      triggerBehavior="toggle"
      {...props}>
      {children ?? (
        <button type="button" aria-label="About billing">
          i
        </button>
      )}
    </TooltipWithTriggerBehavior>
  );
}

const TIP = 'Billed on the first of each month';

describe('Tooltip press-to-pin (component:Tooltip FR9)', () => {
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

  it('Enter and Space on a role="button" trigger pin and close it', () => {
    render(
      <InfoTooltip>
        <span role="button" tabIndex={0}>
          About billing
        </span>
      </InfoTooltip>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(shows(TIP)).toBe(true);
    fireEvent.keyDown(trigger, {key: ' '});
    fireEvent.keyUp(trigger, {key: ' '});
    expect(shows(TIP)).toBe(false);
  });

  it('Space on a role="button" trigger presses it on keyup, as on a native button', () => {
    render(
      <InfoTooltip>
        <span role="button" tabIndex={0}>
          About billing
        </span>
      </InfoTooltip>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    // The keydown scrolls nothing and pins nothing yet.
    expect(fireEvent.keyDown(trigger, {key: ' '})).toBe(false);
    expect(shows(TIP)).toBe(false);
    fireEvent.keyUp(trigger, {key: ' '});
    expect(shows(TIP)).toBe(true);
    // A keyup with no keydown on the trigger presses nothing.
    fireEvent.keyUp(trigger, {key: ' '});
    expect(shows(TIP)).toBe(true);
  });

  it.each(['keydown', 'keyup'] as const)(
    'a role="button" trigger that clicks itself on Space %s pins once',
    async timing => {
      const clickOnSpace = (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === ' ') {
          event.currentTarget.click();
        }
      };
      render(
        <InfoTooltip>
          <span
            role="button"
            tabIndex={0}
            onKeyDown={timing === 'keydown' ? clickOnSpace : undefined}
            onKeyUp={timing === 'keyup' ? clickOnSpace : undefined}>
            About billing
          </span>
        </InfoTooltip>,
      );
      const trigger = screen.getByRole('button', {name: 'About billing'});
      fireEvent.keyDown(trigger, {key: ' '});
      // A browser dispatches the keyup in a later task.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      fireEvent.keyUp(trigger, {key: ' '});
      expect(shows(TIP)).toBe(true);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    },
  );

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

  it('a trigger behavior that turns to toggle after mount wires the trigger', () => {
    const {rerender} = render(
      <TooltipWithTriggerBehavior content={TIP}>
        <button type="button" aria-label="About billing">
          i
        </button>
      </TooltipWithTriggerBehavior>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    expect(trigger).not.toHaveAttribute('aria-expanded');
    rerender(
      <TooltipWithTriggerBehavior content={TIP} triggerBehavior="toggle">
        <button type="button" aria-label="About billing">
          i
        </button>
      </TooltipWithTriggerBehavior>,
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    click(trigger);
    expect(shows(TIP)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    rerender(
      <Tooltip content={TIP}>
        <button type="button" aria-label="About billing">
          i
        </button>
      </Tooltip>,
    );
    expect(trigger).not.toHaveAttribute('aria-expanded');
  });

  it('with focusTrigger="never", focus moving to another control closes a pinned tooltip', () => {
    render(
      <>
        <TooltipWithTriggerBehavior
          content={TIP}
          triggerBehavior="toggle"
          focusTrigger="never">
          <button type="button" aria-label="About billing">
            i
          </button>
        </TooltipWithTriggerBehavior>
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
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a pinned tooltip whose trigger behavior turns to adaptive closes on leave again', () => {
    vi.useFakeTimers();
    const tip = (triggerBehavior?: 'toggle') => (
      <TooltipWithTriggerBehavior
        content={TIP}
        triggerBehavior={triggerBehavior}>
        <button type="button" aria-label="About billing">
          i
        </button>
      </TooltipWithTriggerBehavior>
    );
    const {rerender} = render(tip('toggle'));
    const trigger = screen.getByRole('button', {name: 'About billing'});
    click(trigger);
    expect(shows(TIP)).toBe(true);
    rerender(tip());
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shows(TIP)).toBe(false);
  });

  it('a controlled tooltip reports the toggled value and does not change itself (FR7)', () => {
    const onOpenChange = vi.fn();
    render(<InfoTooltip isOpen={false} onOpenChange={onOpenChange} />);
    click(screen.getByRole('button', {name: 'About billing'}));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(shows(TIP)).toBe(false);
  });

  it('a trigger that is not a button warns and keeps tap-only opening', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <InfoTooltip>
          <span tabIndex={0}>Billing</span>
        </InfoTooltip>,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('A press-to-pin tooltip'),
      );
      const trigger = screen.getByText('Billing');
      click(trigger);
      expect(shows(TIP)).toBe(false);
      expect(trigger).not.toHaveAttribute('aria-expanded');
      tap(trigger);
      expect(shows(TIP)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns once per trigger: at mount, and not again on re-render or re-attach', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const tip = (delay: number) => (
        <TooltipWithTriggerBehavior
          content={TIP}
          triggerBehavior="toggle"
          delay={delay}>
          <span tabIndex={0}>Billing</span>
        </TooltipWithTriggerBehavior>
      );
      const {rerender} = render(tip(200));
      rerender(tip(300));
      rerender(tip(400));
      const calls = warn.mock.calls.filter(([message]) =>
        String(message).includes('A press-to-pin tooltip'),
      );
      expect(calls).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('Tooltip without press-to-pin (component:Tooltip FR5)', () => {
  it('a tap on an info-only trigger opens it, and no press pins it', () => {
    render(
      <Tooltip content={TIP}>
        <span tabIndex={0}>Billing</span>
      </Tooltip>,
    );
    const trigger = screen.getByText('Billing');
    tap(trigger);
    expect(shows(TIP)).toBe(true);
    expect(trigger).not.toHaveAttribute('aria-expanded');
  });
});

describe('Tooltip press-to-pin trigger state (component:Tooltip FR10)', () => {
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

  it("restores the trigger's own aria-expanded and aria-controls on cleanup", () => {
    const {unmount} = render(
      <InfoTooltip>
        <button type="button" aria-expanded="false" aria-controls="menu-1">
          Menu
        </button>
      </InfoTooltip>,
    );
    const trigger = screen.getByRole('button', {name: 'Menu'});
    click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    unmount();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'menu-1');
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

describe('a toggle press stops at its trigger', () => {
  it('a clickable row around the trigger does not activate, and the trigger’s own onClick runs', () => {
    const onRow = vi.fn();
    const onOwn = vi.fn();
    // The stop is React-only: page-level listeners still see each press.
    const onPage = vi.fn();
    document.addEventListener('click', onPage);
    render(
      <div onClick={onRow}>
        <InfoTooltip>
          <button type="button" aria-label="About billing" onClick={onOwn}>
            i
          </button>
        </InfoTooltip>
      </div>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    tap(trigger);
    expect(shows(TIP)).toBe(true);
    expect(onOwn).toHaveBeenCalledTimes(1);
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

  describe('with anchorRef (component:Tooltip FR9: the caller’s own handlers still receive the press)', () => {
    function Anchored({
      onOwn,
      stopsOwnClick = false,
    }: {
      onOwn?: () => void;
      stopsOwnClick?: boolean;
    }) {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button
            ref={ref}
            type="button"
            aria-label="About billing"
            onClick={event => {
              onOwn?.();
              if (stopsOwnClick) {
                event.stopPropagation();
              }
            }}>
            i
          </button>
          <TooltipWithTriggerBehavior
            content={TIP}
            anchorRef={ref}
            triggerBehavior="toggle"
          />
        </>
      );
    }

    it('an action anchor’s own onClick fires on a pinning press', () => {
      const onOwn = vi.fn();
      render(<Anchored onOwn={onOwn} />);
      const trigger = screen.getByRole('button', {name: 'About billing'});
      click(trigger);
      expect(shows(TIP)).toBe(true);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(onOwn).toHaveBeenCalledTimes(1);
      click(trigger);
      expect(shows(TIP)).toBe(false);
      expect(onOwn).toHaveBeenCalledTimes(2);
    });

    it('an Astryx ClickableCard around the anchor does not open', () => {
      const onCard = vi.fn();
      render(
        <ClickableCard label="Billing" onClick={onCard}>
          Billing
          <Anchored />
        </ClickableCard>,
      );
      click(screen.getByRole('button', {name: 'About billing'}));
      expect(shows(TIP)).toBe(true);
      expect(onCard).not.toHaveBeenCalled();
    });

    it('an Astryx Item row around the anchor does not activate', () => {
      const onRow = vi.fn();
      render(
        <Item label="Billing" onClick={onRow} endContent={<Anchored />} />,
      );
      click(screen.getByRole('button', {name: 'About billing'}));
      expect(shows(TIP)).toBe(true);
      expect(onRow).not.toHaveBeenCalled();
    });

    it('an Astryx Table row that expands on click does not expand', () => {
      function Rows() {
        const [expanded, setExpanded] = useState(new Set<string>());
        const expansion = useTableRowExpansion<{id: string; name: string}>({
          expandedKeys: expanded,
          onToggle: key =>
            setExpanded(previous => {
              const next = new Set(previous);
              if (next.has(key)) {
                next.delete(key);
              } else {
                next.add(key);
              }
              return next;
            }),
          getRowKey: item => item.id,
          renderExpanded: item => <div data-testid="panel">{item.name}</div>,
          hasRowClickExpansion: true,
        });
        return (
          <Table
            data={[{id: 'a', name: 'Ada'}]}
            columns={[
              {key: 'name', header: 'Name', renderCell: () => <Anchored />},
            ]}
            idKey="id"
            plugins={{expansion}}
          />
        );
      }
      render(<Rows />);
      click(screen.getByRole('button', {name: 'About billing'}));
      expect(shows(TIP)).toBe(true);
      expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    });

    it('a plain onClick row receives the press, unless the anchor’s own onClick stops it', () => {
      const onRow = vi.fn();
      const {unmount} = render(
        <div onClick={onRow}>
          <Anchored />
        </div>,
      );
      click(screen.getByRole('button', {name: 'About billing'}));
      expect(shows(TIP)).toBe(true);
      expect(onRow).toHaveBeenCalledTimes(1);
      unmount();
      onRow.mockClear();
      render(
        <div onClick={onRow}>
          <Anchored stopsOwnClick />
        </div>,
      );
      click(screen.getByRole('button', {name: 'About billing'}));
      expect(shows(TIP)).toBe(true);
      expect(onRow).not.toHaveBeenCalled();
    });
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

  it('without the toggle, a tap still reaches the row (released behavior)', () => {
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
