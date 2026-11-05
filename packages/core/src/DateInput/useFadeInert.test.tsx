// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render} from '@testing-library/react';
import {useLayoutEffect, useRef, useState} from 'react';
import {describe, expect, it} from 'vitest';
import {useFadeInert} from './useFadeInert';

function Panels({
  isWheelOpen,
  isDeferred = true,
  onCommit,
  onToggle,
}: {
  isWheelOpen: boolean;
  isDeferred?: boolean;
  onCommit?: () => void;
  /** Renders a toggle that hands focus over, as the sheets' handlers do. */
  onToggle?: (next: boolean) => void;
}) {
  // Every commit, to count the renders a toggle costs.
  useLayoutEffect(() => {
    onCommit?.();
  });
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const wheelsRef = useRef<HTMLDivElement | null>(null);
  const {isCalendarInert, isWheelsInert, followFocus} = useFadeInert(
    isWheelOpen,
    calendarRef,
    wheelsRef,
    isDeferred,
  );
  return (
    <>
      {onToggle != null && (
        <button
          type="button"
          onClick={() => {
            followFocus(!isWheelOpen);
            onToggle(!isWheelOpen);
          }}>
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

describe('useFadeInert', () => {
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
    const view = render(<Panels isWheelOpen={false} isDeferred={false} />);
    fading(view.getByTestId('calendar'), view.getByTestId('wheels'));
    view.rerender(<Panels isWheelOpen isDeferred={false} />);
    expect(view.getByTestId('calendar').hasAttribute('inert')).toBe(true);
    expect(view.getByTestId('wheels').hasAttribute('inert')).toBe(false);
  });

  it('swaps with the toggle in one commit with a mouse', () => {
    let commits = 0;
    const onCommit = () => {
      commits += 1;
    };
    const view = render(
      <Panels isWheelOpen={false} isDeferred={false} onCommit={onCommit} />,
    );
    commits = 0;
    view.rerender(
      <Panels isWheelOpen isDeferred={false} onCommit={onCommit} />,
    );
    expect(commits).toBe(1);
    view.rerender(
      <Panels isWheelOpen={false} isDeferred={false} onCommit={onCommit} />,
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
