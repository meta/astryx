// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInput.calendarPresentation.test.tsx
 * @input Uses vitest, Testing Library, temporal-polyfill, DateInput,
 *   DateTimeInput
 * @output Surface choice in a calendar: every presentation and pointer, in
 *   Gregorian and Persian, and the warning for an explicit `native`
 * @position Testing; validates that the native date control never shows a
 *   calendar it cannot show
 */

import {afterAll, afterEach, beforeAll, beforeEach} from 'vitest';
import {describe, expect, it, vi} from 'vitest';
import {render} from '@testing-library/react';
import {Temporal as TemporalPolyfill} from 'temporal-polyfill/full';
import {DateInput, type DateInputProps} from './DateInput';
import {
  DateTimeInput,
  type ISODateTimeString,
} from '../DateTimeInput/DateTimeInput';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {resetDateSegmentProbe} from './nativeDateSegments';
import {__resetDevWarnings} from '../utils/devWarning';
import type {CalendarSystem} from '../utils/calendarSystem';

const host = globalThis as {Temporal?: unknown};
const hadTemporal = host.Temporal != null;
beforeAll(() => {
  host.Temporal ??= TemporalPolyfill;
});
afterAll(() => {
  if (!hadTemporal) {
    delete host.Temporal;
  }
});

const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stubPointer(pointer: Pointer): void {
  const isCoarse = pointer === 'coarse';
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /pointer:\s*coarse/.test(query)
      ? isCoarse
      : /pointer:\s*fine/.test(query)
        ? !isCoarse
        : HOVER_CAPABLE.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
}

beforeEach(() => {
  __resetDevWarnings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDateSegmentProbe();
});

type Pointer = 'fine' | 'coarse';
type Surface = 'native' | 'sheet' | 'popover';
type PresentationProps = Pick<DateInputProps, 'presentation' | 'nativePicker'>;

/** The surface on screen, read from the date control the field renders. */
function surfaceShown(): Surface {
  if (document.querySelector('input[type="date"]') != null) {
    return 'native';
  }
  const input = document.querySelector<HTMLInputElement>('input');
  return input?.getAttribute('inputmode') === 'none' ? 'sheet' : 'popover';
}

// [props, Gregorian fine, Gregorian coarse, Persian fine, Persian coarse]
const MATRIX: ReadonlyArray<
  [string, PresentationProps, Surface, Surface, Surface, Surface]
> = [
  ['default', {}, 'popover', 'native', 'popover', 'sheet'],
  [
    'adaptive-native',
    {presentation: 'adaptive-native'},
    'popover',
    'native',
    'popover',
    'sheet',
  ],
  ['native', {presentation: 'native'}, 'native', 'native', 'popover', 'sheet'],
  [
    'popover',
    {presentation: 'popover'},
    'popover',
    'popover',
    'popover',
    'popover',
  ],
  [
    'bottom-sheet',
    {presentation: 'bottom-sheet'},
    'sheet',
    'sheet',
    'sheet',
    'sheet',
  ],
  [
    'adaptive-bottom-sheet',
    {presentation: 'adaptive-bottom-sheet'},
    'popover',
    'sheet',
    'popover',
    'sheet',
  ],
  [
    'nativePicker="touch"',
    {nativePicker: 'touch'},
    'popover',
    'native',
    'popover',
    'sheet',
  ],
  [
    'nativePicker="always"',
    {nativePicker: 'always'},
    'native',
    'native',
    'popover',
    'sheet',
  ],
  [
    'nativePicker="never"',
    {nativePicker: 'never'},
    'popover',
    'sheet',
    'popover',
    'sheet',
  ],
];

const CASES = MATRIX.flatMap(
  ([name, props, gregoryFine, gregoryCoarse, persianFine, persianCoarse]) =>
    [
      ['gregory', 'fine', gregoryFine],
      ['gregory', 'coarse', gregoryCoarse],
      ['persian', 'fine', persianFine],
      ['persian', 'coarse', persianCoarse],
    ].map(
      ([calendar, pointer, surface]) =>
        [name, calendar, pointer, surface, props] as [
          string,
          CalendarSystem,
          Pointer,
          Surface,
          PresentationProps,
        ],
    ),
);

describe('DateInput surface in a calendar', () => {
  it.each(CASES)(
    '%s in %s on a %s pointer shows the %s',
    (_name, calendar, pointer, surface, props) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      stubPointer(pointer);
      render(
        <DateInput
          label="Date"
          calendar={calendar}
          value="2026-11-02"
          onChange={() => {}}
          {...props}
        />,
      );
      expect(surfaceShown()).toBe(surface);
    },
  );

  it('takes the calendar from the provider', () => {
    stubPointer('coarse');
    render(
      <InternationalizationProvider locale="en" calendar="persian">
        <DateInput label="Date" value="2026-11-02" onChange={() => {}} />
      </InternationalizationProvider>,
    );
    expect(surfaceShown()).toBe('sheet');
  });

  it('warns once when an explicit native cannot show the calendar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubPointer('coarse');
    const field = (
      <DateInput
        label="Date"
        calendar="persian"
        presentation="native"
        onChange={() => {}}
      />
    );
    const first = render(field);
    first.unmount();
    render(field);
    const messages = warn.mock.calls
      .map(([message]) => String(message))
      .filter(message => message.includes('presentation="native"'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"persian"');
  });

  it.each([
    ['the default', {}],
    ['nativePicker="always"', {nativePicker: 'always'}],
    ['an explicit native in Gregorian', {presentation: 'native'}],
  ] as const)('does not warn for %s', (_name, props) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubPointer('coarse');
    render(
      <DateInput
        label="Date"
        calendar={'presentation' in props ? 'gregory' : 'persian'}
        onChange={() => {}}
        {...props}
      />,
    );
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes('presentation="native"'),
      ),
    ).toHaveLength(0);
  });
});

describe('DateTimeInput surface in a calendar', () => {
  /** The date surface on screen; the time segment follows the same policy. */
  function dateTimeSurfaceShown(): Surface {
    if (document.querySelector('input[type="date"]') != null) {
      return 'native';
    }
    return document.querySelector('input[inputmode="none"]') != null
      ? 'sheet'
      : 'popover';
  }

  it.each(CASES)(
    '%s in %s on a %s pointer shows the %s',
    (_name, calendar, pointer, surface, props) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      stubPointer(pointer);
      render(
        <DateTimeInput
          label="When"
          calendar={calendar}
          value={'2026-11-02T09:00' as ISODateTimeString}
          onChange={() => {}}
          {...props}
        />,
      );
      expect(dateTimeSurfaceShown()).toBe(surface);
      if (surface !== 'native') {
        expect(document.querySelector('input[type="time"]')).toBeNull();
      }
    },
  );

  it('warns once when an explicit native cannot show the calendar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubPointer('fine');
    render(
      <>
        <DateTimeInput
          label="Start"
          calendar="hebrew"
          presentation="native"
          onChange={() => {}}
        />
        <DateTimeInput
          label="End"
          calendar="hebrew"
          presentation="native"
          onChange={() => {}}
        />
      </>,
    );
    const messages = warn.mock.calls
      .map(([message]) => String(message))
      .filter(message => message.includes('presentation="native"'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('DateTimeInput');
  });
});
