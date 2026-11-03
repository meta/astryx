// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearch.ssr.test.tsx
 * @input PowerSearch server markup and React hydration under a compact
 *   coarse-pointer `matchMedia`
 * @output Proves an `adaptive` PowerSearch server-renders and hydrates as the
 *   popover presentation's field without a recoverable error, then swaps to
 *   the sheet presentation's trigger on a touch screen with focus undisturbed
 *   (component:PowerSearch FR10)
 * @position SSR acceptance test for PowerSearch's experimental presentation
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import type {PowerSearchConfig, PowerSearchFilter} from './types';

const config: PowerSearchConfig = {
  name: 'Issues',
  fields: [
    {
      key: 'status',
      label: 'Status',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'enum',
            values: [
              {value: 'open', label: 'Open'},
              {value: 'closed', label: 'Closed'},
            ],
          },
        },
      ],
    },
  ],
};

const filters: PowerSearchFilter[] = [
  {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function stubCoarsePointerScreen() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

async function hydrateAdaptiveOnTouchScreen({
  hasAutoFocus = false,
  onFocus,
  onBlur,
}: {
  hasAutoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
} = {}) {
  // A fresh module graph is a fresh server process.
  vi.resetModules();
  const {PowerSearch} = await import('./PowerSearch');
  const tree = (
    <PowerSearch
      config={config}
      filters={filters}
      onChange={() => {}}
      hasAutoFocus={hasAutoFocus}
      onFocus={onFocus}
      onBlur={onBlur}
      experimental={{presentation: 'adaptive'}}
    />
  );

  // The server has no media query: `adaptive` answers `popover`, so the
  // markup is the tokenizer field, not the trigger.
  const html = renderToString(tree);
  expect(html).toContain('role="combobox"');
  // The sheet trigger is named by the label and its content; a popover token
  // that opens its editor also says it opens a dialog, but is named itself.
  expect(html).not.toMatch(
    /<button(?=[^>]*aria-haspopup="dialog")(?=[^>]*aria-labelledby=)[^>]*>/,
  );
  if (hasAutoFocus) {
    expect(html).toMatch(/<input[^>]*\sautofocus(=""|\s|>)/);
  }

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  if (hasAutoFocus) {
    // What a browser does with the markup's `autofocus` on load, before
    // hydration attaches any listener; jsdom does not, so the test does.
    (container.querySelector('[role="combobox"]') as HTMLElement).focus();
    expect(document.activeElement).toBe(
      container.querySelector('[role="combobox"]'),
    );
  }

  // The client is a compact touch screen. The hydrating render still
  // answers `popover` (the shared resolver's server snapshot), so the
  // markup matches and no recoverable error is reported; the subscribed
  // value then swaps the field to the trigger.
  stubCoarsePointerScreen();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  expect(recoverableErrors).toEqual([]);
  expect(consoleError).not.toHaveBeenCalled();
  expect(
    container.querySelector('button[aria-haspopup="dialog"][aria-labelledby]'),
  ).not.toBe(null);
  expect(container.querySelector('[role="combobox"]')).toBe(null);
  return {
    container,
    trigger: container.querySelector(
      'button[aria-haspopup="dialog"][aria-labelledby]',
    ) as HTMLElement,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('PowerSearch — SSR', () => {
  it('server-renders and hydrates an adaptive field as the popover field, then swaps to the trigger on a touch screen without a mismatch or moving focus (FR10)', async () => {
    const {unmount} = await hydrateAdaptiveOnTouchScreen();
    // Nothing had focus before the swap, and nothing takes it.
    expect(document.activeElement).toBe(document.body);
    await unmount();
  });

  it("moves the autofocused input's focus to the trigger at the swap, within the same visit — no onBlur, no onFocus (FR10)", async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const {trigger, unmount} = await hydrateAdaptiveOnTouchScreen({
      hasAutoFocus: true,
      onFocus,
      onBlur,
    });
    expect(document.activeElement).toBe(trigger);
    expect(onBlur).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
    await unmount();
  });
});
