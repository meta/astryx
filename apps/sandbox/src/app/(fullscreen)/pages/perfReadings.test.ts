// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  formatBenchmarkChange,
  formatCount,
  formatDuration,
  watchLongTasks,
} from './perfReadings';

describe('formatDuration and formatCount', () => {
  it('show a dash for no reading', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatCount(null)).toBe('—');
  });

  it('show a duration to one decimal place and a grouped count', () => {
    expect(formatDuration(12.345)).toBe('12.3 ms');
    expect(formatCount(1234)).toBe((1234).toLocaleString());
  });
});

describe('formatBenchmarkChange', () => {
  it('formats missing, zero, positive, and negative baseline changes', () => {
    expect(formatBenchmarkChange(null, 10)).toBe('—');
    expect(formatBenchmarkChange(10, null)).toBe('—');
    expect(formatBenchmarkChange(0, 0)).toBe('0.0%');
    expect(formatBenchmarkChange(1, 0)).toBe('new');
    expect(formatBenchmarkChange(110, 100)).toBe('+10.0%');
    expect(formatBenchmarkChange(90, 100)).toBe('-10.0%');
  });

  it('shows a caller-supplied empty label when there is no baseline or no value', () => {
    const labels = {noBaseline: 'no baseline', noValue: 'baseline saved'};
    expect(formatBenchmarkChange(10, null, labels)).toBe('no baseline');
    expect(formatBenchmarkChange(null, null, labels)).toBe('no baseline');
    expect(formatBenchmarkChange(null, 10, labels)).toBe('baseline saved');
    expect(formatBenchmarkChange(12, 10, labels)).toBe('+20.0%');
  });
});

describe('watchLongTasks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads no value when the browser has no Long Tasks API', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    expect(watchLongTasks()()).toBeNull();
  });

  it('counts the long tasks it observed until stopped', () => {
    class FakeObserver {
      static supportedEntryTypes = ['longtask'];
      observe() {}
      disconnect() {}
      takeRecords() {
        return [{duration: 60}, {duration: 90}];
      }
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    expect(watchLongTasks()()).toEqual({count: 2, totalMs: 150});
  });
});
