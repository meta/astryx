// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tour.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event, Tour + TourStep
 * @output Unit tests for the Tour controller: step registration/order, advance,
 *   dismiss reasons, reset, backdrop, and useTour.
 * @position Testing; validates Tour.tsx / TourStep.tsx behavior
 *
 * SYNC: When Tour.tsx / TourStep.tsx change, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeAll} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {Profiler, useRef, useState} from 'react';
import {Tour} from './Tour';
import {TourStep} from './TourStep';
import {useTour} from './useTour';

// jsdom does not implement <dialog> showModal/close, which the Popover the
// steps render on relies on.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

// A small harness: two targets + a two-step tour, isActive controlled locally
// so onDismiss can turn it off like a real consumer.
function TwoStepTour({
  hasBackdrop = false,
  isStepCountShown = false,
  onDismiss,
}: {
  hasBackdrop?: boolean;
  isStepCountShown?: boolean;
  onDismiss?: (source: string) => void;
}) {
  const [isActive, setIsActive] = useState(true);
  const aRef = useRef<HTMLButtonElement>(null);
  const bRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" ref={aRef}>
        Target A
      </button>
      <button type="button" ref={bRef}>
        Target B
      </button>
      <Tour
        isActive={isActive}
        hasBackdrop={hasBackdrop}
        isStepCountShown={isStepCountShown}
        onDismiss={source => {
          onDismiss?.(source);
          if (source !== 'skip') {
            setIsActive(false);
          }
        }}>
        <TourStep targetRef={aRef} heading="First">
          First body
        </TourStep>
        <TourStep targetRef={bRef} heading="Second">
          Second body
        </TourStep>
      </Tour>
    </>
  );
}

describe('Tour', () => {
  it('shows only the first step initially', () => {
    render(<TwoStepTour />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('advances to the next step on Next', () => {
    render(<TwoStepTour />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('goes back on Back', () => {
    render(<TwoStepTour />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('hides Back on the first step', () => {
    render(<TwoStepTour />);
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });

  it('labels the final step action "Done" and earlier steps "Next"', () => {
    render(<TwoStepTour />);
    expect(screen.getByText('Next')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('dismisses with "complete" when advancing past the last step', () => {
    const onDismiss = vi.fn();
    render(<TwoStepTour onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Next')); // → step 2
    fireEvent.click(screen.getByText('Done')); // → complete
    expect(onDismiss).toHaveBeenCalledWith('complete');
    // Tour turned off — no step content remains.
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('shows step count when isStepCountShown is set', () => {
    render(<TwoStepTour isStepCountShown />);
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('does not show step count by default', () => {
    render(<TwoStepTour />);
    expect(screen.queryByText('1 of 2')).not.toBeInTheDocument();
  });

  it('renders a highlight overlay for the active step; backdrop only when set', () => {
    const {rerender} = render(<TwoStepTour />);
    // Highlight always present for the active step.
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument();
    // No dim without hasBackdrop — a plain coachmark rings the target only.
    expect(screen.queryByTestId('tour-backdrop')).not.toBeInTheDocument();
    rerender(<TwoStepTour hasBackdrop />);
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument();
    expect(screen.getByTestId('tour-backdrop')).toBeInTheDocument();
  });

  it('dismisses with "backdrop" when the backdrop is clicked', () => {
    const onDismiss = vi.fn();
    render(<TwoStepTour hasBackdrop onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('tour-backdrop'));
    expect(onDismiss).toHaveBeenCalledWith('backdrop');
  });

  it('does not restyle the target element (highlight is a separate overlay)', () => {
    render(<TwoStepTour hasBackdrop />);
    // The consumer's targets keep their own classes untouched — the ring is
    // drawn by the overlay, not by mutating the target (which loses the
    // cascade to the target's own styles).
    expect(screen.getByText('Target A').className).toBe('');
    expect(screen.getByText('Target B').className).toBe('');
  });

  it('moves the highlight across steps and clears it when the tour ends', () => {
    render(<TwoStepTour hasBackdrop />);
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next')); // → last step
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Done')); // → complete, tour off
    expect(screen.queryByTestId('tour-highlight')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tour-backdrop')).not.toBeInTheDocument();
  });

  it('renders nothing when isActive is false', () => {
    function Inactive() {
      const aRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={aRef}>
            T
          </button>
          <Tour isActive={false} onDismiss={() => {}}>
            <TourStep targetRef={aRef} heading="Hidden">
              Body
            </TourStep>
          </Tour>
        </>
      );
    }
    render(<Inactive />);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('a TourStep outside a Tour renders nothing', () => {
    function Orphan() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={ref}>
            T
          </button>
          <TourStep targetRef={ref} heading="Orphan">
            Body
          </TourStep>
        </>
      );
    }
    render(<Orphan />);
    expect(screen.queryByText('Orphan')).not.toBeInTheDocument();
  });
});

describe('useTour', () => {
  it('returns null outside a Tour', () => {
    let value: ReturnType<typeof useTour> = {} as ReturnType<typeof useTour>;
    function Probe() {
      value = useTour();
      return null;
    }
    render(<Probe />);
    expect(value).toBeNull();
  });

  it('reports step position and first/last inside a Tour', () => {
    const seen: Array<{index: number; first: boolean; last: boolean}> = [];
    function Probe() {
      const t = useTour();
      if (t) {
        seen.push({
          index: t.activeStepIndex,
          first: t.isFirstStep,
          last: t.isLastStep,
        });
      }
      return null;
    }
    function Harness() {
      const aRef = useRef<HTMLButtonElement>(null);
      const bRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={aRef}>
            A
          </button>
          <button type="button" ref={bRef}>
            B
          </button>
          <Tour isActive onDismiss={() => {}}>
            <Probe />
            <TourStep targetRef={aRef} heading="A">
              a
            </TourStep>
            <TourStep targetRef={bRef} heading="B">
              b
            </TourStep>
          </Tour>
        </>
      );
    }
    render(<Harness />);
    const last = seen[seen.length - 1];
    expect(last.index).toBe(0);
    expect(last.first).toBe(true);
    expect(last.last).toBe(false);
  });
});

describe('Tour reset timing', () => {
  function StepProbe() {
    const tour = useTour();
    return <output data-testid="step-index">{tour?.activeStepIndex}</output>;
  }

  function Harness({isActive}: {isActive: boolean}) {
    const aRef = useRef<HTMLButtonElement>(null);
    const bRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button type="button" ref={aRef}>
          Target A
        </button>
        <button type="button" ref={bRef}>
          Target B
        </button>
        <Tour isActive={isActive} onDismiss={() => {}}>
          <StepProbe />
          <TourStep targetRef={aRef} heading="First">
            First body
          </TourStep>
          <TourStep targetRef={bRef} heading="Second">
            Second body
          </TourStep>
        </Tour>
      </>
    );
  }

  it('resets to the first step in the same commit that deactivates the tour', () => {
    const frames: string[] = [];
    const onRender = () =>
      frames.push(screen.getByTestId('step-index').textContent ?? '');
    const ui = (isActive: boolean) => (
      <Profiler id="tour" onRender={onRender}>
        <Harness isActive={isActive} />
      </Profiler>
    );
    const {rerender} = render(ui(true));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByTestId('step-index')).toHaveTextContent('1');

    frames.length = 0;
    rerender(ui(false));

    expect(frames.length).toBeGreaterThan(0);
    expect(frames).not.toContain('1');
    expect(screen.getByTestId('step-index')).toHaveTextContent('0');
  });
});
