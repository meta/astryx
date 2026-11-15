// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchDateZone.test.tsx
 * @input The real PowerSearch with `date_absolute` and `date_range` filters,
 *   rendered under several host zones and `timezoneID` values
 * @output Assertions that the token text, the accessible label and the
 *   popover editor read one value as one day, and that an edit writes the day
 *   the person picked in that zone
 * @position Regression coverage for the PowerSearch date zone contract
 */

import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import React, {useState} from 'react';
import {PowerSearch} from './PowerSearch';
import {PowerSearchFilterEditor} from './PowerSearchFilterEditor';
import {PowerSearchToken} from './PowerSearchToken';
import type {
  PowerSearchConfig,
  PowerSearchEditorProps,
  PowerSearchFilter,
  PowerSearchTokenProps,
} from './types';

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });
  HTMLElement.prototype.matches = function (
    this: HTMLElement,
    selector: string,
  ) {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  } as typeof HTMLElement.prototype.matches;
  // A real frame, not a synchronous call: the announcer records the frame
  // id after scheduling, so a callback that runs inside the call would leave
  // a stale pending frame behind.
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    setTimeout(() => cb(performance.now()), 0);
    return ++frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterAll(() => {
  HTMLElement.prototype.matches = originalMatches;
  vi.unstubAllGlobals();
});

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTZ;
  }
});

const config: PowerSearchConfig = {
  name: 'dates',
  fields: [
    {
      key: 'due',
      label: 'Due',
      operators: [
        {
          key: 'on',
          label: 'on',
          value: {type: 'date_absolute', isDateOnly: true},
        },
      ],
    },
    {
      key: 'day',
      label: 'Day',
      operators: [{key: 'on', label: 'on', value: {type: 'date_absolute'}}],
    },
    {
      key: 'at',
      label: 'At',
      operators: [
        {
          key: 'on',
          label: 'on',
          value: {type: 'date_absolute', isDateOnly: false},
        },
      ],
    },
    {
      key: 'win',
      label: 'Win',
      operators: [{key: 'in', label: 'in', value: {type: 'date_range'}}],
    },
  ],
};

const HOST_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Pacific/Honolulu',
] as const;

function tokenFor(label: string): HTMLElement {
  const button = screen
    .getAllByRole('button')
    .find(
      b =>
        (b.textContent ?? '').startsWith(`${label}:`) &&
        !/remove/i.test(b.getAttribute('aria-label') ?? ''),
    );
  if (!button) {
    throw new Error(`token for ${label} not found`);
  }
  return button;
}

