// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePressPin.test.tsx
 * @input Uses vitest, @testing-library/react, Tooltip, useTooltipInternal,
 *   usePressPin
 * @output Proof of `triggerBehavior="toggle"` (component:Tooltip FR9 and FR10):
 *   a press pins and closes the layer, a
 *   pinned layer survives the pointer leaving and closes on Escape, a second
 *   press, a press outside, or focus leaving; the trigger carries
 *   aria-expanded and aria-controls and the layer is announced once; the press
 *   stops at its trigger; a non-button trigger warns and keeps tap-only
 *   opening; a trigger whose layer repeats its text pins with no toggle state
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
import {useRef, useState, type ReactElement, type ReactNode} from 'react';
import {Tooltip} from '../Tooltip/Tooltip';
import {useTooltipInternal} from '../Tooltip/useTooltip';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {Dialog} from '../Dialog/Dialog';
import {Item} from '../Item/Item';
import {Table} from '../Table/Table';
import {useTableRowExpansion} from '../Table/plugins/rowExpansion/useTableRowExpansion';
import {announceMessage} from '../hooks/useAnnounce';
import type * as UseAnnounceModule from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {__resetDevWarnings} from '../utils/devWarning';

// The pin speaks through useAnnounce, which routes a message into an open
// modal's own region (spec:AST-086 FR14, its own tests); writing straight to
// the page-body region would go unheard behind a modal.
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
    <Tooltip
      content="Billed on the first of each month"
      triggerBehavior="toggle"
      {...props}>
      {children ?? (
        <button type="button" aria-label="About billing">
          i
        </button>
      )}
    </Tooltip>
  );
}

const TIP = 'Billed on the first of each month';

describe('Tooltip triggerBehavior="toggle" (component:Tooltip FR9)', () => {
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
    expect(shows(TIP)).toBe(false);
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
    // The hover layers' one outside-dismissal owner (useTouchTrigger) closes
    // it when the press outside lifts.
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

  it('a triggerBehavior that turns to toggle after mount wires the trigger', () => {
    const {rerender} = render(
      <Tooltip content={TIP}>
        <button type="button" aria-label="About billing">
          i
        </button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', {name: 'About billing'});
    expect(trigger).not.toHaveAttribute('aria-expanded');
    rerender(
      <Tooltip content={TIP} triggerBehavior="toggle">
        <button type="button" aria-label="About billing">
          i
        </button>
      </Tooltip>,
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
        <Tooltip content={TIP} triggerBehavior="toggle" focusTrigger="never">
          <button type="button" aria-label="About billing">
            i
          </button>
        </Tooltip>
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

  it('a pinned tooltip whose triggerBehavior turns to adaptive closes on leave again', () => {
    vi.useFakeTimers();
    const tip = (triggerBehavior?: 'toggle') => (
      <Tooltip content={TIP} triggerBehavior={triggerBehavior}>
        <button type="button" aria-label="About billing">
          i
        </button>
      </Tooltip>
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
        expect.stringContaining('triggerBehavior="toggle"'),
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
        <Tooltip content={TIP} triggerBehavior="toggle" delay={delay}>
          <span tabIndex={0}>Billing</span>
        </Tooltip>
      );
      const {rerender} = render(tip(200));
      rerender(tip(300));
      rerender(tip(400));
      const calls = warn.mock.calls.filter(([message]) =>
        String(message).includes('triggerBehavior="toggle"'),
      );
      expect(calls).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('Tooltip triggerBehavior="adaptive" and "hover" (component:Tooltip FR5)', () => {
  /** An info-only trigger: a tap on it performs no action of its own. */
  function Hint(props: {triggerBehavior?: 'adaptive' | 'hover'}): ReactElement {
    return (
      <Tooltip content={TIP} {...props}>
        <span tabIndex={0}>Billing</span>
      </Tooltip>
    );
  }

  it('adaptive, the default: a tap on an info-only trigger opens it', () => {
    render(<Hint />);
    tap(screen.getByText('Billing'));
    expect(shows(TIP)).toBe(true);
  });

  it('hover: a tap never opens it, a mouse hover still previews it, and no press pins it', () => {
    vi.useFakeTimers();
    render(<Hint triggerBehavior="hover" />);
    const trigger = screen.getByText('Billing');
    tap(trigger);
    expect(shows(TIP)).toBe(false);
    fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(shows(TIP)).toBe(true);
    click(trigger);
    expect(trigger).not.toHaveAttribute('aria-expanded');
  });
});

describe('Tooltip triggerBehavior="toggle" trigger state (component:Tooltip FR10)', () => {
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
          <Tooltip content={TIP} anchorRef={ref} triggerBehavior="toggle" />
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

/** A truncated Text that is its own tab stop: its tooltip repeats its text. */
function RepeatingText({text}: {text: string}): ReactElement {
  const tooltip = useTooltipInternal({
    triggerBehavior: 'toggle',
    repeatsTriggerText: true,
  });
  return (
    <>
      <span
        ref={tooltip.ref}
        tabIndex={0}
        aria-describedby={tooltip.describedBy}>
        {text}
      </span>
      {tooltip.renderTooltip(<span data-full="">{text}</span>)}
    </>
  );
}

describe('a trigger whose tooltip repeats its own text (component:Tooltip FR9)', () => {
  it('pins without being a button, with no warning, toggle state, or announcement', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(<RepeatingText text="Quarterly revenue by region" />);
      const trigger = screen.getAllByText('Quarterly revenue by region')[0];
      click(trigger);
      const full = document.querySelector<HTMLElement>('[data-full]');
      expect(
        full?.closest<HTMLElement>('[popover]')?.matches(':popover-open'),
      ).toBe(true);
      expect(trigger).not.toHaveAttribute('aria-expanded');
      expect(trigger).not.toHaveAttribute('aria-controls');
      expect(announce).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      fireEvent.keyDown(trigger, {key: 'Enter'});
      expect(
        full?.closest<HTMLElement>('[popover]')?.matches(':popover-open'),
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('inside an Astryx ClickableCard, with no wrapper to stop the press, the card does not open', () => {
    const onCard = vi.fn();
    render(
      <ClickableCard label="Revenue" onClick={onCard}>
        <RepeatingText text="Quarterly revenue by region" />
      </ClickableCard>,
    );
    click(screen.getAllByText('Quarterly revenue by region')[0]);
    const full = document.querySelector<HTMLElement>('[data-full]');
    expect(
      full?.closest<HTMLElement>('[popover]')?.matches(':popover-open'),
    ).toBe(true);
    expect(onCard).not.toHaveBeenCalled();
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
