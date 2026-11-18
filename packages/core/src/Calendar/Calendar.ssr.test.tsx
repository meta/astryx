// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Calendar.ssr.test.tsx
 * @input Calendar server markup and React hydration under a provider calendar
 * @output Proves a Persian Calendar hydrates without an error when the server
 *   and the browser both have Temporal or both lack it, and that a server
 *   without Temporal disagrees with a browser that has it
 * @position SSR acceptance test for Calendar calendar systems
 */

import 'temporal-polyfill/full/global';
import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar} from './Calendar';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {__resetDevWarnings} from '../utils/devWarning';

const globals = globalThis as {Temporal?: unknown};
const temporal = globals.Temporal;

afterEach(() => {
  globals.Temporal = temporal;
  __resetDevWarnings();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const tree = (
  <InternationalizationProvider locale="en" calendar="persian">
    <Calendar focusDate="2026-10-30" />
  </InternationalizationProvider>
);

function setTemporal(isPresent: boolean) {
  if (isPresent) {
    globals.Temporal = temporal;
  } else {
    delete globals.Temporal;
  }
}

async function serverThenHydrate(server: boolean, browser: boolean) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  setTemporal(server);
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  const serverLabel = container
    .querySelector('[role="grid"]')
    ?.getAttribute('aria-label');
  document.body.appendChild(container);

  setTemporal(browser);
  const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  const browserLabel = container
    .querySelector('[role="grid"]')
    ?.getAttribute('aria-label');
  const errors = [...recoverableErrors, ...consoleErrors.mock.calls];
  act(() => root.unmount());
  return {serverLabel, browserLabel, errors};
}

describe('Calendar server render and hydration in the Persian calendar', () => {
  it('hydrates without an error when both sides have Temporal', async () => {
    const result = await serverThenHydrate(true, true);
    expect(result.serverLabel).toBe('Aban 1405 AP');
    expect(result.browserLabel).toBe('Aban 1405 AP');
    expect(result.errors).toEqual([]);
  });

  it('hydrates without an error when both sides lack Temporal', async () => {
    const result = await serverThenHydrate(false, false);
    expect(result.serverLabel).toBe('October 2026');
    expect(result.browserLabel).toBe('October 2026');
    expect(result.errors).toEqual([]);
  });

  it('does not match when only the browser has Temporal', async () => {
    const result = await serverThenHydrate(false, true);
    expect(result.serverLabel).toBe('October 2026');
    expect(result.browserLabel).toBe('Aban 1405 AP');
    expect(result.errors).not.toEqual([]);
  });
});
