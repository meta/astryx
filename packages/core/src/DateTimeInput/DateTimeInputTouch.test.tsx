// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateTimeInputTouch.test.tsx
 * @input Uses vitest, @testing-library/react, DateTimeInput touch surface
 * @output Focused coverage for DateTimeInput's coarse-pointer bottom-sheet picker
 * @position Test file for /packages/core/src/DateTimeInput/
 *
 * Every test renders through a wrapper that passes `nativePicker="never"`, so
 * this suite continues to exercise Astryx's coarse-pointer bottom sheet now
 * that DateTimeInput defaults to the platform date picker on touch.
 *
 * The touch surface reuses DateInput's sheet/calendar primitives, so this file
 * keeps coverage at the DateTimeInput integration seams: surface selection,
 * segmented switching, date/time combination, constraints, and field parity.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {Profiler, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {readFileSync} from 'node:fs';
import {render, screen, fireEvent, within} from '@testing-library/react';
import {DateTimeInput as CoreDateTimeInput} from './DateTimeInput';
import type {DateTimeInputProps, ISODateTimeString} from './DateTimeInput';

function DateTimeInput(props: DateTimeInputProps) {
  return <CoreDateTimeInput {...props} nativePicker="never" />;
}

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;
const SCROLLPORT_WIDTH = 360;

const responsiveLayoutProbe = stylex.create({
  row: {flexWrap: 'wrap'},
  segment: {flexBasis: 196, minInlineSize: 0},
});

function expectResponsiveProbeClasses(
  element: HTMLElement,
  style: (typeof responsiveLayoutProbe)[keyof typeof responsiveLayoutProbe],
): void {
  const classes = (stylex.props(style).className ?? '')
    .split(' ')
    .filter(className => className !== '' && !className.includes('__'));
  expect(classes.length).toBeGreaterThan(0);
  for (const className of classes) {
    expect(element).toHaveClass(className);
  }
}

function stubMedia(pointer: 'coarse' | 'fine', anyPointer = pointer): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /any-pointer:\s*coarse/.test(query)
      ? anyPointer === 'coarse'
      : /pointer:\s*coarse/.test(query)
        ? pointer === 'coarse'
        : /pointer:\s*fine/.test(query)
          ? pointer === 'fine'
          : HOVER_CAPABLE.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function withMonthLayout<T>(fn: () => T): T {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset?.scroller === 'months' ? SCROLLPORT_WIDTH : 0;
    },
  });
  try {
    return fn();
  } finally {
    delete (HTMLElement.prototype as {clientWidth?: unknown}).clientWidth;
  }
}

function dateField(label = 'Meeting'): HTMLElement {
  return screen.getByRole('combobox', {name: label});
}

function timeField(label = 'Meeting time'): HTMLElement {
  return screen.getByRole('combobox', {name: label});
}

function dateSegment(): HTMLElement {
  const segment = document.querySelector(
    '.astryx-date-time-input-date-segment',
  );
  if (!(segment instanceof HTMLElement)) {
    throw new Error('date segment not found');
  }
  return segment;
}

function timeSegment(): HTMLElement {
  const segment = document.querySelector(
    '.astryx-date-time-input-time-segment',
  );
  if (!(segment instanceof HTMLElement)) {
    throw new Error('time segment not found');
  }
  return segment;
}

function openDateSheet(label = 'Meeting'): HTMLElement {
  const field = dateField(label);
  fireEvent.click(field);
  return field;
}

function openTimeSheet(label = 'Meeting time'): HTMLElement {
  const field = timeField(label);
  fireEvent.click(field);
  return field;
}

function switchToTimePanel(): void {
  fireEvent.click(screen.getByRole('radio', {name: 'Time'}));
}

function optionIn(listName: string, optionName: string): HTMLElement {
  return within(screen.getByRole('listbox', {name: listName})).getByRole(
    'option',
    {name: optionName},
  );
}

