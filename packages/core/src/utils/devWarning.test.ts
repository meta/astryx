// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import * as diagnostics from './devWarning';
import {
  devWarn,
  devError,
  warnOnce,
  formatDevMessage,
  __resetDevWarnings,
} from './devWarning';

afterEach(() => {
  __resetDevWarnings();
  vi.restoreAllMocks();
});

function instanceWarnings() {
  const create = diagnostics.createDevWarnings;
  expect(typeof create).toBe('function');
  return create();
}

describe('per-instance warnings', () => {
  it('exposes a shared instance warning factory', () => {
    instanceWarnings();
  });
  it('deduplicates messages per instance without sharing history across mounts', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = instanceWarnings();
    first('Table', 'first');
    first('Table', 'first');
    first('Table', 'second');
    const second = instanceWarnings();
    second('Table', 'first');
    expect(spy.mock.calls).toEqual([
      ['Table: first'],
      ['Table: second'],
      ['Table: first'],
    ]);
  });
  it('supports one stable key while preserving the current message prefix', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warn = instanceWarnings();
    warn('FirstComponent', 'initial', '');
    warn('NextComponent', 'changed', '');
    expect(spy.mock.calls).toEqual([['FirstComponent: initial']]);
  });
  it('keeps production diagnostics silent', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    try {
      const production = await import('./devWarning');
      const create = production.createDevWarnings;
      expect(typeof create).toBe('function');
      create()('Table', 'silent');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('formatDevMessage', () => {
  it('formats as "Component: message"', () => {
    expect(formatDevMessage('Field', 'oops')).toBe('Field: oops');
  });
});

describe('devWarn', () => {
  it('warns in the standardized format and forwards extra args', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const detail = {a: 1};
    devWarn('Popover', 'no button', detail);
    expect(warn).toHaveBeenCalledWith('Popover: no button', detail);
  });
});

describe('devError', () => {
  it('errors in the standardized format', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    devError('Table', 'plugin threw:', err);
    expect(error).toHaveBeenCalledWith('Table: plugin threw:', err);
  });
});

describe('warnOnce', () => {
  it('fires at most once per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOnce('k', 'Theme', 'runtime injection');
    warnOnce('k', 'Theme', 'runtime injection');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Theme: runtime injection');
  });

  it('fires again for a different key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOnce('a', 'Theme', 'one');
    warnOnce('b', 'Theme', 'two');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
