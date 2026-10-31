// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePressPin.test.tsx
 * @input Uses vitest, @testing-library/react, Tooltip, HoverCard,
 *   useTooltipInternal, usePressPin
 * @output Proof of `pressTrigger="toggle"` (component:Tooltip FR9 and FR10,
 *   component:HoverCard FR9 and FR10): a press pins and closes the layer, a
 *   pinned layer survives the pointer leaving and closes on Escape, a second
 *   press, a press outside, or focus leaving; the trigger carries
 *   aria-expanded and aria-controls and the layer is announced once; the press
 *   stops at its trigger; a non-button trigger warns and keeps tap-only
 *   opening; a trigger whose layer repeats its text pins with no toggle state
 * @position Unit tests beside usePressPin
 *
 * SYNC: When usePressPin.ts, useTooltip.tsx, or useHoverCard.tsx change,
 * update these cases.
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
import type {ReactElement, ReactNode} from 'react';
import {Tooltip} from '../Tooltip/Tooltip';
import {useTooltipInternal} from '../Tooltip/useTooltip';
import {HoverCard} from '../HoverCard/HoverCard';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {Item} from '../Item/Item';
import {announceMessage} from '../hooks/useAnnounce';
import type * as UseAnnounceModule from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {__resetDevWarnings} from '../utils/devWarning';

vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<typeof UseAnnounceModule>()),
  announceMessage: vi.fn(() => null),
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
      pressTrigger="toggle"
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

describe('Tooltip pressTrigger="toggle" (component:Tooltip FR9)', () => {
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
    fireEvent.pointerDown(layerOf(TIP) as HTMLElement);
    expect(shows(TIP)).toBe(true);
    fireEvent.pointerDown(screen.getByText('Elsewhere'));
    expect(shows(TIP)).toBe(false);
  });

  it('focus moving outside closes it', () => {
    render(
      <>
        <InfoTooltip />
        <button type="button">Next field</button>
      </>,
    );
    click(screen.getByRole('button', {name: 'About billing'}));
    act(() => {
      screen.getByRole('button', {name: 'Next field'}).focus();
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
        expect.stringContaining('pressTrigger="toggle"'),
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
});

describe('Tooltip pressTrigger="toggle" trigger state (component:Tooltip FR10)', () => {
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
    expect(announceMessage).not.toHaveBeenCalled();
    click(trigger);
    expect(announceMessage).toHaveBeenCalledTimes(1);
    expect(announceMessage).toHaveBeenCalledWith(TIP, 'polite');
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
    pressTrigger: 'toggle',
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
      expect(announceMessage).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      fireEvent.keyDown(trigger, {key: 'Enter'});
      expect(
        full?.closest<HTMLElement>('[popover]')?.matches(':popover-open'),
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('HoverCard pressTrigger="toggle" (component:HoverCard FR9, FR10)', () => {
  const CARD = 'Ada Lovelace, analyst';

  function ProfileCard({onRow}: {onRow?: () => void}): ReactElement {
    return (
      <div onClick={onRow}>
        <HoverCard
          content={<p>{CARD}</p>}
          label="Ada's profile"
          pressTrigger="toggle">
          <button type="button">Ada</button>
        </HoverCard>
      </div>
    );
  }

  it('a press pins the card, a press on its content keeps it, and the trigger press closes it', () => {
    render(<ProfileCard />);
    const trigger = screen.getByRole('button', {name: 'Ada'});
    click(trigger);
    expect(shows(CARD)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute(
      'aria-controls',
      (layerOf(CARD) as HTMLElement).id,
    );
    fireEvent.pointerDown(screen.getByText(CARD));
    expect(shows(CARD)).toBe(true);
    click(trigger);
    expect(shows(CARD)).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('announces its label once when it pins', () => {
    render(<ProfileCard />);
    click(screen.getByRole('button', {name: 'Ada'}));
    expect(announceMessage).toHaveBeenCalledTimes(1);
    expect(announceMessage).toHaveBeenCalledWith("Ada's profile", 'polite');
  });

  it('the press stops at its trigger: the row around it does not activate', () => {
    const onRow = vi.fn();
    render(<ProfileCard onRow={onRow} />);
    tap(screen.getByRole('button', {name: 'Ada'}));
    expect(shows(CARD)).toBe(true);
    expect(onRow).not.toHaveBeenCalled();
  });
});