function ControlledDateTimeInput({
  initialValue,
}: {
  initialValue?: ISODateTimeString;
}) {
  const [value, setValue] = useState<ISODateTimeString | undefined>(
    initialValue,
  );
  return <DateTimeInput label="Meeting" value={value} onChange={setValue} />;
}

beforeAll(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 2, 15, 9, 30, 45));
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  stubMedia('coarse');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DateTimeInput touch surface', () => {
  it('uses the bottom-sheet picker on a coarse pointer', () => {
    withMonthLayout(() => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);
      const field = dateField();

      expect(field).toHaveAttribute('readonly');
      expect(field).toHaveAttribute('inputmode', 'none');
      expect(field).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(field);
      expect(field).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('radiogroup', {name: 'Date/time section'}),
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  it('uses intrinsic wrapping for the closed touch segments', () => {
    const {container} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} />,
    );
    const row = container.querySelector(
      '.astryx-date-time-input',
    ) as HTMLElement;
    expectResponsiveProbeClasses(row, responsiveLayoutProbe.row);
    expectResponsiveProbeClasses(dateSegment(), responsiveLayoutProbe.segment);
    expectResponsiveProbeClasses(timeSegment(), responsiveLayoutProbe.segment);
  });

  it('keeps the desktop two-field surface on a fine primary pointer', () => {
    stubMedia('fine', 'coarse');
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);

    expect(screen.getByRole('combobox')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Meeting time')).toBeInTheDocument();
  });

  it('closed touch fields display separate values and placeholders', () => {
    const {rerender} = render(
      <DateTimeInput label="Meeting" onChange={() => {}} />,
    );
    expect(dateField()).toHaveAttribute('placeholder', 'Select a date');
    expect(timeField()).toHaveAttribute('placeholder', 'Select a time');
    expect(dateField()).toHaveValue('');
    expect(timeField()).toHaveValue('');

    rerender(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    expect(dateField()).toHaveValue('March 15, 2026');
    expect(timeField()).toHaveValue('2:30 PM');
    expect(dateField()).not.toHaveValue('March 15, 2026, 2:30 PM');
  });

  it('uses a custom timePlaceholder on the touch time segment', () => {
    render(
      <DateTimeInput
        label="Meeting"
        timePlaceholder="Pick a time"
        onChange={() => {}}
      />,
    );
    expect(timeField()).toHaveAttribute('placeholder', 'Pick a time');
  });

  it('does not wire focus to reopen the sheet after dismissal', () => {
    const source = readFileSync(
      'packages/core/src/DateTimeInput/TouchDateTimeField.tsx',
      'utf8',
    );
    expect(source).not.toContain('onFocus=');
    expect(source).not.toContain('handleDateFocus');
    expect(source).not.toContain('handleTimeFocus');
  });

  it('opens directly to Date from the date segment and calendar icon', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T09:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    fireEvent.click(dateField());
    expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(dateField()).toHaveAttribute('aria-expanded', 'true');
    expect(timeField()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', {name: 'Save date'}));
    expect(screen.getByRole('radio', {name: 'Time'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open calendar'}));
    expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('opens directly to Time from the time segment and clock affordance with no date', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    fireEvent.click(timeField());
    expect(screen.getByRole('radio', {name: 'Time'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(dateField()).toHaveAttribute('aria-expanded', 'false');
    expect(timeField()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open Meeting time'}));
    expect(screen.getByRole('radio', {name: 'Time'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('opens from date and time segment padding clicks', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T09:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );

    fireEvent.click(dateSegment());
    expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', {name: 'Save date'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    fireEvent.click(timeSegment());
    expect(screen.getByRole('radio', {name: 'Time'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keyboard activation opens the corresponding touch panel', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T09:30' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    fireEvent.keyDown(dateField(), {key: 'Enter'});
    expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('button', {name: 'Save date'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    fireEvent.keyDown(timeField(), {key: ' '});
    expect(screen.getByRole('radio', {name: 'Time'})).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('switches between inert date and time panels with the pill control', () => {
    withMonthLayout(() => {
      const {container} = render(
        <DateTimeInput label="Meeting" onChange={() => {}} />,
      );
      openDateSheet();

      const datePanel = container.querySelector(
        '[data-panel="date"]',
      ) as HTMLElement;
      const timePanel = container.querySelector(
        '[data-panel="time"]',
      ) as HTMLElement;
      expect(datePanel).not.toHaveAttribute('aria-hidden');
      expect(timePanel).toHaveAttribute('aria-hidden', 'true');

      switchToTimePanel();
      expect(datePanel).toHaveAttribute('aria-hidden', 'true');
      expect(timePanel).not.toHaveAttribute('aria-hidden');
      expect(screen.getByRole('radio', {name: 'Time'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(dateField()).toHaveAttribute('aria-expanded', 'false');
      expect(timeField()).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('selects a date with the drafted/default time and leaves the Date panel active', () => {
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(<DateTimeInput label="Meeting" onChange={onChange} />);
      openDateSheet();

      fireEvent.click(
        screen.getByRole('button', {name: 'Saturday, March 21, 2026'}),
      );

      expect(onChange).toHaveBeenCalledWith('2026-03-21T09:30');
      expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  it('does not lose a time chosen before the date exists', () => {
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(<DateTimeInput label="Meeting" onChange={onChange} />);
      openTimeSheet();

      fireEvent.click(optionIn('AM/PM', 'PM'));
      fireEvent.click(optionIn('Hour', '3'));
      fireEvent.click(optionIn('Minute', '45'));
      expect(timeField()).toHaveValue('3:45 PM');
      expect(dateField()).toHaveValue('');
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('radio', {name: 'Date'}));
      fireEvent.click(
        screen.getByRole('button', {name: 'Saturday, March 21, 2026'}),
      );
      expect(onChange).toHaveBeenCalledWith('2026-03-21T15:45');
    });
  });

  it('keeps an uncommitted time draft across Date and Time tab switches', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    openTimeSheet();

    fireEvent.click(optionIn('AM/PM', 'PM'));
    fireEvent.click(optionIn('Hour', '3'));
    fireEvent.click(optionIn('Minute', '45'));
    fireEvent.click(screen.getByRole('radio', {name: 'Date'}));
    expect(timeField()).toHaveValue('3:45 PM');

    switchToTimePanel();
    expect(timeField()).toHaveValue('3:45 PM');
  });

  it('clears an uncommitted time draft when Time Save closes without a date', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    openTimeSheet();

    fireEvent.click(optionIn('AM/PM', 'PM'));
    fireEvent.click(optionIn('Hour', '3'));
    fireEvent.click(optionIn('Minute', '45'));
    expect(timeField()).toHaveValue('3:45 PM');

    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    expect(timeField()).toHaveValue('');
  });

  it('clears an uncommitted time draft when dismissed with Escape', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    openTimeSheet();

    fireEvent.click(optionIn('AM/PM', 'PM'));
    fireEvent.click(optionIn('Hour', '3'));
    fireEvent.click(optionIn('Minute', '45'));
    expect(timeField()).toHaveValue('3:45 PM');

    fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
    expect(timeField()).toHaveValue('');
  });

  it('clears an uncommitted time draft when dismissed from the scrim', () => {
    render(<DateTimeInput label="Meeting" onChange={() => {}} />);
    openTimeSheet();

    fireEvent.click(optionIn('AM/PM', 'PM'));
    fireEvent.click(optionIn('Hour', '3'));
    fireEvent.click(optionIn('Minute', '45'));
    expect(timeField()).toHaveValue('3:45 PM');

    fireEvent.click(screen.getByRole('dialog'));
    expect(timeField()).toHaveValue('');
  });

  it('commits 12-hour wheel changes against the controlled date', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
      />,
    );
    openDateSheet();
    switchToTimePanel();

    fireEvent.click(optionIn('Hour', '3'));
    expect(onChange).toHaveBeenCalledWith('2026-03-15T15:30');
  });

  it('commits 24-hour wheel changes', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        hourFormat="24h"
        onChange={onChange}
      />,
    );
    openDateSheet();
    switchToTimePanel();

    fireEvent.click(optionIn('Hour', '09'));
    expect(onChange).toHaveBeenCalledWith('2026-03-15T09:30');
  });

  it('commits seconds when hasSeconds is set', () => {
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30:00' as ISODateTimeString}
        hasSeconds
        onChange={onChange}
      />,
    );
    openDateSheet();
    switchToTimePanel();

    fireEvent.click(optionIn('Second', '45'));
    expect(onChange).toHaveBeenCalledWith('2026-03-15T14:30:45');
  });

  it('disables out-of-range hours on the min/max boundary date', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T10:00' as ISODateTimeString}
        min={'2026-03-15T09:00' as ISODateTimeString}
        max={'2026-03-15T17:00' as ISODateTimeString}
        hourFormat="24h"
        onChange={() => {}}
      />,
    );
    openDateSheet();
    switchToTimePanel();

    expect(optionIn('Hour', '08')).toHaveAttribute('aria-disabled', 'true');
    expect(optionIn('Hour', '09')).not.toHaveAttribute('aria-disabled');
    expect(optionIn('Hour', '18')).toHaveAttribute('aria-disabled', 'true');
  });

  it('preserves the browsed month when switching Date to Time and back', () => {
    withMonthLayout(() => {
      render(<DateTimeInput label="Meeting" onChange={() => {}} />);
      openDateSheet();

      fireEvent.click(screen.getByRole('button', {name: 'Next month'}));
      expect(screen.getByText('April 2026')).toBeInTheDocument();

      switchToTimePanel();
      fireEvent.click(screen.getByRole('radio', {name: 'Date'}));
      expect(screen.getByText('April 2026')).toBeInTheDocument();
      expect(document.querySelector('[data-scroller="months"]')).not.toBeNull();
    });
  });

  it('bounds grid panel min-content width so MonthScroller cannot feed back through its spacer', () => {
    const source = readFileSync(
      'packages/core/src/DateTimeInput/TouchDateTimeField.tsx',
      'utf8',
    );
    const styleBlock = (name: string): string => {
      const match = new RegExp(`${name}: \\{([\\s\\S]*?)\\n  \\},`).exec(
        source,
      );
      if (match == null) {
        throw new Error(`missing style block ${name}`);
      }
      return match[1];
    };

    for (const name of [
      'touchRow',
      'touchSheetBody',
      'touchSurface',
      'touchPanelStack',
      'touchPanel',
      'touchDateSurfaceStack',
      'touchDateSurface',
      'touchTimeWheels',
    ]) {
      expect(styleBlock(name)).toContain("inlineSize: '100%'");
      expect(styleBlock(name)).toContain('minInlineSize: 0');
    }
    for (const name of ['touchDateWrapper', 'touchTimeWrapper']) {
      expect(styleBlock(name)).toContain('minInlineSize: 0');
    }
  });

  it('keeps accepting in-sheet edits while a changeAction is pending', () => {
    const onChange = vi.fn();
    const changeAction = vi.fn(async () => new Promise<void>(() => {}));
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        onChange={onChange}
        changeAction={changeAction}
      />,
    );
    openDateSheet();
    switchToTimePanel();

    fireEvent.click(optionIn('Hour', '3'));
    expect(onChange).toHaveBeenCalledWith('2026-03-15T15:30');
    expect(dateField()).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(optionIn('Minute', '45'));
    expect(onChange).toHaveBeenCalledWith('2026-03-15T15:45');
    expect(changeAction).toHaveBeenCalledTimes(2);
  });

  it('clamps drafted time to the selected date boundary', () => {
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(
        <DateTimeInput
          label="Meeting"
          min={'2026-03-21T09:00' as ISODateTimeString}
          onChange={onChange}
        />,
      );
      openDateSheet();
      switchToTimePanel();
      fireEvent.click(optionIn('Hour', '3'));

      fireEvent.click(screen.getByRole('radio', {name: 'Date'}));
      fireEvent.click(
        screen.getByRole('button', {name: 'Saturday, March 21, 2026'}),
      );

      expect(onChange).toHaveBeenCalledWith('2026-03-21T09:00');
    });
  });

  it('honors dateConstraints in the Date panel', () => {
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(
        <DateTimeInput
          label="Meeting"
          dateConstraints={[date => date.getDate() !== 21]}
          onChange={onChange}
        />,
      );
      openDateSheet();
      const disabledDay = screen.getByRole('button', {
        name: 'Saturday, March 21, 2026',
      });

      expect(disabledDay).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(disabledDay);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('Reset clears the value and leaves the sheet open on the Date panel', () => {
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={onChange}
        />,
      );
      const field = openDateSheet();

      fireEvent.click(screen.getByRole('button', {name: 'Reset'}));
      expect(onChange).toHaveBeenCalledWith(undefined);
      expect(field).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  it('keeps Save date disabled until a valid date exists', () => {
    withMonthLayout(() => {
      render(<ControlledDateTimeInput />);
      openDateSheet();
      const saveDateButton = screen.getByRole('button', {name: 'Save date'});

      expect(saveDateButton).toBeDisabled();
      fireEvent.click(saveDateButton);
      expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(timeField()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('enables Save date after a controlled date selection updates value', () => {
    vi.useFakeTimers();
    withMonthLayout(() => {
      render(<ControlledDateTimeInput />);
      openDateSheet();
      const saveDateButton = screen.getByRole('button', {name: 'Save date'});
      expect(saveDateButton).toBeDisabled();

      fireEvent.click(
        screen.getByRole('button', {name: 'Saturday, March 21, 2026'}),
      );
      expect(dateField()).toHaveValue('March 21, 2026');
      expect(saveDateButton).not.toBeDisabled();

      fireEvent.click(saveDateButton);
      expect(dateField()).toHaveAttribute('aria-expanded', 'false');
      expect(timeField()).toHaveAttribute('aria-expanded', 'true');
      const timeTab = screen.getByRole('radio', {name: 'Time'});
      expect(timeTab).toHaveAttribute('aria-checked', 'true');

      vi.runAllTimers();
      expect(timeTab).toHaveFocus();
    });
    vi.useRealTimers();
  });

  it('disables Save date after Reset clears the controlled date', () => {
    withMonthLayout(() => {
      render(
        <ControlledDateTimeInput
          initialValue={'2026-03-15T10:00' as ISODateTimeString}
        />,
      );
      openDateSheet();
      const saveDateButton = screen.getByRole('button', {name: 'Save date'});
      expect(saveDateButton).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', {name: 'Reset'}));
      expect(dateField()).toHaveValue('');
      expect(saveDateButton).toBeDisabled();

      fireEvent.click(saveDateButton);
      expect(screen.getByRole('radio', {name: 'Date'})).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(timeField()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('Save date advances to Time, focuses the Time tab, and does not change the value', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={onChange}
        />,
      );
      openDateSheet();
      const timeTab = screen.getByRole('radio', {name: 'Time'});

      fireEvent.click(screen.getByRole('button', {name: 'Save date'}));

      expect(dateField()).toHaveAttribute('aria-expanded', 'false');
      expect(timeField()).toHaveAttribute('aria-expanded', 'true');
      expect(timeTab).toHaveAttribute('aria-checked', 'true');
      expect(document.querySelector('[data-panel="time"]')).not.toHaveAttribute(
        'aria-hidden',
      );
      expect(onChange).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(timeTab).toHaveFocus();
    });
    vi.useRealTimers();
  });

  it('Save after keyboard opening does not refocus-reopen the sheet', () => {
    withMonthLayout(() => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={() => {}}
        />,
      );
      const field = dateField();
      field.focus();
      fireEvent.keyDown(field, {key: 'Enter'});
      expect(field).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(screen.getByRole('button', {name: 'Save date'}));
      fireEvent.click(screen.getByRole('button', {name: 'Save'}));
      expect(field).toHaveAttribute('aria-expanded', 'false');
      expect(timeField()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('Time Save closes the sheet without changing the value', () => {
    const onChange = vi.fn();
    withMonthLayout(() => {
      render(
        <DateTimeInput
          label="Meeting"
          value={'2026-03-15T10:00' as ISODateTimeString}
          onChange={onChange}
        />,
      );
      openDateSheet();
      fireEvent.click(screen.getByRole('button', {name: 'Save date'}));

      fireEvent.click(screen.getByRole('button', {name: 'Save'}));
      expect(dateField()).toHaveAttribute('aria-expanded', 'false');
      expect(timeField()).toHaveAttribute('aria-expanded', 'false');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('disables out-of-range seconds on the min/max boundary time', () => {
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30:30' as ISODateTimeString}
        min={'2026-03-15T14:30:30' as ISODateTimeString}
        max={'2026-03-15T14:30:30' as ISODateTimeString}
        hasSeconds
        onChange={() => {}}
      />,
    );
    openDateSheet();
    switchToTimePanel();

    expect(optionIn('Second', '29')).toHaveAttribute('aria-disabled', 'true');
    expect(optionIn('Second', '30')).not.toHaveAttribute('aria-disabled');
    expect(optionIn('Second', '31')).toHaveAttribute('aria-disabled', 'true');
  });

  it('reflects controlled value changes in the closed field', () => {
    const {rerender} = render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T10:00' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    expect(dateField()).toHaveValue('March 15, 2026');
    expect(timeField()).toHaveValue('10:00 AM');

    rerender(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-16T18:45' as ISODateTimeString}
        onChange={() => {}}
      />,
    );
    expect(dateField()).toHaveValue('March 16, 2026');
    expect(timeField()).toHaveValue('6:45 PM');
  });

  it('clears the whole datetime and restores focus on the next task', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T10:00' as ISODateTimeString}
        hasClear
        onChange={onChange}
      />,
    );
    const field = dateField();
    const focusSpy = vi.spyOn(field, 'focus');

    fireEvent.click(screen.getByRole('button', {name: 'Clear Meeting'}));
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(focusSpy).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(focusSpy).toHaveBeenCalledWith({preventScroll: true});
    vi.useRealTimers();
  });

  it('blocks opening, clearing and in-sheet edits while loading', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        isLoading
        hasClear
        onChange={onChange}
      />,
    );
    const loadingField = dateField();
    fireEvent.click(loadingField);
    expect(loadingField).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', {name: 'Clear Meeting'}),
    ).not.toBeInTheDocument();

    rerender(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        hasClear
        onChange={onChange}
      />,
    );
    const field = dateField();
    fireEvent.click(field);
    switchToTimePanel();
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(timeField()).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        isLoading
        hasClear
        onChange={onChange}
      />,
    );
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking the pending spinner inside an enabled date segment does not open the sheet', () => {
    const onChange = vi.fn();
    const changeAction = vi.fn(async () => new Promise<void>(() => {}));
    const {container} = render(
      <DateTimeInput
        label="Meeting"
        value={'2026-03-15T14:30' as ISODateTimeString}
        changeAction={changeAction}
        onChange={onChange}
      />,
    );
    openTimeSheet();
    fireEvent.click(optionIn('Minute', '45'));
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    const spinner = container.querySelector(
      '.astryx-date-time-input-date-segment .astryx-spinner',
    ) as HTMLElement;
    expect(spinner).not.toBeNull();
    expect(dateField()).not.toBeDisabled();

    fireEvent.click(spinner);

    expect(dateField()).toHaveAttribute('aria-expanded', 'false');
    expect(timeField()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps a disabled reason reachable while blocking activation', () => {
    render(
      <DateTimeInput
        label="Meeting"
        isDisabled
        disabledMessage="Choose a project first"
        onChange={() => {}}
      />,
    );
    const field = dateField();

    expect(field).not.toBeDisabled();
    expect(field).toHaveAttribute('aria-disabled', 'true');
    expect(field.getAttribute('aria-describedby')).toContain(
      screen.getByRole('tooltip', {hidden: true}).id,
    );
    fireEvent.click(field);
    expect(field).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('DateTimeInput touch surface: disabled without a reason', () => {
  it('stays focusable and inert, and skips a caller onClick (AST-085 FR1, FR2)', () => {
    const onClick = vi.fn();
    render(
      <DateTimeInput
        label="Meeting"
        isDisabled
        onClick={onClick}
        onChange={() => {}}
      />,
    );
    for (const field of [dateField(), timeField()]) {
      expect(field).not.toHaveAttribute('disabled');
      expect(field).toHaveAttribute('aria-disabled', 'true');
      field.focus();
      expect(field).toHaveFocus();
      fireEvent.click(field);
      fireEvent.keyDown(field, {key: 'Enter'});
      expect(field).toHaveAttribute('aria-expanded', 'false');
    }
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('DateTimeInput touch surface: no stale commit', () => {
  // Records what each commit painted, so a value that is corrected one render
  // later (by an effect) shows up as a stale intermediate frame.
  function paintedFrames(read: () => string) {
    const frames: string[] = [];
    const onRender = () => frames.push(read());
    return {frames, onRender};
  }

  it('clears the time display in the same commit as an external clear', () => {
    const {frames, onRender} = paintedFrames(
      () => (timeField() as HTMLInputElement).value,
    );
    const ui = (value: ISODateTimeString | undefined) => (
      <Profiler id="field" onRender={onRender}>
        <DateTimeInput label="Meeting" value={value} onChange={() => {}} />
      </Profiler>
    );
    const {rerender} = render(ui('2026-03-15T10:00' as ISODateTimeString));
    expect(timeField()).toHaveValue('10:00 AM');

    frames.length = 0;
    rerender(ui(undefined));

    expect(frames.length).toBeGreaterThan(0);
    expect(frames).not.toContain('10:00 AM');
    expect(timeField()).toHaveValue('');
  });

  it('shows an in-range month in the same commit that narrows max', () => {
    withMonthLayout(() => {
      const visibleMonth = () =>
        ['March', 'April', 'May', 'June']
          .map(m => `${m} 2026`)
          .find(label => screen.queryByText(label) != null) ?? '';
      const {frames, onRender} = paintedFrames(visibleMonth);
      const ui = (max: ISODateTimeString) => (
        <Profiler id="field" onRender={onRender}>
          <DateTimeInput label="Meeting" max={max} onChange={() => {}} />
        </Profiler>
      );
      const {rerender} = render(ui('2026-12-31T23:59' as ISODateTimeString));
      openDateSheet();
      const next = screen.getByRole('button', {name: 'Next month'});
      fireEvent.click(next);
      fireEvent.click(next);
      fireEvent.click(next);
      expect(screen.getByText('June 2026')).toBeInTheDocument();

      frames.length = 0;
      rerender(ui('2026-04-30T23:59' as ISODateTimeString));

      expect(frames.length).toBeGreaterThan(0);
      expect(frames).not.toContain('June 2026');
      expect(screen.getByText('April 2026')).toBeInTheDocument();
    });
  });
});
