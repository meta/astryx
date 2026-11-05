// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {
  markerSelector,
  openInteractionState,
  probeSelector,
} from './setup-interactions.mjs';

function fakePage({counts = {}, tabOrder = []} = {}) {
  const events = [];
  let active = null;
  let tabIndex = -1;
  return {
    events,
    page: {
      locator(selector) {
        return {
          count: async () => counts[selector] ?? 1,
          click: async () => events.push(`click:${selector}`),
          evaluate: async () => active === selector,
          waitFor: async ({state, timeout}) =>
            events.push(`wait:${selector}:${state}:${timeout}`),
        };
      },
      keyboard: {
        press: async key => {
          events.push(`key:${key}`);
          if (key === 'Tab') {
            tabIndex += 1;
            active = tabOrder[tabIndex] ?? null;
          }
        },
      },
    },
  };
}

describe('setup interaction runner', () => {
  it('opens legacy fixture controls before waiting for measured surfaces', async () => {
    const {page, events} = fakePage();
    await expect(
      openInteractionState(page, {
        open: ['dialog-trigger', 'popover-trigger'],
        surfaces: [
          {name: 'dialog-surface', kind: 'dialog'},
          {name: 'popover-surface', kind: 'popover'},
        ],
      }),
    ).resolves.toEqual({opened: true, keyboardReached: {}});

    expect(events).toEqual([
      `click:${probeSelector('dialog-trigger')}`,
      `click:${probeSelector('popover-trigger')}`,
      `wait:${probeSelector('dialog-surface')}:visible:3000`,
      `wait:${probeSelector('popover-surface')}:visible:3000`,
    ]);
  });

  it('proves task triggers are reached and activated from the keyboard', async () => {
    const dialog = markerSelector({name: 'dialog', source: 'result'});
    const menu = markerSelector({name: 'menu', source: 'result'});
    const {page, events} = fakePage({tabOrder: [dialog, menu]});
    const state = await openInteractionState(page, {
      open: [
        {
          name: 'dialog',
          source: 'result',
          method: 'keyboard-activate',
          key: 'Enter',
        },
        {name: 'menu', source: 'result', method: 'keyboard-focus'},
      ],
      surfaces: [],
    });

    expect(state).toEqual({
      opened: true,
      keyboardReached: {dialog: true, menu: true},
    });
    expect(events).toEqual(['key:Tab', 'key:Enter', 'key:Tab']);
  });

  it.each([0, 2])('rejects a marker that matches %i elements', async count => {
    const selector = probeSelector('dialog-trigger');
    const {page} = fakePage({counts: {[selector]: count}});
    await expect(
      openInteractionState(page, {
        open: ['dialog-trigger'],
        surfaces: [],
      }),
    ).rejects.toThrow(new RegExp(`matched ${count} elements`));
  });

  it('fails when a declared trigger is not keyboard reachable', async () => {
    const {page} = fakePage();
    await expect(
      openInteractionState(page, {
        open: [{name: 'menu', source: 'result', method: 'keyboard-activate'}],
        surfaces: [],
      }),
    ).rejects.toThrow(/not keyboard reachable/);
  });

  it('uses a declared marker alias for a logical surface name', () => {
    expect(
      markerSelector({
        name: 'astryx-dialog-backdrop',
        marker: 'astryx-dialog-surface',
        source: 'result',
      }),
    ).toBe('[data-vibe-result="astryx-dialog-surface"]');
  });

  it('leaves fixtures without interactions untouched', async () => {
    const {page} = fakePage();
    const locator = vi.spyOn(page, 'locator');
    await expect(openInteractionState(page, null)).resolves.toEqual({
      opened: false,
      keyboardReached: {},
    });
    expect(locator).not.toHaveBeenCalled();
  });
});