function tokenText(label: string): string {
  return (tokenFor(label).parentElement?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function openEditor(label: string): HTMLInputElement {
  act(() => {
    fireEvent.click(tokenFor(label));
  });
  const input = document.querySelector<HTMLInputElement>('[popover] input');
  if (!input) {
    throw new Error('editor input not found');
  }
  return input;
}

function apply(): void {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[popover] button'),
  ).find(b => b.textContent === 'Apply');
  if (!button) {
    throw new Error('Apply not found');
  }
  act(() => {
    fireEvent.click(button);
  });
}

function renderOne(
  filter: PowerSearchFilter,
  timezoneID: string | undefined,
  onChange = vi.fn(),
) {
  render(
    <PowerSearch
      config={config}
      filters={[filter]}
      onChange={onChange}
      label="Search"
      timezoneID={timezoneID}
    />,
  );
  return onChange;
}

// 2024-03-09 19:00 in Los Angeles, 2024-03-10 03:00Z, 2024-03-10 12:00 in Tokyo.
const EVENING_LA = Date.parse('2024-03-10T03:00:00Z') / 1000;
const UTC_MIDNIGHT = Date.parse('2024-03-09T00:00:00Z') / 1000;
const LA_MIDNIGHT = Date.parse('2024-03-09T08:00:00Z') / 1000;

describe('PowerSearch date zone', () => {
  describe('a date-only value with timezoneID is one day in that zone everywhere', () => {
    it.each(HOST_ZONES)('under host zone %s', hostZone => {
      process.env.TZ = hostZone;
      renderOne(
        {
          field: 'due',
          operator: 'on',
          value: {type: 'date_absolute', unixSeconds: EVENING_LA},
        },
        'America/Los_Angeles',
      );
      expect(tokenText('Due')).toBe('Due: onMar 9, 2024');
      expect(openEditor('Due').value).toBe('March 9, 2024');
    });

    it.each(HOST_ZONES)(
      'under host zone %s, the accessible label names the same day with no time',
      async hostZone => {
        process.env.TZ = hostZone;
        const onChange = renderOne(
          {
            field: 'due',
            operator: 'on',
            value: {type: 'date_absolute', unixSeconds: EVENING_LA},
          },
          'America/Los_Angeles',
        );
        const remove = screen.getByRole('button', {name: /^Remove /});
        act(() => {
          fireEvent.click(remove);
        });
        expect(onChange).toHaveBeenCalledWith([], 'remove', 0);
        await waitFor(() => {
          const announced = Array.from(document.querySelectorAll('[aria-live]'))
            .map(region => region.textContent ?? '')
            .join(' ');
          expect(announced).toContain('Removed Due: on Mar 9, 2024');
          expect(announced).not.toMatch(/\d:\d\d/);
        });
      },
    );

    it.each(HOST_ZONES)('under host zone %s, in Tokyo', hostZone => {
      process.env.TZ = hostZone;
      renderOne(
        {
          field: 'due',
          operator: 'on',
          value: {type: 'date_absolute', unixSeconds: EVENING_LA},
        },
        'Asia/Tokyo',
      );
      expect(tokenText('Due')).toBe('Due: onMar 10, 2024');
      expect(openEditor('Due').value).toBe('March 10, 2024');
    });
  });

  describe('a date-only value with no timezoneID is its UTC day everywhere', () => {
    it.each(HOST_ZONES)('under host zone %s', hostZone => {
      process.env.TZ = hostZone;
      renderOne(
        {
          field: 'day',
          operator: 'on',
          value: {type: 'date_absolute', unixSeconds: UTC_MIDNIGHT},
        },
        undefined,
      );
      expect(tokenText('Day')).toBe('Day: onMar 9, 2024');
      expect(openEditor('Day').value).toBe('March 9, 2024');
    });
  });

  describe("saving a date-only value stores that zone's midnight", () => {
    // March 11 2024 is the first Monday of US daylight time, so the Los
    // Angeles midnight is UTC-7 where March 9 was UTC-8.
    it.each([
      ['America/Los_Angeles', Date.parse('2024-03-11T07:00:00Z') / 1000],
      ['Asia/Tokyo', Date.parse('2024-03-10T15:00:00Z') / 1000],
      ['Pacific/Honolulu', Date.parse('2024-03-11T10:00:00Z') / 1000],
      ['UTC', Date.parse('2024-03-11T00:00:00Z') / 1000],
      [undefined, Date.parse('2024-03-11T00:00:00Z') / 1000],
    ] as const)('timezoneID %s', (timezoneID, expected) => {
      process.env.TZ = 'Asia/Tokyo';
      const onChange = renderOne(
        {
          field: 'due',
          operator: 'on',
          value: {type: 'date_absolute', unixSeconds: EVENING_LA},
        },
        timezoneID,
      );
      const input = openEditor('Due');
      fireEvent.change(input, {target: {value: '03/11/2024'}});
      fireEvent.blur(input);
      apply();
      expect(onChange).toHaveBeenLastCalledWith(
        [
          {
            field: 'due',
            operator: 'on',
            value: {type: 'date_absolute', unixSeconds: expected},
          },
        ],
        'edit',
        0,
      );
    });
  });

  it('a date-only round trip through the editor keeps its day in a western zone', () => {
    process.env.TZ = 'America/Los_Angeles';
    const onChange = vi.fn();
    function Harness() {
      const [filters, setFilters] = useState<PowerSearchFilter[]>([
        {
          field: 'due',
          operator: 'on',
          value: {type: 'date_absolute', unixSeconds: LA_MIDNIGHT},
        },
      ]);
      return (
        <PowerSearch
          config={config}
          filters={filters}
          onChange={next => {
            onChange(next);
            setFilters([...next]);
          }}
          label="Search"
          timezoneID="America/Los_Angeles"
        />
      );
    }
    render(<Harness />);
    expect(tokenText('Due')).toBe('Due: onMar 9, 2024');
    // Move the day, then pick the first day again: the token shows each day
    // picked, and the instant comes back to where it started.
    let input = openEditor('Due');
    expect(input.value).toBe('March 9, 2024');
    fireEvent.change(input, {target: {value: '03/12/2024'}});
    fireEvent.blur(input);
    apply();
    expect(tokenText('Due')).toBe('Due: onMar 12, 2024');
    input = openEditor('Due');
    expect(input.value).toBe('March 12, 2024');
    fireEvent.change(input, {target: {value: '03/09/2024'}});
    fireEvent.blur(input);
    apply();
    expect(onChange).toHaveBeenLastCalledWith([
      {
        field: 'due',
        operator: 'on',
        value: {type: 'date_absolute', unixSeconds: LA_MIDNIGHT},
      },
    ]);
    expect(tokenText('Due')).toBe('Due: onMar 9, 2024');
  });

  describe("a caller's editor receives the zone", () => {
    it('passes timezoneID to a components Editor override', () => {
      process.env.TZ = 'UTC';
      const seen: (string | undefined)[] = [];
      function Editor(props: PowerSearchEditorProps) {
        seen.push(props.timezoneID);
        return <div>custom editor</div>;
      }
      render(
        <PowerSearch
          config={config}
          filters={[
            {
              field: 'due',
              operator: 'on',
              value: {type: 'date_absolute', unixSeconds: EVENING_LA},
            },
          ]}
          onChange={vi.fn()}
          label="Search"
          timezoneID="America/Los_Angeles"
          components={{date_absolute: {Editor}}}
        />,
      );
      act(() => {
        fireEvent.click(tokenFor('Due'));
      });
      expect(seen).toContain('America/Los_Angeles');
    });

    it('passes timezoneID to a components Token override, and the exported PowerSearchToken reads the zone day', () => {
      process.env.TZ = 'Asia/Tokyo';
      const seen: (string | undefined)[] = [];
      function Token(props: PowerSearchTokenProps) {
        seen.push(props.timezoneID);
        return <PowerSearchToken {...props} />;
      }
      render(
        <PowerSearch
          config={config}
          filters={[
            {
              field: 'due',
              operator: 'on',
              value: {type: 'date_absolute', unixSeconds: EVENING_LA},
            },
          ]}
          onChange={vi.fn()}
          label="Search"
          timezoneID="America/Los_Angeles"
          components={{date_absolute: {Token}}}
        />,
      );
      expect(seen).toContain('America/Los_Angeles');
      // EVENING_LA is March 10 in Tokyo and UTC; PowerSearchToken shows the
      // Los Angeles day with no time, as the built-in token does.
      expect(screen.getByText('Mar 9, 2024')).toBeTruthy();
    });

    it('PowerSearchToken reads an isDateOnly: false value with its time in timezoneID, as the editor does', () => {
      process.env.TZ = 'Asia/Tokyo';
      function Token(props: PowerSearchTokenProps) {
        return <PowerSearchToken {...props} />;
      }
      render(
        <PowerSearch
          config={config}
          filters={[
            {
              field: 'at',
              operator: 'on',
              value: {type: 'date_absolute', unixSeconds: EVENING_LA},
            },
          ]}
          onChange={vi.fn()}
          label="Search"
          timezoneID="America/Los_Angeles"
          components={{date_absolute: {Token}}}
        />,
      );
      // 7:00 PM March 9 in Los Angeles, the time the editor opens on; the
      // Tokyo viewer's reading would be March 10, 12:00 PM.
      expect(screen.getByText('Mar 9, 2024, 7:00 PM')).toBeTruthy();
    });

    it('PowerSearchFilterEditor opens its date editor on the day in timezoneID', () => {
      process.env.TZ = 'UTC';
      render(
        <PowerSearchFilterEditor
          config={config}
          filter={{
            field: 'due',
            operator: 'on',
            value: {type: 'date_absolute', unixSeconds: EVENING_LA},
          }}
          mode="edit"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          timezoneID="America/Los_Angeles"
        />,
      );
      const input = document.querySelector<HTMLInputElement>('input');
      expect(input?.value).toBe('March 9, 2024');
    });
  });

  it('a value with a time of day (isDateOnly: false) is an instant, not a calendar day', () => {
    // FR26 governs it: its token and label show the date and time in
    // timezoneID; the date-only rule leaves it alone.
    process.env.TZ = 'America/Los_Angeles';
    renderOne(
      {
        field: 'at',
        operator: 'on',
        value: {type: 'date_absolute', unixSeconds: EVENING_LA},
      },
      'Asia/Tokyo',
    );
    expect(tokenText('At')).toBe('At: onMar 10, 2024, 12:00 PM');
  });

  describe('range parts are calendar days in the same zone', () => {
    it('reads and writes them in timezoneID', () => {
      process.env.TZ = 'UTC';
      const onChange = renderOne(
        {
          field: 'win',
          operator: 'in',
          value: {
            type: 'date_range',
            value: {
              start: {type: 'ABSOLUTE', unixSeconds: EVENING_LA},
              end: {type: 'ABSOLUTE', unixSeconds: EVENING_LA + 86400},
            },
          },
        },
        'America/Los_Angeles',
      );
      act(() => {
        fireEvent.click(tokenFor('Win'));
      });
      const rangeText = Array.from(
        document.querySelectorAll<HTMLElement>('[popover] button'),
      )
        .map(b => b.textContent ?? '')
        .find(text => /Mar \d+, 2024/.test(text));
      expect(rangeText).toBe('Mar 9, 2024 – Mar 10, 2024');
      // Picking March 11–12 in the calendar stores each day's Los Angeles
      // midnight (daylight time from March 10, so UTC-7).
      const openCalendar = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[popover] button'),
      ).find(b => b.getAttribute('aria-label') === 'Open calendar');
      if (!openCalendar) {
        throw new Error('Open calendar not found');
      }
      fireEvent.click(openCalendar);
      const day = (iso: string) => {
        const button = document.querySelector<HTMLButtonElement>(
          `button[data-date="${iso}"]`,
        );
        if (!button) {
          throw new Error(`day ${iso} not found`);
        }
        return button;
      };
      fireEvent.click(day('2024-03-11'));
      fireEvent.click(day('2024-03-12'));
      apply();
      expect(onChange).toHaveBeenLastCalledWith(
        [
          {
            field: 'win',
            operator: 'in',
            value: {
              type: 'date_range',
              value: {
                start: {
                  type: 'ABSOLUTE',
                  unixSeconds: Date.parse('2024-03-11T07:00:00Z') / 1000,
                },
                end: {
                  type: 'ABSOLUTE',
                  unixSeconds: Date.parse('2024-03-12T07:00:00Z') / 1000,
                },
              },
            },
          },
        ],
        'edit',
        0,
      );
    });

    it('reads them as UTC days with no timezoneID', () => {
      process.env.TZ = 'America/Los_Angeles';
      renderOne(
        {
          field: 'win',
          operator: 'in',
          value: {
            type: 'date_range',
            value: {
              start: {type: 'ABSOLUTE', unixSeconds: UTC_MIDNIGHT},
              end: {type: 'ABSOLUTE', unixSeconds: UTC_MIDNIGHT + 86400},
            },
          },
        },
        undefined,
      );
      act(() => {
        fireEvent.click(tokenFor('Win'));
      });
      const rangeText = Array.from(
        document.querySelectorAll<HTMLElement>('[popover] button'),
      )
        .map(b => b.textContent ?? '')
        .find(text => /Mar \d+, 2024/.test(text));
      expect(rangeText).toBe('Mar 9, 2024 – Mar 10, 2024');
    });
  });
});
