// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Timer.test.tsx
 * @input Uses React Testing Library, fake clocks, React Profiler, and Timer
 * @output Verifies formats, adaptive cadence, render isolation, typography, resources, semantics, and passthrough
 */

import {Profiler, StrictMode, createRef} from 'react';
import {renderToString} from 'react-dom/server';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Timer} from './Timer';

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders deterministic zero-duration markup for each standard format', () => {
    const {rerender} = render(<Timer data-testid="timer" />);
    const timer = screen.getByTestId('timer');

    expect(timer.tagName).toBe('TIME');
    expect(timer).toHaveTextContent('0s');
    expect(timer).toHaveAttribute('datetime', 'PT0S');

    rerender(<Timer format="clock" data-testid="timer" />);
    expect(timer).toHaveTextContent('0:00');
    expect(timer).toHaveAttribute('datetime', 'PT0S');
  });

  it('keeps server markup independent of the clock', () => {
    const firstMarkup = renderToString(<Timer startTime={0} />);
    const firstClockMarkup = renderToString(
      <Timer startTime={0} format="clock" />,
    );

    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const secondMarkup = renderToString(<Timer startTime={0} />);
    const secondClockMarkup = renderToString(
      <Timer startTime={0} format="clock" />,
    );

    expect(firstMarkup).toBe(secondMarkup);
    expect(firstMarkup).toContain('dateTime="PT0S"');
    expect(firstMarkup).toContain('>0s</time>');
    expect(firstClockMarkup).toBe(secondClockMarkup);
    expect(firstClockMarkup).toContain('>0:00</time>');
  });

  it('derives elapsed time from the clock without accumulating callback count', () => {
    let scheduledTick: (() => void) | undefined;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(callback => {
      scheduledTick = callback as () => void;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });

    render(<Timer data-testid="timer" />);

    vi.setSystemTime(new Date('2026-09-22T00:00:08.750Z'));
    act(() => {
      scheduledTick?.();
    });

    const timer = screen.getByTestId('timer');
    expect(timer).toHaveTextContent('8s');
    expect(timer).toHaveAttribute('datetime', 'PT8S');
  });

  it('formats elapsed durations across seconds, minutes, and hours', () => {
    const now = Date.now();
    const {rerender} = render(
      <Timer startTime={now - 34_000} data-testid="timer" />,
    );
    const timer = screen.getByTestId('timer');
    expect(timer).toHaveTextContent('34s');
    expect(timer).toHaveAttribute('datetime', 'PT34S');

    rerender(<Timer startTime={now - 128_000} data-testid="timer" />);
    expect(timer).toHaveTextContent('2m 08s');
    expect(timer).toHaveAttribute('datetime', 'PT128S');

    rerender(<Timer startTime={now - 3_753_000} data-testid="timer" />);
    expect(timer).toHaveTextContent('1h 02m');
    expect(timer).toHaveAttribute('datetime', 'PT3720S');
  });

  it('formats clock durations across minutes and hours', () => {
    const now = Date.now();
    const {rerender} = render(
      <Timer format="clock" startTime={now - 128_000} data-testid="timer" />,
    );
    const timer = screen.getByTestId('timer');
    expect(timer).toHaveTextContent('2:08');
    expect(timer).toHaveAttribute('datetime', 'PT128S');

    rerender(
      <Timer format="clock" startTime={now - 3_753_000} data-testid="timer" />,
    );
    expect(timer).toHaveTextContent('1:02:33');
    expect(timer).toHaveAttribute('datetime', 'PT3753S');
  });

  it('uses second cadence until elapsed format reaches an hour, then minute cadence', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const startTime = Date.now() - 3_599_000;
    render(<Timer startTime={startTime} data-testid="timer" />);
    const timer = screen.getByTestId('timer');

    expect(timer).toHaveTextContent('59m 59s');
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1000);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(timer).toHaveTextContent('1h 00m');
    expect(timer).toHaveAttribute('datetime', 'PT3600S');
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(
      expect.any(Function),
      60_000,
    );
  });

  it('keeps clock format on second cadence after an hour', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    render(
      <Timer
        format="clock"
        startTime={Date.now() - 3_723_000}
        data-testid="timer"
      />,
    );

    expect(screen.getByTestId('timer')).toHaveTextContent('1:02:03');
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1000);
  });

  it('counts from a finite caller-provided start time', () => {
    const now = Date.now();
    render(<Timer startTime={now - 12_400} data-testid="timer" />);

    expect(screen.getByTestId('timer')).toHaveTextContent('12s');
    expect(screen.getByTestId('timer')).toHaveAttribute('datetime', 'PT12S');
  });

  it('returns to the original mount origin when startTime is removed', () => {
    const mountedAt = Date.now();
    const {rerender} = render(
      <Timer startTime={mountedAt - 10_000} data-testid="timer" />,
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    rerender(<Timer data-testid="timer" />);

    expect(screen.getByTestId('timer')).toHaveTextContent('2s');
    expect(screen.getByTestId('timer')).toHaveAttribute('datetime', 'PT2S');
  });

  it('falls back to mount time for a non-finite start time', () => {
    render(<Timer startTime={Number.NaN} data-testid="timer" />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId('timer')).toHaveTextContent('2s');
  });

  it('clamps a future origin to zero and schedules its first visible change directly', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    render(<Timer startTime={Date.now() + 5000} data-testid="timer" />);

    expect(screen.getByTestId('timer')).toHaveTextContent('0s');
    expect(screen.getByTestId('timer')).toHaveAttribute('datetime', 'PT0S');
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 6000);

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByTestId('timer')).toHaveTextContent('1s');
    expect(screen.getByTestId('timer')).toHaveAttribute('datetime', 'PT1S');
  });

  it('updates format without remounting or losing current elapsed time', () => {
    const now = Date.now();
    const {rerender} = render(
      <Timer startTime={now - 3_723_000} data-testid="timer" />,
    );
    const timer = screen.getByTestId('timer');
    expect(timer).toHaveTextContent('1h 02m');
    expect(timer).toHaveAttribute('datetime', 'PT3720S');

    rerender(
      <Timer format="clock" startTime={now - 3_723_000} data-testid="timer" />,
    );
    expect(screen.getByTestId('timer')).toBe(timer);
    expect(timer).toHaveTextContent('1:02:03');
    expect(timer).toHaveAttribute('datetime', 'PT3723S');
  });

  it('does not schedule React update commits as time advances', () => {
    const onRender = vi.fn();
    render(
      <Profiler id="timer" onRender={onRender}>
        <Timer />
      </Profiler>,
    );
    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it('owns one timer resource and cleans up under StrictMode replay', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const {unmount} = render(
      <StrictMode>
        <Timer />
      </StrictMode>,
    );

    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });

  it('matches Timestamp typography defaults and accepts overrides', () => {
    const {rerender} = render(<Timer data-testid="timer" />);
    const timer = screen.getByTestId('timer');
    const text = timer.parentElement;

    expect(text).toHaveClass('astryx-text');
    expect(text).toHaveClass('astryx-timer');
    expect(text).toHaveAttribute('data-type', 'supporting');
    expect(text).toHaveAttribute('data-color', 'secondary');

    rerender(
      <Timer
        type="body"
        size="lg"
        color="primary"
        weight="bold"
        data-testid="timer"
      />,
    );
    expect(text).toHaveAttribute('data-type', 'body');
    expect(text).toHaveAttribute('data-size', 'lg');
    expect(text).toHaveAttribute('data-color', 'primary');
  });

  it('forwards its time ref and preserves Timestamp-style root styling and time props', () => {
    const ref = createRef<HTMLTimeElement>();
    const onClick = vi.fn();
    render(
      <Timer
        ref={ref}
        id="elapsed"
        className="custom-class"
        style={{color: 'rgb(1, 2, 3)'}}
        aria-live="polite"
        onClick={onClick}
        data-testid="timer"
      />,
    );

    const timer = screen.getByTestId('timer');
    const text = timer.parentElement;
    expect(ref.current).toBe(timer);
    expect(timer).toHaveAttribute('id', 'elapsed');
    expect(text).toHaveClass('astryx-timer');
    expect(text).toHaveClass('custom-class');
    expect(text).toHaveStyle({color: 'rgb(1, 2, 3)'});
    expect(timer).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(timer);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not add live-region semantics by default', () => {
    render(<Timer data-testid="timer" />);
    const timer = screen.getByTestId('timer');

    expect(timer).not.toHaveAttribute('aria-live');
    expect(timer).not.toHaveAttribute('role');
  });
});

describe('Timer hardening guards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('caps the wait for a distant future origin at the 32-bit timeout ceiling', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    render(
      <Timer
        startTime={Date.now() + 30 * 24 * 60 * 60 * 1000}
        data-testid="timer"
      />,
    );

    // A raw startTime - now delay would exceed the 32-bit setTimeout range and
    // fire immediately in some browsers; the ceiling keeps the wake scheduled.
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(
      expect.any(Function),
      2_147_483_647,
    );
  });

  it('coerces an unknown format to elapsed', () => {
    const now = Date.now();
    const {rerender} = render(
      <Timer
        format={'stopwatch' as never}
        startTime={now - 128_000}
        data-testid="timer"
      />,
    );

    expect(screen.getByTestId('timer')).toHaveTextContent('2m 08s');

    rerender(
      <Timer format="clock" startTime={now - 128_000} data-testid="timer" />,
    );
    expect(screen.getByTestId('timer')).toHaveTextContent('2:08');
  });
});
