// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchDateTime.test.tsx
 * @input The real PowerSearch with a `date_absolute` operator whose
 *   `isDateOnly` is false, under several host zones and `timezoneID` values
 * @output Assertions that the value is an instant: the token shows its date
 *   and time, the editor is a date-and-time control that opens on that time,
 *   and a time typed is stored as the instant it names in the same zone
 * @position Regression coverage for the `isDateOnly: false` contract
 */

import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';
import {PowerSearch} from './PowerSearch';
import {PowerSearchFilterEditor} from './PowerSearchFilterEditor';
import type {
  PowerSearchConfig,
  PowerSearchEditorProps,
  PowerSearchFilter,
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
  name: 'instants',
  fields: [
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
  ],
};

// 2024-03-09 19:00 in Los Angeles, 2024-03-10 03:00Z, 2024-03-10 12:00 in Tokyo.
const EVENING_LA = Date.parse('2024-03-10T03:00:00Z') / 1000;

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

// The popover is outside the accessible tree jsdom exposes for role queries,
// so a control is found through its <label>.
function inputLabelled(scope: string, text: string): HTMLInputElement | null {
  const label = Array.from(
    document.querySelectorAll<HTMLLabelElement>(`${scope} label`),
  ).find(l => l.textContent === text);
  const id = label?.getAttribute('for');
  return id ? document.querySelector<HTMLInputElement>(`[id="${id}"]`) : null;
}

