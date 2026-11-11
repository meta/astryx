// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render} from '@testing-library/react';
import {useLayoutEffect, useRef, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as reducedMotion from '../motion/reducedMotion';
import {useMonthYearToggle} from './useMonthYearToggle';

vi.mock('../motion/reducedMotion', async importOriginal => ({
  ...(await importOriginal<typeof reducedMotion>()),
  playReducedMotionDip: vi.fn(),
}));

const {playReducedMotionDip} = reducedMotion;

function Panels({
  isWheelOpen,
  isTouch = true,
  onCommit,
  onToggle,
}: {
  isWheelOpen: boolean;
  isTouch?: boolean;
  onCommit?: () => void;
  /** Renders a toggle that hands focus over, as the sheets' title does. */
  onToggle?: (next: boolean) => void;
}) {
  // Every commit, to count the renders a toggle costs.
  useLayoutEffect(() => {
    onCommit?.();
  });
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const wheelsRef = useRef<HTMLDivElement | null>(null);
  const {isCalendarInert, isWheelsInert, toggle} = useMonthYearToggle({
    isWheelOpen,
    setIsWheelOpen: next => onToggle?.(next),
    isTouch,
    calendarRef,
    wheelsRef,
  });
  return (
    <>
      {onToggle != null && (
        <button type="button" onClick={() => toggle(!isWheelOpen)}>
          Toggle
        </button>
      )}
      <div
        ref={calendarRef}
        data-testid="calendar"
        aria-hidden={isWheelOpen ? true : undefined}
        inert={isCalendarInert ? true : undefined}>
        <button type="button">15</button>
      </div>
      <div
        ref={wheelsRef}
        data-testid="wheels"
        aria-hidden={isWheelOpen ? undefined : true}
        inert={isWheelsInert ? true : undefined}>
        <div role="listbox" aria-label="Month" tabIndex={0} />
      </div>
    </>
  );
}

/** Panels behind a toggle that owns the state. */
function TogglePanels({onCommit}: {onCommit?: () => void}) {
  const [isWheelOpen, setIsWheelOpen] = useState(false);
  return (
    <Panels
      isWheelOpen={isWheelOpen}
      onCommit={onCommit}
      onToggle={setIsWheelOpen}
    />
  );
}

/** Makes `getAnimations()` report a running opacity transition on these. */
function fading(...elements: HTMLElement[]) {
  for (const element of elements) {
    element.getAnimations = () =>
      [
        {transitionProperty: 'opacity', playState: 'running'},
      ] as unknown as Animation[];
  }
}

/** A transition of `propertyName` starting on `element`, as the toggle's fade does. */
function transitionRun(element: HTMLElement, propertyName = 'opacity') {
  const event = new Event('transitionrun', {bubbles: true});
  Object.assign(event, {propertyName});
  act(() => {
    element.dispatchEvent(event);
  });
}

async function fadeEnd(element: HTMLElement, type = 'transitionend') {
  transitionRun(element);
  const event = new Event(type, {bubbles: true});
  Object.assign(event, {propertyName: 'opacity'});
  act(() => {
    element.dispatchEvent(event);
  });
  // The swap lands one frame after the end.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
}

describe('useMonthYearToggle: inert and focus', () => {
  it('makes the outgoing panel inert when its fade ends, never with the toggle', async () => {
    const view = render(<Panels isWheelOpen={false} />);
    const calendar = view.getByTestId('calendar');
    const wheels = view.getByTestId('wheels');
    expect(wheels.hasAttribute('inert')).toBe(true);
    fading(calendar, wheels);
    view.rerender(<Panels isWheelOpen />);
    // With the toggle: the outgoing panel leaves assistive technology, and
    // neither panel's `inert` changes yet.
    expect(calendar.getAttribute('aria-hidden')).toBe('true');
    expect(calendar.hasAttribute('inert')).toBe(false);
    expect(wheels.hasAttribute('inert')).toBe(true);
    // Another property's transition ending changes nothing.
    const other = new Event('transitionend', {bubbles: true});
    Object.assign(other, {propertyName: 'transform'});
    act(() => {
      calendar.dispatchEvent(other);
    });
    expect(calendar.hasAttribute('inert')).toBe(false);
    await fadeEnd(calendar);
    expect(calendar.hasAttribute('inert')).toBe(true);
    expect(wheels.hasAttribute('inert')).toBe(false);
  });

  it('does not settle at the end of a transition that ran before the toggle', async () => {
    const view = render(<Panels isWheelOpen={false} />);
    const calendar = view.getByTestId('calendar');
    const wheels = view.getByTestId('wheels');
    fading(calendar, wheels);
    view.rerender(<Panels isWheelOpen />);
    // The wheels' warm-up turned their visibility on just before the toggle:
    // that transition ends during the fade, and the panels keep their inert.
    const warmUpEnd = new Event('transitionend', {bubbles: true});
    Object.assign(warmUpEnd, {propertyName: 'visibility'});
    act(() => {
      wheels.dispatchEvent(warmUpEnd);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(calendar.hasAttribute('inert')).toBe(false);
    expect(wheels.hasAttribute('inert')).toBe(true);
    await fadeEnd(calendar);
    expect(calendar.hasAttribute('inert')).toBe(true);
    expect(wheels.hasAttribute('inert')).toBe(false);
  });

  it('waits for the visibility the layer beneath holds for the fade', async () => {
    const view = render(<Panels isWheelOpen={false} />);
    const calendar = view.getByTestId('calendar');
    calendar.getAnimations = () =>
      [
        {transitionProperty: 'visibility', playState: 'running'},
      ] as unknown as Animation[];
    view.rerender(<Panels isWheelOpen />);
    expect(calendar.hasAttribute('inert')).toBe(false);
    transitionRun(calendar, 'visibility');
    const end = new Event('transitionend', {bubbles: true});
    Object.assign(end, {propertyName: 'visibility'});
    act(() => {
      calendar.dispatchEvent(end);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(calendar.hasAttribute('inert')).toBe(true);
  });

  it('swaps with the incoming panel\u2019s entrance when the outgoing one has no exit', async () => {
    const view = render(<Panels isWheelOpen={false} />);
    const calendar = view.getByTestId('calendar');
    const wheels = view.getByTestId('wheels');
    // The calendar stays visible beneath (no exit); the wheels fade in.
    calendar.getAnimations = () => [];
    fading(wheels);
    view.rerender(<Panels isWheelOpen />);
    expect(calendar.hasAttribute('inert')).toBe(false);
    await fadeEnd(wheels);
    expect(calendar.hasAttribute('inert')).toBe(true);
    expect(wheels.hasAttribute('inert')).toBe(false);
  });

  it('makes it inert on transitioncancel too', async () => {
    const view = render(<Panels isWheelOpen />);
    const calendar = view.getByTestId('calendar');
    const wheels = view.getByTestId('wheels');
    fading(calendar, wheels);
    view.rerender(<Panels isWheelOpen={false} />);
    expect(wheels.hasAttribute('inert')).toBe(false);
    expect(calendar.hasAttribute('inert')).toBe(true);
    // The cancelled transition is gone, and nothing replaces it.
    wheels.getAnimations = () => [];
    await fadeEnd(wheels, 'transitioncancel');
    expect(wheels.hasAttribute('inert')).toBe(true);
    expect(calendar.hasAttribute('inert')).toBe(false);
  });

  it('waits for the replacement when a cancelled transition runs again at once', async () => {
    const view = render(<Panels isWheelOpen />);
    const calendar = view.getByTestId('calendar');
    const wheels = view.getByTestId('wheels');
    fading(calendar, wheels);
    view.rerender(<Panels isWheelOpen={false} />);
    // The wheels' opacity transition is cancelled and replaced in one frame:
    // a transition of that property still runs, so the fade goes on.
    await fadeEnd(wheels, 'transitioncancel');
    expect(wheels.hasAttribute('inert')).toBe(false);
    expect(calendar.hasAttribute('inert')).toBe(true);
    await fadeEnd(wheels);
    expect(wheels.hasAttribute('inert')).toBe(true);
    expect(calendar.hasAttribute('inert')).toBe(false);
  });

  it('swaps inert with the toggle with a mouse, fade or not', () => {
    const view = render(<Panels isWheelOpen={false} isTouch={false} />);
    fading(view.getByTestId('calendar'), view.getByTestId('wheels'));
    view.rerender(<Panels isWheelOpen isTouch={false} />);
    expect(view.getByTestId('calendar').hasAttribute('inert')).toBe(true);
    expect(view.getByTestId('wheels').hasAttribute('inert')).toBe(false);
  });

  it('swaps with the toggle in one commit with a mouse', () => {
    let commits = 0;
    const onCommit = () => {
      commits += 1;
    };
    const view = render(
      <Panels isWheelOpen={false} isTouch={false} onCommit={onCommit} />,
    );
    commits = 0;
    view.rerender(<Panels isWheelOpen isTouch={false} onCommit={onCommit} />);
    expect(commits).toBe(1);
    view.rerender(
      <Panels isWheelOpen={false} isTouch={false} onCommit={onCommit} />,
    );
    expect(commits).toBe(2);
  });

  it('makes it inert with the toggle when no fade runs', () => {
    const view = render(<Panels isWheelOpen={false} />);
    view.rerender(<Panels isWheelOpen />);
    expect(view.getByTestId('calendar').hasAttribute('inert')).toBe(true);
    expect(view.getByTestId('wheels').hasAttribute('inert')).toBe(false);
  });

  it('moves focus inside the outgoing panel to the incoming one in the toggle\u2019s commit', () => {
    let commits = 0;
    const view = render(
      <TogglePanels
        onCommit={() => {
          commits += 1;
        }}
      />,
    );
    const calendar = view.getByTestId('calendar');
    fading(calendar, view.getByTestId('wheels'));
    calendar.querySelector('button')!.focus();
    commits = 0;
    fireEvent.click(view.getByRole('button', {name: 'Toggle'}));
    // The incoming panel goes live with the toggle to take focus.
    expect(view.getByTestId('wheels').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(view.getByRole('listbox'));
    expect(commits).toBe(1);
  });

  it('leaves focus outside the panels where it is', () => {
    const view = render(<TogglePanels />);
    const toggle = view.getByRole('button', {name: 'Toggle'});
    toggle.focus();
    fireEvent.click(toggle);
    expect(document.activeElement).toBe(toggle);
  });
});

const CLOSED = 'matrix(0, -1, 1, 0, 0, 0)';

function Title() {
  const [isOpen, setIsOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const wheelsRef = useRef<HTMLDivElement | null>(null);
  const {titleRef, toggle} = useMonthYearToggle({
    isWheelOpen: isOpen,
    setIsWheelOpen: setIsOpen,
    isTouch: true,
    calendarRef,
    wheelsRef,
  });
  return (
    <button
      ref={titleRef}
      type="button"
      data-open={isOpen}
      onClick={() => toggle(!isOpen)}>
      <span className="astryx-icon" />
    </button>
  );
}

describe('useMonthYearToggle: the chevron under Reduced Motion on a touch screen', () => {
  const dips: {cancel: ReturnType<typeof vi.fn>}[] = [];
  let glyphOpacity = '1';
  beforeEach(() => {
    dips.length = 0;
    glyphOpacity = '1';
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        query.includes('prefers-reduced-motion: reduce') ||
        /pointer:\s*coarse/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    Element.prototype.animate = vi.fn() as typeof Element.prototype.animate;
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element =>
      element.classList.contains('astryx-icon')
        ? ({
            opacity: glyphOpacity,
            transform: (element as HTMLElement).style.transform || CLOSED,
          } as CSSStyleDeclaration)
        : computed(element),
    );
    vi.mocked(playReducedMotionDip).mockClear();
    vi.mocked(playReducedMotionDip).mockImplementation(() => {
      const dip = {cancel: vi.fn()};
      dips.push(dip);
      return dip;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('holds the shown turn until the dip lands, then lets the new state turn it', () => {
    const view = render(<Title />);
    const glyph = view.container.querySelector<HTMLElement>('.astryx-icon')!;
    fireEvent.click(view.getByRole('button'));
    expect(dips).toHaveLength(1);
    const [element, , land, from] =
      vi.mocked(playReducedMotionDip).mock.calls[0];
    expect(element).toBe(glyph);
    expect(from).toBe(1);
    expect(glyph.style.transform).toBe(CLOSED);
    land();
    expect(glyph.style.transform).toBe('');
  });

  it('restarts a second dip within the first from the glyph’s presented opacity, and cancels the first', () => {
    const view = render(<Title />);
    fireEvent.click(view.getByRole('button'));
    // Part way into the first dip.
    glyphOpacity = '0.4';
    fireEvent.click(view.getByRole('button'));
    expect(dips).toHaveLength(2);
    expect(dips[0].cancel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playReducedMotionDip).mock.calls[1][3]).toBe(0.4);
  });

  it('cancels its dip on unmount', () => {
    const view = render(<Title />);
    fireEvent.click(view.getByRole('button'));
    view.unmount();
    expect(dips[0].cancel).toHaveBeenCalledTimes(1);
  });
});
