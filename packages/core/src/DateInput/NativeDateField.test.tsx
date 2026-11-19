// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NativeDateField.test.tsx
 * @input Uses vitest, @testing-library/react, DateInput
 * @output Unit tests for the OS-picker surface (`nativePicker`)
 * @position Testing; validates NativeDateField.tsx
 *
 * Every test renders through `DateInput` with a pointer stubbed, so the
 * surface selection in DateInput.tsx is exercised too. `nativePicker`
 * defaults to `'touch'`, so a coarse pointer alone gets the native control.
 *
 * The iOS behaviours these pin — the picker detaching from the field on a
 * programmatic write, React's synthetic change not firing for the picker's
 * edits, `text-overflow` being inert on a flex box — were all measured on a
 * real device and none reproduce in jsdom. Where a test asserts a CSS rule
 * rather than a behaviour, that is why.
 *
 * SYNC: When NativeDateField.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  within,
} from '@testing-library/react';
import {
  Suspense,
  startTransition,
  use,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {DateInput, type DateInputProps} from './DateInput';
import type {ISODateString} from '../utils';
import type * as NativeDateSegments from './nativeDateSegments';
import {
  hasEditableDateSegments,
  resetDateSegmentProbe,
} from './nativeDateSegments';
import {InternationalizationProvider} from '../i18n';
import {InputGroup} from '../InputGroup';
import {InputGroupText} from '../InputGroup/InputGroupText';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

/**
 * Lets a test say which kind of `<input type="date">` the engine draws.
 * `null` (the default) runs the real probe, so every other test in this file
 * exercises the shipping path: jsdom lays nothing out, so the probe reports
 * `'unknown'` and the coarse pointer resolves it to picker-only.
 */
const {segmentState} = vi.hoisted(() => ({
  segmentState: {editable: null as boolean | null},
}));

vi.mock('./nativeDateSegments', async importOriginal => {
  const actual = await importOriginal<typeof NativeDateSegments>();
  return {
    ...actual,
    hasEditableDateSegments: (isTouchPointer: boolean) =>
      segmentState.editable ?? actual.hasEditableDateSegments(isTouchPointer),
  };
});

const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

/**
 * Astryx's touch picker mounts a month scroller that observes its own size;
 * jsdom ships no ResizeObserver. Only the `nativePicker="never"` test reaches
 * it, but stubbing it for the file keeps that test honest about which surface
 * it got.
 */
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Point `(pointer: coarse)` at a touch or mouse device. */
function stubPointer(isCoarse: boolean): void {
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
}

function getInput(): HTMLInputElement {
  const input = document.querySelector('input');
  if (!input) {
    throw new Error('DateInput rendered no input element');
  }
  return input;
}

/** The CSS rules that apply to an element, for the paint-level assertions. */
function rulesFor(el: Element): string {
  const classes = new Set(el.className.split(/\s+/).filter(Boolean));
  return Array.from(document.styleSheets)
    .flatMap(sheet => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return [];
      }
    })
    .map(rule => rule.cssText)
    .filter(text => [...classes].some(cls => text.includes(`.${cls}`)))
    .join(' ');
}

// A transition that suspends for good: React renders its element, then keeps
// the committed tree and never commits that render.
const forever = new Promise<never>(() => {});
function Forever(): null {
  use(forever);
  return null;
}
function Discardable({
  children,
  isPending = false,
}: {
  children: ReactNode;
  isPending?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      {children}
      {isPending ? <Forever /> : null}
    </Suspense>
  );
}
async function discardRender(
  rerender: (ui: ReactElement) => void,
  ui: ReactElement,
): Promise<void> {
  await act(async () => {
    startTransition(() => {
      rerender(<Discardable isPending>{ui}</Discardable>);
    });
  });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  segmentState.editable = null;
  resetDateSegmentProbe();
});

const RANGE_MESSAGE = 'Enter a date from March 10, 2026 to March 20, 2026';