async function openEditor(label: string): Promise<{
  date: HTMLInputElement;
  time: HTMLInputElement | null;
}> {
  act(() => {
    fireEvent.click(tokenFor(label));
  });
  await waitFor(() => {
    expect(document.querySelector('[popover] input')).toBeTruthy();
  });
  const date = document.querySelector<HTMLInputElement>('[popover] input');
  if (!date) {
    throw new Error('editor input not found');
  }
  return {
    date,
    time: inputLabelled('[popover]', 'Time'),
  };
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

const instantAt: PowerSearchFilter = {
  field: 'at',
  operator: 'on',
  value: {type: 'date_absolute', unixSeconds: EVENING_LA},
};

describe('PowerSearch isDateOnly: false', () => {
  it('shows the date and time in timezoneID and edits them in a date-and-time control', async () => {
    process.env.TZ = 'Asia/Tokyo';
    const onChange = renderOne(instantAt, 'America/Los_Angeles');
    expect(tokenText('At')).toBe('At: onMar 9, 2024, 7:00 PM');
    const {date, time} = await openEditor('At');
    expect(date.value).toBe('March 9, 2024');
    expect(time?.value).toBe('7:00 PM');
    // A time typed in the editor is read in the same zone.
    fireEvent.change(time as HTMLInputElement, {target: {value: '8:30 PM'}});
    fireEvent.blur(time as HTMLInputElement);
    apply();
    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          field: 'at',
          operator: 'on',
          value: {
            type: 'date_absolute',
            unixSeconds: Date.parse('2024-03-10T04:30:00Z') / 1000,
          },
        },
      ],
      'edit',
      0,
    );
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Honolulu'])(
    'in timezoneID whatever the host zone (%s)',
    async hostZone => {
      process.env.TZ = hostZone;
      renderOne(instantAt, 'Asia/Tokyo');
      expect(tokenText('At')).toBe('At: onMar 10, 2024, 12:00 PM');
      const {date, time} = await openEditor('At');
      expect(date.value).toBe('March 10, 2024');
      expect(time?.value).toBe('12:00 PM');
    },
  );

  it("in the viewer's zone when timezoneID is unset", async () => {
    process.env.TZ = 'Asia/Tokyo';
    const onChange = renderOne(instantAt, undefined);
    expect(tokenText('At')).toBe('At: onMar 10, 2024, 12:00 PM');
    const {date, time} = await openEditor('At');
    expect(date.value).toBe('March 10, 2024');
    expect(time?.value).toBe('12:00 PM');
    fireEvent.change(time as HTMLInputElement, {target: {value: '1:15 PM'}});
    fireEvent.blur(time as HTMLInputElement);
    apply();
    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          field: 'at',
          operator: 'on',
          value: {
            type: 'date_absolute',
            unixSeconds: Date.parse('2024-03-10T04:15:00Z') / 1000,
          },
        },
      ],
      'edit',
      0,
    );
  });

  it('reads an empty timezoneID as unset', () => {
    process.env.TZ = 'Asia/Tokyo';
    renderOne(instantAt, '');
    expect(tokenText('At')).toBe('At: onMar 10, 2024, 12:00 PM');
  });

  it('gives the date-and-time control a line of its own so the field selector keeps its width', async () => {
    process.env.TZ = 'UTC';
    renderOne(instantAt, 'America/Los_Angeles');
    const {date} = await openEditor('At');
    const popover = date.closest<HTMLElement>('[popover]');
    // The value cell spans the row and the row wraps, so the two-input
    // control does not squeeze the field selector beside it.
    const valueCell = Array.from(
      popover?.querySelectorAll<HTMLElement>('div') ?? [],
    ).find(el => getComputedStyle(el).flexBasis === '100%');
    expect(valueCell).toBeTruthy();
    expect(valueCell?.contains(date)).toBe(true);
    expect(getComputedStyle(valueCell!.parentElement!).flexWrap).toBe('wrap');
  });

  it('wraps the date-and-time pair in a nested sub-filter row, where the value cell is narrower than its two inputs', async () => {
    process.env.TZ = 'UTC';
    const nestedConfig: PowerSearchConfig = {
      name: 'NestedDateTime',
      fields: [
        ...config.fields,
        {
          key: 'group',
          label: 'Group',
          operators: [
            {key: 'all_of', label: 'all of', value: {type: 'nested'}},
          ],
        },
      ],
    };
    render(
      <PowerSearch
        config={nestedConfig}
        filters={[
          {
            field: 'group',
            operator: 'all_of',
            value: {type: 'nested', value: [instantAt]},
          },
        ]}
        onChange={vi.fn()}
        label="Search"
        timezoneID="America/Los_Angeles"
      />,
    );
    const {date, time} = await openEditor('Group');
    expect(time).toBeTruthy();
    // The pair's own row wraps, so the time field drops under the date field
    // instead of overlapping it in the width the nested selectors leave.
    const pairRow = Array.from(
      document.querySelectorAll<HTMLElement>('[popover] div'),
    ).find(
      el =>
        el.children.length === 2 &&
        el.contains(date) &&
        el.contains(time) &&
        getComputedStyle(el).flexWrap === 'wrap',
    );
    expect(pairRow).toBeTruthy();
  });

  it('leaves a date-only operator on the date picker with no time', async () => {
    process.env.TZ = 'UTC';
    renderOne(
      {
        field: 'due',
        operator: 'on',
        value: {type: 'date_absolute', unixSeconds: EVENING_LA},
      },
      'America/Los_Angeles',
    );
    expect(tokenText('Due')).not.toMatch(/\d:\d\d/);
    const {time} = await openEditor('Due');
    expect(time).toBeNull();
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
          filters={[instantAt]}
          onChange={vi.fn()}
          label="Search"
          timezoneID="America/Los_Angeles"
          components={{date_absolute: {Editor}}}
        />,
      );
      act(() => {
        fireEvent.click(tokenFor('At'));
      });
      expect(seen).toContain('America/Los_Angeles');
    });

    it('PowerSearchFilterEditor opens the date-and-time editor in timezoneID', async () => {
      process.env.TZ = 'UTC';
      render(
        <PowerSearchFilterEditor
          config={config}
          filter={instantAt}
          mode="edit"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          timezoneID="America/Los_Angeles"
        />,
      );
      await waitFor(() => {
        expect(document.querySelector<HTMLInputElement>('input')?.value).toBe(
          'March 9, 2024',
        );
      });
      expect(inputLabelled('body', 'Time')?.value).toBe('7:00 PM');
    });
  });
});