describe('DateInput nativePicker', () => {
  // ===========================================================================
  // Which surface renders
  // ===========================================================================

  it('renders the native control on touch by default', () => {
    stubPointer(true);
    render(<DateInput label="Date" onChange={() => {}} />);

    expect(getInput()).toHaveAttribute('type', 'date');
  });

  it('keeps the calendar popover on a mouse-driven device', () => {
    stubPointer(false);
    render(<DateInput label="Date" onChange={() => {}} />);

    const input = getInput();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('role', 'combobox');
  });

  it('falls back to Astryx\u2019s touch picker when told never', () => {
    stubPointer(true);
    render(<DateInput label="Date" nativePicker="never" onChange={() => {}} />);

    const input = getInput();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('role', 'combobox');
  });

  it('uses the native control on a mouse device when told always', () => {
    stubPointer(false);
    render(
      <DateInput label="Date" nativePicker="always" onChange={() => {}} />,
    );

    expect(getInput()).toHaveAttribute('type', 'date');
  });

  it('drops the popup ARIA the other surfaces carry', () => {
    // There is no in-page popup to describe: the OS draws the picker.
    stubPointer(true);
    render(<DateInput label="Date" onChange={() => {}} />);

    const input = getInput();
    expect(input).not.toHaveAttribute('role', 'combobox');
    expect(input).not.toHaveAttribute('aria-expanded');
    expect(input).not.toHaveAttribute('aria-haspopup');
  });

  // ===========================================================================
  // Value round-trip
  // ===========================================================================

  it('keeps the control\u2019s own value ISO', () => {
    stubPointer(true);
    render(
      <DateInput
        label="Date"
        value="2026-01-25"
        format="date_long"
        onChange={() => {}}
      />,
    );

    // ISO is the only form the control accepts, and what the picker reads and
    // writes; `format` rides on the overlay instead.
    expect(getInput()).toHaveValue('2026-01-25');
    expect(screen.getByText('January 25, 2026')).toBeInTheDocument();
  });

  it('fires onChange with the ISO date the control reports', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(<DateInput label="Date" onChange={onChange} />);

    fireEvent.change(getInput(), {target: {value: '2026-03-21'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-21');
  });

  it('runs changeAction after onChange and exposes the pending state', async () => {
    stubPointer(true);
    const calls: string[] = [];
    let resolveAction: () => void = () => {};
    const changeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          calls.push('changeAction');
          resolveAction = resolve;
        }),
    );
    const onChange = vi.fn(() => calls.push('onChange'));
    render(
      <DateInput
        label="Date"
        onChange={onChange}
        changeAction={changeAction}
      />,
    );

    fireEvent.change(getInput(), {target: {value: '2026-03-21'}});

    expect(calls).toEqual(['onChange', 'changeAction']);
    expect(changeAction).toHaveBeenCalledExactlyOnceWith('2026-03-21');
    expect(getInput()).not.toBeDisabled();
    expect(getInput()).toHaveAttribute('aria-busy', 'true');
    // The busy Spinner is decorative (spec:AST-086 FR8).
    expect(document.querySelector('.astryx-spinner')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('March 21, 2026')).toBeInTheDocument();

    fireEvent.change(getInput(), {target: {value: '2026-03-22'}});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(changeAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('March 21, 2026')).toBeInTheDocument();

    await act(async () => resolveAction());

    fireEvent.change(getInput(), {target: {value: '2026-03-22'}});
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(changeAction).toHaveBeenNthCalledWith(2, '2026-03-22');
    await act(async () => resolveAction());
  });

  it('fires onChange with undefined when the control is emptied', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(<DateInput label="Date" value="2026-03-21" onChange={onChange} />);

    fireEvent.change(getInput(), {target: {value: ''}});

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('commits an edit React\u2019s synthetic change does not see', () => {
    // The iOS failure, reproduced: the picker edits the field and a native
    // `input` event fires, but React's synthetic `onChange` never runs — so
    // React re-renders and writes its stale value back over the picker's.
    // Assigning `.value` first updates React's internal value tracker, which
    // is what makes React skip the synthetic event; the native listener still
    // sees the real one.
    stubPointer(true);
    const onChange = vi.fn();
    render(<DateInput label="Date" value="2026-03-21" onChange={onChange} />);

    const input = getInput();
    input.value = '2026-03-09';
    input.dispatchEvent(new Event('input', {bubbles: true}));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-09');
  });

  it('fires one change when both commit paths see the same edit', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(<DateInput label="Date" value="2026-03-21" onChange={onChange} />);

    fireEvent.change(getInput(), {target: {value: '2026-03-09'}});

    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-09');
  });

  it('fires one change when React discards a render between the edit’s two commit paths', async () => {
    stubPointer(true);
    const onChange = vi.fn();
    // The parent keeps its value: the edit is reported, not accepted.
    const field = (value: ISODateString) => (
      <DateInput label="Date" value={value} onChange={onChange} />
    );
    const {rerender} = render(<Discardable>{field('2026-03-21')}</Discardable>);
    fireEvent.change(getInput(), {target: {value: '2026-03-09'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-03-09');

    await discardRender(rerender, field('2026-04-01'));
    // The same edit's native input event, which the control also sends.
    fireEvent.input(getInput());

    expect(onChange).toHaveBeenCalledOnce();
  });

  it('keeps a refused date refused when React discards a render with a value', async () => {
    stubPointer(true);
    const field = (label: string, value: ISODateString) => (
      <DateInput
        label={label}
        min="2026-03-10"
        max="2026-03-20"
        value={value}
        onChange={() => {}}
      />
    );
    const {rerender} = render(
      <Discardable>{field('Date', '2026-03-15')}</Discardable>,
    );
    fireEvent.change(getInput(), {target: {value: '2026-03-25'}});
    fireEvent.keyDown(getInput(), {key: 'Enter'});
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');

    await discardRender(rerender, field('Date', '2026-03-16'));
    rerender(<Discardable>{field('Start date', '2026-03-15')}</Discardable>);

    expect(screen.getByText(RANGE_MESSAGE)).toBeInTheDocument();
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not write to the control while it has focus', () => {
    // The iOS bug this guards: while the picker sheet is open, ANY
    // programmatic write to the field detaches the sheet from it, and the
    // user's pick silently stops reaching the input.
    stubPointer(true);
    const {rerender} = render(
      <DateInput label="Date" value="2026-03-21" onChange={() => {}} />,
    );
    const input = getInput();

    fireEvent.focus(input);
    rerender(<DateInput label="Date" value="2026-12-25" onChange={() => {}} />);

    expect(input).toHaveValue('2026-03-21');
  });

  it('applies an external value once the control loses focus', () => {
    stubPointer(true);
    const {rerender} = render(
      <DateInput label="Date" value="2026-03-21" onChange={() => {}} />,
    );
    const input = getInput();

    fireEvent.focus(input);
    rerender(<DateInput label="Date" value="2026-12-25" onChange={() => {}} />);
    fireEvent.blur(input);

    expect(input).toHaveValue('2026-12-25');
  });

  // ===========================================================================
  // Constraints
  // ===========================================================================

  it('forwards min and max to the native control', () => {
    stubPointer(true);
    render(
      <DateInput
        label="Date"
        min="2026-01-01"
        max="2026-12-31"
        onChange={() => {}}
      />,
    );

    const input = getInput();
    expect(input).toHaveAttribute('min', '2026-01-01');
    expect(input).toHaveAttribute('max', '2026-12-31');
  });

  it('refuses an out-of-range date and shows its message at blur', () => {
    // iOS does not enforce min/max in its picker — it lets the user land on
    // any date — so the refusal has to happen here.
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        min="2026-03-10"
        max="2026-03-20"
        value="2026-03-15"
        onChange={onChange}
      />,
    );

    fireEvent.focus(getInput());
    fireEvent.change(getInput(), {target: {value: '2026-03-25'}});
    expect(getInput()).not.toHaveAttribute('aria-invalid');
    fireEvent.blur(getInput());

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(RANGE_MESSAGE)).toBeInTheDocument();
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses a date dateConstraints rejects', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        // 2026-03-22 is a Sunday.
        dateConstraints={[date => date.getDay() !== 0]}
        value="2026-03-23"
        onChange={onChange}
      />,
    );

    fireEvent.change(getInput(), {target: {value: '2026-03-22'}});
    fireEvent.keyDown(getInput(), {key: 'Enter'});

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an available date')).toBeInTheDocument();
  });

  it('keeps the rejection shown after blur restores the committed date', () => {
    stubPointer(true);
    render(
      <DateInput
        label="Date"
        dateConstraints={[date => date.getDay() !== 0]}
        value="2026-03-23"
        onChange={() => {}}
      />,
    );

    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2026-03-22'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    // Enter shows the rejection; only blur restores the committed date.
    expect(input).toHaveValue('2026-03-22');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.blur(input);

    expect(input).toHaveValue('2026-03-23');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter an available date')).toBeInTheDocument();
  });

  // ===========================================================================
  // The text overlay: format, placeholder, paint
  // ===========================================================================

  it('honours every named format', () => {
    stubPointer(true);
    const {rerender} = render(
      <DateInput
        label="Date"
        value="2026-01-25"
        format="date"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Jan 25, 2026')).toBeInTheDocument();

    rerender(
      <DateInput
        label="Date"
        value="2026-01-25"
        format="date_weekday"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Sun, Jan 25, 2026')).toBeInTheDocument();
  });

  it('honours a function format', () => {
    stubPointer(true);
    render(
      <DateInput
        label="Date"
        value="2026-01-25"
        format={iso => `ships ${iso}`}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText('ships 2026-01-25')).toBeInTheDocument();
  });

  it('formats in the provider locale', () => {
    stubPointer(true);
    render(
      <InternationalizationProvider locale="de-DE">
        <DateInput label="Date" value="2026-03-21" onChange={() => {}} />
      </InternationalizationProvider>,
    );

    expect(screen.getByText('21. März 2026')).toBeInTheDocument();
    expect(getInput()).toHaveValue('2026-03-21');
  });

  it('keeps painting the value while the picker is open', () => {
    // The OS picker has no segments to reveal, so `format` holds throughout.
    stubPointer(true);
    render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);

    fireEvent.focus(getInput());

    expect(screen.getByText('January 25, 2026')).toBeInTheDocument();
  });

  it('shows the placeholder when empty, and drops it when filled', () => {
    stubPointer(true);
    const {rerender} = render(<DateInput label="Date" onChange={() => {}} />);
    expect(screen.getByText('Select a date')).toBeInTheDocument();

    rerender(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);

    expect(screen.queryByText('Select a date')).toBeNull();
  });

  it('keeps the overlay out of the accessibility tree', () => {
    // The input still holds the value and carries the label, so announcing
    // the overlay too would double-speak.
    stubPointer(true);
    render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);

    expect(screen.getByText('January 25, 2026')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('hides the engine\u2019s own text under the overlay', () => {
    stubPointer(true);
    render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);

    const rules = rulesFor(getInput());
    // One transparent colour covers Chromium's `::-webkit-datetime-edit` and
    // Firefox's plain text; `-webkit-text-fill-color` is what wins in WebKit.
    expect(rules).toContain('color: transparent');
    expect(rules).toContain('-webkit-text-fill-color: transparent');
  });

  it('bounds the overlay so a long date cannot paint past it', () => {
    stubPointer(true);
    render(
      <DateInput
        label="Date"
        value="2026-09-30"
        hasClear
        onChange={() => {}}
      />,
    );

    const rules = rulesFor(screen.getByText('September 30, 2026'));
    // Without the end inset the overlay is shrink-to-fit and a long date runs
    // over the clear button — measured 24px across it on an iPhone.
    expect(rules).toContain('inset-inline-end: 0');
    // `text-overflow` only applies to a BLOCK container: on a flex one a
    // too-long date hard-clips mid-glyph instead (measured identical to
    // `text-overflow: clip` in WebKit and Chromium). Centring then comes from
    // the line box, so the overlay must carry the input's own leading.
    expect(rules).toContain('display: block');
    expect(rules).toContain('text-overflow: ellipsis');
    expect(rules).toContain('line-height: var(--text-body-leading)');
  });

  // ===========================================================================
  // Toggle, clear, disabled
  // ===========================================================================

  it('asks the browser for its picker from the toggle button', () => {
    stubPointer(true);
    render(<DateInput label="Date" onChange={() => {}} />);

    const input = getInput();
    const showPicker = vi.fn();
    // jsdom implements no picker; attach one so the call is observable.
    (input as HTMLInputElement & {showPicker: () => void}).showPicker =
      showPicker;

    fireEvent.click(screen.getByLabelText('Open calendar'));

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it('survives a browser that refuses showPicker', () => {
    // Chrome throws NotAllowedError without transient user activation, and
    // iOS implements no showPicker for type=date at all. Focus is the
    // fallback, and on iOS it is the whole mechanism.
    stubPointer(true);
    render(<DateInput label="Date" onChange={() => {}} />);

    const input = getInput();
    (input as HTMLInputElement & {showPicker: () => void}).showPicker = () => {
      throw new DOMException('not allowed', 'NotAllowedError');
    };

    expect(() =>
      fireEvent.click(screen.getByLabelText('Open calendar')),
    ).not.toThrow();
    expect(input).toHaveFocus();
  });

  it('clears the value without taking focus back', () => {
    // Focusing a date control is what raises the OS picker, so reclaiming
    // focus would pop the wheel the clear tap just dismissed.
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        value="2026-03-21"
        hasClear
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Clear Date'));

    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(getInput()).not.toHaveFocus();
  });

  it('runs clear through changeAction after onChange', async () => {
    stubPointer(true);
    const calls: string[] = [];
    let resolveAction: () => void = () => {};
    const changeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          calls.push('changeAction');
          resolveAction = resolve;
        }),
    );
    const onChange = vi.fn(() => calls.push('onChange'));
    render(
      <DateInput
        label="Date"
        value="2026-03-21"
        hasClear
        onChange={onChange}
        changeAction={changeAction}
      />,
    );

    fireEvent.click(screen.getByLabelText('Clear Date'));

    expect(calls).toEqual(['onChange', 'changeAction']);
    expect(changeAction).toHaveBeenCalledExactlyOnceWith(undefined);
    // The busy Spinner is decorative (spec:AST-086 FR8).
    expect(document.querySelector('.astryx-spinner')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await act(async () => resolveAction());
  });

  it('keeps a disabled control focusable and its toggle inert (AST-085 FR1, FR2)', () => {
    stubPointer(true);
    render(<DateInput label="Date" isDisabled onChange={() => {}} />);

    const input = getInput();
    expect(input).not.toHaveAttribute('disabled');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('readonly');
    input.focus();
    expect(input).toHaveFocus();
    const toggle = screen.getByLabelText('Open calendar');
    expect(toggle).not.toHaveAttribute('disabled');
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    const showPicker = vi.fn();
    Object.defineProperty(input, 'showPicker', {value: showPicker});
    fireEvent.click(toggle);
    expect(showPicker).not.toHaveBeenCalled();
  });

  it('does not call a caller onClick while disabled (AST-085 FR2)', () => {
    stubPointer(true);
    const onClick = vi.fn();
    render(
      <DateInput
        label="Date"
        isDisabled
        onClick={onClick}
        onChange={() => {}}
      />,
    );
    fireEvent.click(getInput());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores a change while disabled', () => {
    stubPointer(true);
    const onChange = vi.fn();
    render(
      <DateInput
        label="Date"
        isDisabled
        disabledMessage="Ask an editor"
        onChange={onChange}
      />,
    );

    // With a disabledMessage the field stays focusable via aria-disabled, so
    // the mutation guard is what has to hold.
    fireEvent.change(getInput(), {target: {value: '2026-03-21'}});

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the field labelled, required-marked, and ref-forwarded', () => {
    stubPointer(true);
    const ref = vi.fn();
    render(
      <DateInput ref={ref} label="Event date" isRequired onChange={() => {}} />,
    );

    const input = screen.getByLabelText(/Event date/);
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  // ===========================================================================
  // Engines that draw editable segments
  //
  // Chrome's touch simulator, a Windows tablet and a ChromeOS convertible all
  // render `<input type="date">` as typable fields while reporting a coarse
  // pointer. See ./nativeDateSegments.
  // ===========================================================================

  it('reveals the engine’s own segments while an editable control has focus', () => {
    // Measured in Chrome: with the overlay up, typing paints nothing but a
    // selection highlight drifting across the placeholder.
    segmentState.editable = true;
    stubPointer(true);
    render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);

    expect(screen.getByText('January 25, 2026')).toBeInTheDocument();

    fireEvent.focus(getInput());

    expect(screen.queryByText('January 25, 2026')).toBeNull();
    // `-webkit-text-fill-color` is what wins inside a date control, and
    // unlike a bare `color:` cannot be confused with the wrapper's
    // `background-color: transparent`.
    expect(rulesFor(getInput())).not.toContain(
      '-webkit-text-fill-color: transparent',
    );
  });

  it('paints the formatted date again once the segments lose focus', () => {
    segmentState.editable = true;
    stubPointer(true);
    render(<DateInput label="Date" value="2026-01-25" onChange={() => {}} />);

    fireEvent.focus(getInput());
    fireEvent.blur(getInput());

    expect(screen.getByText('January 25, 2026')).toBeInTheDocument();
    expect(rulesFor(getInput())).toContain(
      '-webkit-text-fill-color: transparent',
    );
  });

  it('stands aside for the engine’s placeholder while empty and focused', () => {
    // `mm/dd/yyyy` says which order to type in, which ours cannot.
    segmentState.editable = true;
    stubPointer(true);
    render(<DateInput label="Date" onChange={() => {}} />);

    expect(screen.getByText('Select a date')).toBeInTheDocument();

    fireEvent.focus(getInput());

    expect(screen.queryByText('Select a date')).toBeNull();
  });

  it('resolves an unprobeable engine with the pointer', () => {
    // jsdom lays nothing out, so neither pseudo can be measured — the same
    // answer Firefox gives, which exposes neither.
    resetDateSegmentProbe();

    expect(hasEditableDateSegments(true)).toBe(false);
    expect(hasEditableDateSegments(false)).toBe(true);
  });
});

describe('DateInput native rejected entries', () => {
  afterEach(() => {
    __resetLiveRegionsForTest();
  });

  function statusText(container: HTMLElement) {
    return container.querySelector('.astryx-field-status')?.textContent ?? '';
  }

  /** Records each text that the shared assertive live region shows. */
  const observers: MutationObserver[] = [];
  afterEach(() => {
    observers.splice(0).forEach(observer => observer.disconnect());
  });
  function recordAssertive(): string[] {
    const texts: string[] = [];
    const observer = new MutationObserver(() => {
      const text =
        document.querySelector('[data-astryx-live-region="assertive"]')
          ?.textContent ?? '';
      if (text && text !== texts.at(-1)) {
        texts.push(text);
      }
    });
    observer.observe(document.body, {subtree: true, childList: true});
    observers.push(observer);
    return texts;
  }

  it('flags no partial year the control reports while the year is typed', () => {
    stubPointer(true);
    const onChange = vi.fn();
    const {container} = render(
      <DateInput
        label="Date"
        min="2000-01-01"
        value="2026-03-15"
        onChange={onChange}
      />,
    );
    const input = getInput();
    fireEvent.focus(input);
    for (const partial of ['0002-03-15', '0020-03-15', '0202-03-15']) {
      fireEvent.change(input, {target: {value: partial}});
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(statusText(container)).toBe('');
      expect(within(container).getByRole('alert')).toHaveTextContent('');
    }
    fireEvent.change(input, {target: {value: '2027-03-15'}});
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2027-03-15');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows a refused date in place of a caller status and announces it once', async () => {
    stubPointer(true);
    const texts = recordAssertive();
    const {container} = render(
      <DateInput
        label="Date"
        min="2026-03-10"
        max="2026-03-20"
        value="2026-03-15"
        status={{type: 'warning', message: 'Busy week'}}
        onChange={() => {}}
      />,
    );
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2026-03-25'}});
    expect(statusText(container)).toBe('Busy week');
    fireEvent.blur(input);

    expect(statusText(container)).toBe(RANGE_MESSAGE);
    expect(within(container).getByRole('alert')).toHaveTextContent('');
    await waitFor(() => {
      expect(texts).toEqual([RANGE_MESSAGE]);
    });
    // Picking the same refused date again adds no announcement.
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2026-03-25'}});
    fireEvent.blur(input);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(texts).toEqual([RANGE_MESSAGE]);
  });

  it('with onEntryErrorChange, shows a caller error message in place of a refused date, and announces it once', async () => {
    stubPointer(true);
    const announced = recordAssertive();
    const field = (status: DateInputProps['status']) => (
      <DateInput
        label="Date"
        dateConstraints={[date => date.getDay() !== 0]}
        value="2026-03-23"
        status={status}
        onEntryErrorChange={() => {}}
        onChange={() => {}}
      />
    );
    const {container, rerender} = render(
      field({type: 'error', message: 'Pick a weekday'}),
    );
    await waitFor(() => {
      expect(announced).toEqual(['Pick a weekday']);
    });
    const alert = within(container).getByRole('alert');
    fireEvent.change(getInput(), {target: {value: '2026-03-22'}});
    fireEvent.blur(getInput());

    expect(statusText(container)).toBe('Pick a weekday');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
    // The status does not change, so the field's alert announces it once.
    expect(alert).toHaveTextContent('Pick a weekday');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(announced).toEqual(['Pick a weekday']);

    rerender(field({type: 'warning', message: 'Busy week'}));
    expect(statusText(container)).toBe('Enter an available date');
    expect(alert).toHaveTextContent('');
  });

  it.each([
    ['a date the field accepts', '2026-03-18'],
    ['an emptied control', ''],
  ])('ends a shown rejection on %s', (_case, next) => {
    stubPointer(true);
    const onChange = vi.fn();
    const {container} = render(
      <DateInput
        label="Date"
        min="2026-03-10"
        max="2026-03-20"
        value="2026-03-15"
        onChange={onChange}
      />,
    );
    const input = getInput();
    fireEvent.change(input, {target: {value: '2026-03-25'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    fireEvent.change(input, {target: {value: '2026-03-05'}});
    expect(statusText(container)).toBe(RANGE_MESSAGE);

    fireEvent.change(input, {target: {value: next}});
    expect(statusText(container)).toBe('');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(next || undefined);
  });

  it('ends a shown rejection when a later new value replaces it', () => {
    stubPointer(true);
    const field = (value: ISODateString) => (
      <DateInput
        label="Date"
        min="2026-03-10"
        max="2026-03-20"
        value={value}
        onChange={() => {}}
      />
    );
    const {container, rerender} = render(field('2026-03-15'));
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2026-03-25'}});
    fireEvent.blur(input);
    expect(statusText(container)).toBe(RANGE_MESSAGE);

    rerender(field('2026-03-18'));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBe('');
  });

  /** A caller that restores the date it had when the edit began, at blur. */
  function RestoringDateInput() {
    const [value, setValue] = useState<ISODateString | undefined>('2026-03-15');
    const [editStartValue, setEditStartValue] = useState(value);
    return (
      <>
        <DateInput
          label="Date"
          min="2026-03-10"
          max="2026-03-20"
          value={value}
          onChange={setValue}
          onFocus={() => setEditStartValue(value)}
          onBlur={() => {
            if (value !== editStartValue) {
              setValue(editStartValue);
            }
          }}
        />
        <output data-testid="value">{value ?? ''}</output>
        <button type="button" onClick={() => setValue('2026-03-18')}>
          Replace
        </button>
      </>
    );
  }

  it('keeps a refused date shown when the caller restores its value at the blur that shows it', () => {
    stubPointer(true);
    const {container} = render(<RestoringDateInput />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2026-03-12'}});
    expect(screen.getByTestId('value')).toHaveTextContent('2026-03-12');
    fireEvent.change(input, {target: {value: '2026-03-25'}});

    fireEvent.blur(input);
    expect(screen.getByTestId('value')).toHaveTextContent('2026-03-15');
    expect(input).toHaveValue('2026-03-15');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(statusText(container)).toBe(RANGE_MESSAGE);

    fireEvent.click(screen.getByRole('button', {name: 'Replace'}));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(statusText(container)).toBe('');
  });

  it('keeps a refused date that Enter showed when the caller restores its value at the next blur', () => {
    stubPointer(true);
    const {container} = render(<RestoringDateInput />);
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, {target: {value: '2026-03-12'}});
    fireEvent.change(input, {target: {value: '2026-03-25'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(statusText(container)).toBe(RANGE_MESSAGE);

    fireEvent.blur(input);
    expect(screen.getByTestId('value')).toHaveTextContent('2026-03-15');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(statusText(container)).toBe(RANGE_MESSAGE);
  });

  it.each([
    ['complete', 'Enter'],
    ['complete', 'blur'],
    ['blur-or-enter', 'Enter'],
    ['blur-or-enter', 'blur'],
  ] as const)(
    'under %s, holds a refused date until %s, with every signal together',
    (entryErrorBehavior, commit) => {
      stubPointer(true);
      const {container} = render(
        <DateInput
          label="Date"
          min="2026-03-10"
          max="2026-03-20"
          value="2026-03-15"
          entryErrorBehavior={entryErrorBehavior}
          onChange={() => {}}
        />,
      );
      const input = getInput();
      const isStyledInvalid = () => /\.inputInvalid\b/.test(input.className);
      fireEvent.focus(input);
      for (const date of ['0002-03-15', '2026-03-25']) {
        fireEvent.change(input, {target: {value: date}});
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(isStyledInvalid()).toBe(false);
        expect(statusText(container)).toBe('');
      }
      if (commit === 'Enter') {
        fireEvent.keyDown(input, {key: 'Enter'});
      } else {
        fireEvent.blur(input);
      }
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(isStyledInvalid()).toBe(true);
      expect(statusText(container)).toBe(RANGE_MESSAGE);
    },
  );

  it('hides a shown rejection while disabled, and shows it again once editable', () => {
    stubPointer(true);
    const field = (isDisabled: boolean) => (
      <DateInput
        label="Date"
        dateConstraints={[date => date.getDay() !== 0]}
        value="2026-03-23"
        isDisabled={isDisabled}
        onChange={() => {}}
      />
    );
    const {container, rerender} = render(field(false));
    fireEvent.change(getInput(), {target: {value: '2026-03-22'}});
    fireEvent.blur(getInput());
    rerender(field(true));
    expect(statusText(container)).toBe('');
    expect(getInput()).not.toHaveAttribute('aria-invalid');
    rerender(field(false));
    expect(statusText(container)).toBe('Enter an available date');
  });

  it('announces a refused date through the field alert inside an InputGroup', () => {
    stubPointer(true);
    const {container} = render(
      <InputGroup label="Availability">
        <InputGroupText>Starts</InputGroupText>
        <DateInput
          label="Date"
          isLabelHidden
          dateConstraints={[date => date.getDay() !== 0]}
          value="2026-03-23"
          onChange={() => {}}
        />
      </InputGroup>,
    );
    const alert = within(container).getByRole('alert');
    fireEvent.change(getInput(), {target: {value: '2026-03-22'}});
    expect(alert).toHaveTextContent('');
    fireEvent.blur(getInput());
    expect(alert).toHaveTextContent('Enter an available date');
    expect(getInput()).toHaveAttribute('aria-invalid', 'true');
  });
});
