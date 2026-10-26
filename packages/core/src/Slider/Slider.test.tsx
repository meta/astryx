// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Slider.test.tsx
 * @input Uses vitest, @testing-library/react, userEvent, Slider component
 * @output Unit tests for Slider behavior and modifier-only focus-ring suppression
 * @position Testing; validates Slider.tsx implementation
 *
 * SYNC: When Slider.tsx changes, update tests to match new behavior
 */

import {useState} from 'react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, act, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  declaresPressedOverlay,
  rulesDeclaredFor,
} from '../__tests__/pressState';
import * as stylex from '@stylexjs/stylex';
import {Slider} from './Slider';
import {FormLayout} from '../FormLayout';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {
  __resetInteractionModalityForTest,
  getInteractionModality,
} from '../utils/interactionModality';

// Mock showPopover/hidePopover (not implemented in jsdom) so the tooltip layer
// reflects its open state via a `popover-open` attribute the tests can assert.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    // jsdom does not derive :focus-visible from keyboard focus for a
    // div[role="slider"] thumb; treat the focused thumb as focus-visible so the
    // disabled-reason tooltip's keyboard-focus path can be exercised.
    if (selector === ':focus-visible') {
      return this === document.activeElement;
    }
    return originalMatches.call(this, selector);
  };
});

describe('Slider', () => {
  // --- Aria labels ---

  it('single thumb takes its accessible name from the label', () => {
    render(<Slider label="Volume" value={50} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAccessibleName('Volume');
  });

  it('range thumbs have individual names composing with the group label', () => {
    render(<Slider label="Price range" value={[20, 80] as [number, number]} />);
    const sliders = screen.getAllByRole('slider');
    expect(sliders[0]).toHaveAccessibleName('Minimum value');
    expect(sliders[1]).toHaveAccessibleName('Maximum value');
  });

  it('sets aria-valuetext with formatValue', () => {
    render(
      <Slider label="Temperature" value={72} formatValue={v => `${v}°F`} />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', '72°F');
  });

  it('uses custom min and max', () => {
    render(<Slider label="Temperature" value={72} min={60} max={90} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '60');
    expect(slider).toHaveAttribute('aria-valuemax', '90');
    expect(slider).toHaveAttribute('aria-valuenow', '72');
  });

  it.each([
    {value: 150, expectedValue: 100, expectedPosition: 'calc(100% - 10px)'},
    {value: -50, expectedValue: 0, expectedPosition: 'calc(0% + 10px)'},
  ])(
    'clamps a controlled value of $value to $expectedValue',
    ({value, expectedValue, expectedPosition}) => {
      render(<Slider label="Volume" value={value} min={0} max={100} />);
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', String(expectedValue));
      // Thumb positions via the logical `inset-inline-start` so it mirrors
      // under RTL (see RTL Phase 4), offset by half a thumb so the extremes
      // stay inside the component box.
      expect(slider).toHaveStyle({insetInlineStart: expectedPosition});
    },
  );

  // Regression: #5050 — at min/max the thumb centred on the container edge,
  // so half of it (10px of a 20px thumb) hung outside the component.
  it.each([
    {value: 0, position: 'calc(0% + 10px)'},
    {value: 50, position: 'calc(50% + 0px)'},
    {value: 100, position: 'calc(100% - 10px)'},
  ])(
    'insets the thumb at value $value so it stays in bounds',
    ({value, position}) => {
      render(<Slider label="Volume" value={value} min={0} max={100} />);
      expect(screen.getByRole('slider')).toHaveStyle({
        insetInlineStart: position,
      });
    },
  );

  it.each([
    {value: 0, position: 'calc(0% + 10px)'},
    {value: 100, position: 'calc(100% - 10px)'},
  ])(
    'insets a vertical thumb at value $value so it stays in bounds',
    ({value, position}) => {
      render(
        <Slider
          label="Volume"
          value={value}
          min={0}
          max={100}
          orientation="vertical"
        />,
      );
      expect(screen.getByRole('slider')).toHaveStyle({bottom: position});
    },
  );

  it('reflects orientation and disabled state on the interactive control target', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        orientation="vertical"
        valueDisplay="text"
        isDisabled
      />,
    );
    const control = screen.getByRole('slider').parentElement;
    expect(control).not.toBeNull();
    expect(control).toHaveClass('astryx-slider-control');
    expect(control).toHaveAttribute('data-orientation', 'vertical');
    expect(control).toHaveAttribute('data-disabled', 'disabled');
    expect(control).not.toContainElement(screen.getByText('50'));
  });

  it('range mode sets correct aria values on both thumbs', () => {
    render(
      <Slider
        label="Range"
        value={[25, 75] as [number, number]}
        min={0}
        max={100}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '25');
    expect(sliders[1]).toHaveAttribute('aria-valuenow', '75');
    // Per the APG multi-thumb pattern, each thumb's bounds are constrained by
    // its sibling: the lower thumb can't exceed the upper thumb's value and
    // the upper thumb can't go below the lower thumb's value.
    expect(sliders[0]).toHaveAttribute('aria-valuemin', '0');
    expect(sliders[0]).toHaveAttribute('aria-valuemax', '75');
    expect(sliders[1]).toHaveAttribute('aria-valuemin', '25');
    expect(sliders[1]).toHaveAttribute('aria-valuemax', '100');
  });

  it('range thumb bounds update after moving a thumb', async () => {
    const user = userEvent.setup();
    function ControlledRange() {
      const [value, setValue] = useState<[number, number]>([25, 75]);
      return (
        <Slider
          label="Range"
          value={value}
          onChange={setValue}
          min={0}
          max={100}
        />
      );
    }
    render(<ControlledRange />);
    const sliders = screen.getAllByRole('slider');
    act(() => {
      sliders[0].focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '26');
    // The upper thumb's floor tracks the lower thumb's new value.
    expect(sliders[1]).toHaveAttribute('aria-valuemin', '26');
    expect(sliders[0]).toHaveAttribute('aria-valuemax', '75');
  });

  it('range thumb bounds include the minStepsBetweenThumbs gap', () => {
    render(
      <Slider
        label="Range"
        value={[20, 80] as [number, number]}
        min={0}
        max={100}
        step={5}
        minStepsBetweenThumbs={2}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    // minGap = 2 steps * 5 = 10
    expect(sliders[0]).toHaveAttribute('aria-valuemax', '70');
    expect(sliders[1]).toHaveAttribute('aria-valuemin', '30');
  });

  // --- Label association ---

  // A <label htmlFor> must point at an existing form-associated element;
  // div[role="slider"] is not labelable, so the Slider label must render as a
  // group label instead (WCAG 1.3.1).
  const LABELABLE_TAGS = new Set([
    'BUTTON',
    'INPUT',
    'METER',
    'OUTPUT',
    'PROGRESS',
    'SELECT',
    'TEXTAREA',
  ]);

  function expectNoOrphanedLabels(container: HTMLElement) {
    for (const labelEl of container.querySelectorAll('label[for]')) {
      const target = document.getElementById(labelEl.getAttribute('for')!);
      expect(target).not.toBeNull();
      expect(LABELABLE_TAGS.has(target!.tagName)).toBe(true);
    }
  }

  it('single mode renders the label as a group label naming the thumb', () => {
    const {container} = render(<Slider label="Volume" value={50} />);
    expectNoOrphanedLabels(container);
    const slider = screen.getByRole('slider');
    const labelledBy = slider.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Volume');
    expect(slider).toHaveAccessibleName('Volume');
  });

  it('range mode labels the slider group via aria-labelledby', () => {
    const {container} = render(
      <Slider label="Price range" value={[20, 80] as [number, number]} />,
    );
    expectNoOrphanedLabels(container);
    const group = screen.getByRole('group', {name: 'Price range'});
    const labelledBy = group.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent(
      'Price range',
    );
  });

  it('sets aria-orientation for vertical', () => {
    render(<Slider label="Volume" value={50} orientation="vertical" />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('sets aria-invalid when status type is error', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        status={{type: 'error', message: 'Value too high'}}
      />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-invalid', 'true');
  });

  it('associates description via aria-describedby', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        description="Adjust the volume level"
      />,
    );
    const slider = screen.getByRole('slider');
    const describedby = slider.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const descEl = document.getElementById(describedby!.split(' ')[0]);
    expect(descEl).toHaveTextContent('Adjust the volume level');
  });

  it('associates status message via aria-describedby', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        description="Adjust the volume level"
        status={{type: 'error', message: 'Too loud'}}
      />,
    );
    const slider = screen.getByRole('slider');
    const describedby = slider.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    // Should have at least two IDs (description + status message)
    const ids = describedby!.split(' ');
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it('decorative track elements have aria-hidden', () => {
    const {container} = render(<Slider label="Volume" value={50} />);
    const ariaHidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(ariaHidden.length).toBeGreaterThanOrEqual(2);
  });

  // --- Required state ---

  it('conveys required state through the accessible description', () => {
    render(<Slider label="Volume" value={50} isRequired />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAccessibleDescription(/Required/);
    // aria-required is not a supported property of role="slider" in
    // WAI-ARIA 1.2, so it must never appear on the thumb.
    expect(slider).not.toHaveAttribute('aria-required');
  });

  it('conveys required state on both thumbs of a range slider', () => {
    render(
      <Slider
        label="Price range"
        value={[20, 80] as [number, number]}
        isRequired
      />,
    );
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
    for (const thumb of sliders) {
      expect(thumb).toHaveAccessibleDescription(/Required/);
      expect(thumb).not.toHaveAttribute('aria-required');
    }
  });

  it('combines required with other describedby parts in the description', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        description="Adjust the volume level"
        isRequired
      />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAccessibleDescription(/Adjust the volume level/);
    expect(slider).toHaveAccessibleDescription(/Required/);
  });

  it('does not mention required without isRequired', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        description="Adjust the volume level"
      />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).not.toHaveAccessibleDescription(/Required/);
    expect(slider).not.toHaveAttribute('aria-required');
  });

  // --- Disabled guards ---

  it('disables thumbs when isDisabled is true', () => {
    render(<Slider label="Volume" value={50} isDisabled />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    expect(slider).toHaveAttribute('tabIndex', '0');
  });

  it('does not fire onChange on pointer down when disabled', () => {
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        onChange={handleChange}
        isDisabled
      />,
    );
    const slider = screen.getByRole('slider');
    const trackContainer = slider.parentElement!;

    trackContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(trackContainer, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not fire onChange on keyboard when disabled', () => {
    const handleChange = vi.fn();
    render(
      <Slider label="Volume" value={50} onChange={handleChange} isDisabled />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, {key: 'ArrowRight'});
    expect(handleChange).not.toHaveBeenCalled();
  });

  // --- onChangeEnd on keyboard ---

  it('fires onChangeEnd on keyboard ArrowRight', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleChangeEnd = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        step={5}
        onChange={handleChange}
        onChangeEnd={handleChangeEnd}
      />,
    );
    const slider = screen.getByRole('slider');
    act(() => {
      slider.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(handleChange).toHaveBeenCalledWith(55);
    expect(handleChangeEnd).toHaveBeenCalledWith(55);
  });

  // --- Fractional step precision ---

  it('emits exact decimal values for fractional steps on keyboard', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleChangeEnd = vi.fn();
    render(
      <Slider
        label="Opacity"
        value={0.2}
        min={0}
        max={1}
        step={0.1}
        onChange={handleChange}
        onChangeEnd={handleChangeEnd}
      />,
    );
    const slider = screen.getByRole('slider');
    act(() => {
      slider.focus();
    });
    await user.keyboard('{ArrowRight}');
    // 0.2 + 0.1 must not surface binary float error (0.30000000000000004)
    expect(handleChange).toHaveBeenCalledWith(0.3);
    expect(handleChangeEnd).toHaveBeenCalledWith(0.3);
  });

  it('emits exact decimal values for fractional steps in range mode', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleChangeEnd = vi.fn();
    render(
      <Slider
        label="Range"
        value={[0.2, 0.6] as [number, number]}
        min={0}
        max={1}
        step={0.1}
        onChange={handleChange}
        onChangeEnd={handleChangeEnd}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    act(() => {
      sliders[1].focus();
    });
    await user.keyboard('{ArrowRight}');
    // 0.6 + 0.1 snaps to 7 * 0.1, which is 0.7000000000000001 without rounding
    expect(handleChange).toHaveBeenCalledWith([0.2, 0.7]);
    expect(handleChangeEnd).toHaveBeenCalledWith([0.2, 0.7]);
  });

  it('End reaches an off-grid max from a non-zero min, and Home still reaches min', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    // From min 1 with step 3 the grid is 1, 4, …, 100; max 101 is off it.
    render(
      <Slider
        label="Zoom"
        min={1}
        max={101}
        step={3}
        value={49}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    );
    const thumb = screen.getByRole('slider');
    thumb.focus();

    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith(101);
    expect(onChangeEnd).toHaveBeenLastCalledWith(101);

    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(onChangeEnd).toHaveBeenLastCalledWith(1);
  });

  it('End lands on max when max is off the step grid, while arrows still snap', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Owner() {
      const [value, setValue] = useState(48);
      return (
        <Slider
          label="Zoom"
          min={0}
          max={100}
          step={3}
          value={value}
          onChange={(next: number) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Owner />);
    const thumb = screen.getByRole('slider');
    thumb.focus();

    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith(100);

    // ORD1 for arrows and Page keys is unchanged: from max (100, off the
    // grid) ArrowLeft targets 97 and snaps to 96; from 96 PageUp targets 126
    // and clamps to 100, the bound.
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith(96);
    await user.keyboard('{PageUp}');
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('fires onChangeEnd on keyboard Home/End with correct value', async () => {
    const user = userEvent.setup();
    const handleChangeEnd = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        onChange={vi.fn()}
        onChangeEnd={handleChangeEnd}
      />,
    );
    const slider = screen.getByRole('slider');
    act(() => {
      slider.focus();
    });
    await user.keyboard('{Home}');
    expect(handleChangeEnd).toHaveBeenCalledWith(0);
  });

  it('fires onChangeEnd with correct value for range mode on keyboard', async () => {
    const user = userEvent.setup();
    const handleChangeEnd = vi.fn();
    render(
      <Slider
        label="Range"
        value={[20, 80] as [number, number]}
        min={0}
        max={100}
        step={5}
        onChange={vi.fn()}
        onChangeEnd={handleChangeEnd}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    act(() => {
      sliders[0].focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(handleChangeEnd).toHaveBeenCalledWith([25, 80]);
  });

  // --- Pointer handling ---

  it('fires onChangeEnd on pointer up after pointer down', () => {
    const handleChange = vi.fn();
    const handleChangeEnd = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        onChange={handleChange}
        onChangeEnd={handleChangeEnd}
      />,
    );
    const slider = screen.getByRole('slider');
    const trackContainer = slider.parentElement!;

    trackContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(trackContainer, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerUp(trackContainer, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });

    expect(handleChangeEnd).toHaveBeenCalledTimes(1);
  });

  it('focuses closest thumb on track click', () => {
    render(
      <Slider label="Volume" value={50} min={0} max={100} onChange={vi.fn()} />,
    );
    const slider = screen.getByRole('slider');
    const trackContainer = slider.parentElement!;

    trackContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(trackContainer, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });

    expect(document.activeElement).toBe(slider);
  });

  // --- RTL pointer value mapping (RTL Phase 4) ---
  // Contract: the inline-start edge (value = min) is the RIGHT edge under RTL,
  // so the same physical click maps to the mirrored value relative to LTR.
  // `valueDisplay="none"` keeps the thumb a direct child of the track element
  // (no Tooltip wrapper) so the mocked rect lands on trackRef.

  it('maps a track click to the LTR value in the default direction', () => {
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={0}
        min={0}
        max={100}
        valueDisplay="none"
        onChange={handleChange}
      />,
    );
    const track = screen.getByRole('slider').parentElement!;
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Click at x=50 of a 200px track. The thumb's travel is the track minus
    // half a thumb at each end (180px from x=10), so the fraction is
    // (50 - 10) / 180 → value 22.
    fireEvent.pointerDown(track, {clientX: 50, clientY: 10, pointerId: 1});
    expect(handleChange).toHaveBeenLastCalledWith(22);
  });

  it('mirrors a track click to the RTL value when the track is rtl', () => {
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={0}
        min={0}
        max={100}
        valueDisplay="none"
        onChange={handleChange}
      />,
    );
    const track = screen.getByRole('slider').parentElement!;
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Force the track's computed direction to rtl (isRtlElement reads this).
    const realGetComputedStyle = window.getComputedStyle;
    const gcsSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === track) {
          return {direction: 'rtl'} as CSSStyleDeclaration;
        }
        return realGetComputedStyle(el, pseudo ?? undefined);
      });

    // Same physical click at x=50. Under RTL the inline start is the right
    // edge, so the fraction is (right - 10 - x) / 180 = 140/180 → value 78
    // (the mirror of the LTR value 22).
    fireEvent.pointerDown(track, {clientX: 50, clientY: 10, pointerId: 1});
    expect(handleChange).toHaveBeenLastCalledWith(78);

    gcsSpy.mockRestore();
  });

  it('follows the mirrored track under RTL: ArrowLeft increases, ArrowRight decreases, Up/Down unchanged', () => {
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        step={1}
        valueDisplay="none"
        onChange={handleChange}
      />,
    );
    const thumb = screen.getByRole('slider');
    const track = thumb.parentElement!;
    const realGetComputedStyle = window.getComputedStyle;
    const gcsSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === track) {
          return {direction: 'rtl'} as CSSStyleDeclaration;
        }
        return realGetComputedStyle(el, pseudo ?? undefined);
      });

    fireEvent.keyDown(thumb, {key: 'ArrowLeft'});
    expect(handleChange).toHaveBeenLastCalledWith(51);
    fireEvent.keyDown(thumb, {key: 'ArrowRight'});
    expect(handleChange).toHaveBeenLastCalledWith(49);
    fireEvent.keyDown(thumb, {key: 'ArrowUp'});
    expect(handleChange).toHaveBeenLastCalledWith(51);
    fireEvent.keyDown(thumb, {key: 'ArrowDown'});
    expect(handleChange).toHaveBeenLastCalledWith(49);

    gcsSpy.mockRestore();
  });

  it('keeps ArrowLeft decreasing on a vertical track under RTL', () => {
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        step={1}
        orientation="vertical"
        valueDisplay="none"
        onChange={handleChange}
      />,
    );
    const thumb = screen.getByRole('slider');
    const track = thumb.parentElement!;
    const realGetComputedStyle = window.getComputedStyle;
    const gcsSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === track) {
          return {direction: 'rtl'} as CSSStyleDeclaration;
        }
        return realGetComputedStyle(el, pseudo ?? undefined);
      });

    fireEvent.keyDown(thumb, {key: 'ArrowLeft'});
    expect(handleChange).toHaveBeenLastCalledWith(49);
    fireEvent.keyDown(thumb, {key: 'ArrowRight'});
    expect(handleChange).toHaveBeenLastCalledWith(51);

    gcsSpy.mockRestore();
  });

  // --- Mark label click snapping ---

  it('clicking a mark label snaps to that mark value, not pointer position', () => {
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        onChange={handleChange}
        marks={[{value: 100, label: '100'}]}
      />,
    );
    const markLabel = screen.getByTestId('slider-mark-label');

    // Simulate a click on the left edge of the "100" label — pointer X would
    // map to ~99 if calculated from position, but should snap to 100.
    fireEvent.pointerDown(markLabel, {clientX: 1, clientY: 10, pointerId: 1});

    expect(handleChange).toHaveBeenCalledWith(100);
  });

  // --- Marks color ---

  /** Whether the element has an unconditional rule painting a token. */
  function declaresColorToken(el: Element, token: string): boolean {
    return rulesDeclaredFor(el).some(rule => {
      const selector = rule
        .slice(0, rule.indexOf('{'))
        .replaceAll(':not(#\\#)', '');
      return !selector.includes(':') && rule.includes(`var(${token})`);
    });
  }

  it('uses the track color for unfilled marks and the accent for filled marks', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        marks={[{value: 25}, {value: 75}]}
      />,
    );
    const marks = screen.getAllByTestId('slider-mark');

    expect(marks).toHaveLength(2);
    expect(declaresColorToken(marks[0], '--color-track')).toBe(false);
    expect(declaresColorToken(marks[0], '--color-accent')).toBe(true);
    expect(declaresColorToken(marks[1], '--color-track')).toBe(true);
    expect(declaresColorToken(marks[1], '--color-accent')).toBe(false);
  });

  function declaresFillColor(el: Element): boolean {
    return declaresColorToken(el, '--color-accent');
  }

  it('colors marks at or behind the thumb with the fill color', () => {
    render(
      <Slider
        label="Volume"
        value={50}
        min={0}
        max={100}
        marks={[
          {value: 0},
          {value: 25},
          {value: 50},
          {value: 75},
          {value: 100},
        ]}
      />,
    );
    const marks = screen.getAllByTestId('slider-mark');
    expect(marks).toHaveLength(5);
    // Marks at 0, 25, and 50 sit at or behind the thumb: fill color.
    expect(declaresFillColor(marks[0])).toBe(true);
    expect(declaresFillColor(marks[1])).toBe(true);
    expect(declaresFillColor(marks[2])).toBe(true);
    // Marks at 75 and 100 sit ahead of the thumb: default mark color.
    expect(declaresFillColor(marks[3])).toBe(false);
    expect(declaresFillColor(marks[4])).toBe(false);
  });

  it('colors marks between the thumbs with the fill color in range mode', () => {
    render(
      <Slider
        label="Price range"
        value={[20, 80] as [number, number]}
        min={0}
        max={100}
        marks={[
          {value: 0},
          {value: 20},
          {value: 50},
          {value: 80},
          {value: 100},
        ]}
      />,
    );
    const marks = screen.getAllByTestId('slider-mark');
    expect(marks).toHaveLength(5);
    // The mark at 0 sits before the range: default mark color.
    expect(declaresFillColor(marks[0])).toBe(false);
    // Marks at 20, 50, and 80 sit between (or at) the thumbs: fill color.
    expect(declaresFillColor(marks[1])).toBe(true);
    expect(declaresFillColor(marks[2])).toBe(true);
    expect(declaresFillColor(marks[3])).toBe(true);
    // The mark at 100 sits after the range: default mark color.
    expect(declaresFillColor(marks[4])).toBe(false);
  });

  // --- Boundary clamping ---

  it('clamps value at max boundary', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={99}
        min={0}
        max={100}
        step={5}
        onChange={handleChange}
      />,
    );
    const slider = screen.getByRole('slider');
    act(() => {
      slider.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(handleChange).toHaveBeenCalledWith(100);
  });

  it('clamps value at min boundary', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Slider
        label="Volume"
        value={1}
        min={0}
        max={100}
        step={5}
        onChange={handleChange}
      />,
    );
    const slider = screen.getByRole('slider');
    act(() => {
      slider.focus();
    });
    await user.keyboard('{ArrowLeft}');
    expect(handleChange).toHaveBeenCalledWith(0);
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;

    function getTrack(): HTMLElement {
      return screen.getByRole('slider').parentElement!;
    }

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <Slider
          label="Volume"
          value={50}
          valueDisplay="none"
          isDisabled
          disabledMessage="Volume is locked while sharing your screen"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent(
        'Volume is locked while sharing your screen',
      );
      fireEvent.mouseEnter(getTrack());
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
      fireEvent.mouseLeave(getTrack());
      await waitFor(() => expect(tooltip).not.toHaveAttribute('popover-open'));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <Slider
          label="Volume"
          value={50}
          valueDisplay="none"
          isDisabled
          disabledMessage="Volume is locked while sharing your screen"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('slider')).toHaveFocus();
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <Slider
          label="Volume"
          value={50}
          valueDisplay="none"
          disabledMessage="Volume is locked while sharing your screen"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <Slider label="Volume" value={50} valueDisplay="none" isDisabled />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the thumb focusable via aria-disabled when a reason is provided', () => {
      render(
        <Slider
          label="Volume"
          value={50}
          valueDisplay="none"
          isDisabled
          disabledMessage="Volume is locked while sharing your screen"
        />,
      );
      const thumb = screen.getByRole('slider');
      expect(thumb).toHaveAttribute('aria-disabled', 'true');
      expect(thumb).toHaveAttribute('tabindex', '0');
    });

    it('links the reason tooltip via aria-describedby', () => {
      render(
        <Slider
          label="Volume"
          value={50}
          valueDisplay="none"
          isDisabled
          disabledMessage="Volume is locked while sharing your screen"
        />,
      );
      const thumb = screen.getByRole('slider');
      const tooltip = screen.getByRole('tooltip', h);
      expect(thumb.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks value changes while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Slider
          label="Volume"
          value={50}
          valueDisplay="none"
          onChange={onChange}
          isDisabled
          disabledMessage="Volume is locked while sharing your screen"
        />,
      );
      const thumb = screen.getByRole('slider');
      act(() => thumb.focus());
      await user.keyboard('{ArrowRight}');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('stays focusable when disabled without a reason', () => {
      render(
        <Slider label="Volume" value={50} valueDisplay="none" isDisabled />,
      );
      expect(screen.getByRole('slider')).toHaveAttribute('tabindex', '0');
    });
  });
  describe('form participation', () => {
    it('submits the value under htmlName', () => {
      const {container} = render(
        <form>
          <Slider label="Volume" htmlName="volume" value={50} />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('volume')).toBe('50');
    });

    it('submits both range values under the same name', () => {
      const {container} = render(
        <form>
          <Slider
            label="Price"
            htmlName="price"
            value={[20, 80] as [number, number]}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.getAll('price')).toEqual(['20', '80']);
    });

    it('is excluded from form data when disabled', () => {
      const {container} = render(
        <form>
          <Slider label="Volume" htmlName="volume" value={50} isDisabled />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });
  });

  describe('focus ring modality', () => {
    beforeEach(() => {
      __resetInteractionModalityForTest();
    });

    // The ring is a stylex class, so derive it from the same source the
    // component applies rather than hardcoding a hash.
    const RING = stylex
      .props(focusOutlineStyles.focusVisible)
      .className!.split(' ');
    const isRinged = (el: HTMLElement) =>
      RING.every(c => el.classList.contains(c));

    // The track has no layout in jsdom; pointer maths needs a real rect.
    const grabTrack = (thumb: HTMLElement) => {
      const track = thumb.parentElement!;
      track.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 20,
        width: 200,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => {},
      });
      fireEvent.pointerDown(track, {clientX: 100, clientY: 10, pointerId: 1});
    };

    it('rings when the thumb is reached with the keyboard', async () => {
      const user = userEvent.setup();
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      await user.tab();
      expect(isRinged(screen.getByRole('slider'))).toBe(true);
    });

    it('does not ring when the thumb is grabbed with the mouse', () => {
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      const thumb = screen.getByRole('slider');
      grabTrack(thumb);
      expect(thumb).toHaveFocus();
      expect(isRinged(thumb)).toBe(false);
    });

    it('drops the ring when the mouse grabs a thumb that already had it', async () => {
      const user = userEvent.setup();
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      await user.tab();
      const thumb = screen.getByRole('slider');
      expect(isRinged(thumb)).toBe(true);
      // Already focused, so focus() fires no focus event.
      grabTrack(thumb);
      expect(isRinged(thumb)).toBe(false);
    });

    it('brings the ring back when an arrow key follows a mouse drag', () => {
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      const thumb = screen.getByRole('slider');
      grabTrack(thumb);
      expect(isRinged(thumb)).toBe(false);
      fireEvent.keyDown(thumb, {key: 'ArrowRight'});
      expect(isRinged(thumb)).toBe(true);
    });

    it('leaves the ring off for a modifier chord after a mouse drag', () => {
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      const thumb = screen.getByRole('slider');
      grabTrack(thumb);
      // Copying or reloading is not navigation, and the mouse is still on it.
      fireEvent.keyDown(thumb, {key: 'c', metaKey: true});
      expect(isRinged(thumb)).toBe(false);
    });

    it('leaves the ring off for a bare Shift press after a mouse drag', () => {
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      const thumb = screen.getByRole('slider');
      grabTrack(thumb);
      fireEvent.keyDown(thumb, {key: 'Shift', shiftKey: true});
      expect(getInteractionModality()).toBe('keyboard');
      expect(isRinged(thumb)).toBe(false);
    });

    it.each([
      ['Meta', {metaKey: true}],
      ['Alt', {altKey: true}],
      ['Control', {ctrlKey: true}],
    ])(
      'leaves the ring off for %s and its chord after bare Shift',
      (key, flags) => {
        render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
        const thumb = screen.getByRole('slider');
        grabTrack(thumb);
        fireEvent.keyDown(thumb, {key: 'Shift', shiftKey: true});
        fireEvent.keyUp(thumb, {key: 'Shift'});
        fireEvent.keyDown(thumb, {key, ...flags});
        expect(isRinged(thumb)).toBe(false);
        fireEvent.keyDown(thumb, {key: 'c', ...flags});
        expect(getInteractionModality()).toBe('keyboard');
        expect(isRinged(thumb)).toBe(false);
      },
    );

    it('restores the ring and changes value for Shift+Arrow after bare Shift', () => {
      const onChange = vi.fn();
      render(<Slider label="Volume" value={50} onChange={onChange} />);
      const thumb = screen.getByRole('slider');
      grabTrack(thumb);
      onChange.mockClear();
      fireEvent.keyDown(thumb, {key: 'Shift', shiftKey: true});
      expect(isRinged(thumb)).toBe(false);
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.keyDown(thumb, {key: 'ArrowRight', shiftKey: true});
      expect(isRinged(thumb)).toBe(true);
      expect(onChange).toHaveBeenCalledWith(51);
    });

    it('preserves an existing keyboard ring when Shift is pressed', async () => {
      const user = userEvent.setup();
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      await user.tab();
      const thumb = screen.getByRole('slider');

      fireEvent.keyDown(thumb, {key: 'Shift', shiftKey: true});
      expect(isRinged(thumb)).toBe(true);
    });

    it('rings when Shift+Tab returns to a mouse-focused thumb', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Slider label="Volume" value={50} onChange={vi.fn()} />
          <button type="button">After slider</button>
        </>,
      );
      const thumb = screen.getByRole('slider');
      grabTrack(thumb);
      expect(isRinged(thumb)).toBe(false);
      await user.click(screen.getByRole('button', {name: 'After slider'}));

      await user.tab({shift: true});
      expect(thumb).toHaveFocus();
      expect(isRinged(thumb)).toBe(true);
    });

    it('drops the ring on blur', async () => {
      const user = userEvent.setup();
      render(<Slider label="Volume" value={50} onChange={vi.fn()} />);
      await user.tab();
      const thumb = screen.getByRole('slider');
      expect(isRinged(thumb)).toBe(true);
      act(() => thumb.blur());
      expect(isRinged(thumb)).toBe(false);
    });

    it('rings the range thumb the keyboard reached, not its sibling', async () => {
      const user = userEvent.setup();
      render(
        <Slider
          label="Price"
          value={[20, 80] as [number, number]}
          onChange={vi.fn()}
        />,
      );
      await user.tab();
      await user.tab();
      const thumbs = screen.getAllByRole('slider');
      expect(thumbs[1]).toHaveFocus();
      expect(isRinged(thumbs[1])).toBe(true);
      expect(isRinged(thumbs[0])).toBe(false);
    });
  });
});

describe('one pointer per drag', () => {
  // valueDisplay="none" keeps the thumb a direct child of the track, so the
  // mocked rect lands on it: 200 px wide, thumbs travel 10 px (0) to 190 px
  // (100), value = (x - 10) / 1.8.
  function ControlledSlider({
    id,
    onChangeEnd,
  }: {
    id: string;
    onChangeEnd?: (value: number) => void;
  }) {
    const [value, setValue] = useState(50);
    return (
      <Slider
        label={id}
        value={value}
        min={0}
        max={100}
        valueDisplay="none"
        onChange={setValue}
        onChangeEnd={onChangeEnd}
      />
    );
  }

  function trackOf(thumb: HTMLElement): HTMLElement {
    const track = thumb.parentElement!;
    track.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    return track;
  }

  it('ignores a second finger that lands, moves or lifts during a drag', () => {
    const onChangeEnd = vi.fn();
    render(<ControlledSlider id="Volume" onChangeEnd={onChangeEnd} />);
    const thumb = screen.getByRole('slider');
    const track = trackOf(thumb);

    fireEvent.pointerDown(track, {clientX: 100, clientY: 10, pointerId: 1});
    fireEvent.pointerDown(track, {clientX: 28, clientY: 10, pointerId: 2});
    expect(thumb).toHaveAttribute('aria-valuenow', '50');

    fireEvent.pointerMove(track, {clientX: 136, clientY: 10, pointerId: 1});
    fireEvent.pointerMove(track, {clientX: 46, clientY: 10, pointerId: 2});
    expect(thumb).toHaveAttribute('aria-valuenow', '70');

    // The second finger lifting does not end the first finger's drag.
    fireEvent.pointerUp(track, {clientX: 46, clientY: 10, pointerId: 2});
    expect(onChangeEnd).not.toHaveBeenCalled();
    expect(declaresPressedOverlay(thumb)).toBe(true);

    fireEvent.pointerMove(track, {clientX: 154, clientY: 10, pointerId: 1});
    fireEvent.pointerUp(track, {clientX: 154, clientY: 10, pointerId: 1});
    expect(thumb).toHaveAttribute('aria-valuenow', '80');
    expect(onChangeEnd).toHaveBeenCalledOnce();
    expect(onChangeEnd).toHaveBeenCalledWith(80);
    expect(declaresPressedOverlay(thumb)).toBe(false);
  });

  it('ends the drag when its pointer capture is lost without an up', () => {
    const onChangeEnd = vi.fn();
    render(<ControlledSlider id="Volume" onChangeEnd={onChangeEnd} />);
    const thumb = screen.getByRole('slider');
    const track = trackOf(thumb);

    fireEvent.pointerDown(track, {clientX: 136, clientY: 10, pointerId: 1});
    fireEvent.lostPointerCapture(track, {pointerId: 1});
    expect(onChangeEnd).toHaveBeenCalledOnce();
    expect(onChangeEnd).toHaveBeenCalledWith(70);
    expect(declaresPressedOverlay(thumb)).toBe(false);

    // The slider answers the next press.
    fireEvent.pointerDown(track, {clientX: 28, clientY: 10, pointerId: 3});
    expect(thumb).toHaveAttribute('aria-valuenow', '10');
  });

  it('ends the drag when its control node is replaced mid-drag and the capture is lost', () => {
    // A FormLayout direction change re-renders the field in another layout,
    // replacing the control node while the drag holds it. The browser then
    // fires lostpointercapture at the document, not at the removed node.
    const onChangeEnd = vi.fn();
    function InLayout({
      direction,
    }: {
      direction: 'vertical' | 'horizontal-labels';
    }) {
      return (
        <FormLayout direction={direction}>
          <ControlledSlider id="Volume" onChangeEnd={onChangeEnd} />
        </FormLayout>
      );
    }
    const {rerender} = render(<InLayout direction="vertical" />);
    const before = trackOf(screen.getByRole('slider'));
    fireEvent.pointerDown(before, {clientX: 136, clientY: 10, pointerId: 1});

    rerender(<InLayout direction="horizontal-labels" />);
    fireEvent.lostPointerCapture(document, {pointerId: 1});
    expect(onChangeEnd).toHaveBeenCalledOnce();

    // The slider answers the next press on whichever node it renders now.
    const thumb = screen.getByRole('slider');
    const after = trackOf(thumb);
    fireEvent.pointerDown(after, {clientX: 28, clientY: 10, pointerId: 3});
    expect(thumb).toHaveAttribute('aria-valuenow', '10');
  });

  it('holds a document listener only while a drag is in progress', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const lostCapture = (spy: typeof add) =>
      spy.mock.calls.filter(([type]) => type === 'lostpointercapture');
    const {unmount} = render(<ControlledSlider id="Volume" />);
    const track = trackOf(screen.getByRole('slider'));
    // Idle: no document listener.
    expect(lostCapture(add)).toHaveLength(0);

    fireEvent.pointerDown(track, {clientX: 136, clientY: 10, pointerId: 1});
    expect(lostCapture(add)).toHaveLength(1);
    const listener = lostCapture(add)[0][1];
    fireEvent.pointerUp(track, {clientX: 136, clientY: 10, pointerId: 1});
    expect(lostCapture(remove).map(([, fn]) => fn)).toEqual([listener]);

    // A slider unmounted mid-drag removes its listener too.
    fireEvent.pointerDown(track, {clientX: 28, clientY: 10, pointerId: 2});
    const second = lostCapture(add)[1][1];
    unmount();
    expect(lostCapture(remove).map(([, fn]) => fn)).toEqual([listener, second]);
    add.mockRestore();
    remove.mockRestore();
  });

  it('lets two fingers drag two sliders at once', () => {
    render(
      <>
        <ControlledSlider id="Treble" />
        <ControlledSlider id="Bass" />
      </>,
    );
    const treble = screen.getByRole('slider', {name: 'Treble'});
    const bass = screen.getByRole('slider', {name: 'Bass'});
    const trebleTrack = trackOf(treble);
    const bassTrack = trackOf(bass);

    fireEvent.pointerDown(trebleTrack, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerDown(bassTrack, {clientX: 100, clientY: 10, pointerId: 2});
    fireEvent.pointerMove(trebleTrack, {
      clientX: 154,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerMove(bassTrack, {clientX: 28, clientY: 10, pointerId: 2});

    expect(treble).toHaveAttribute('aria-valuenow', '80');
    expect(bass).toHaveAttribute('aria-valuenow', '10');
  });
});

describe('pressed state', () => {
  it('paints the pressed overlay on the thumb for as long as it is dragged, from wherever the press lands', () => {
    render(
      <Slider label="Volume" value={50} min={0} max={100} onChange={vi.fn()} />,
    );
    const thumb = screen.getByRole('slider');
    const trackContainer = thumb.parentElement!;
    trackContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    expect(declaresPressedOverlay(thumb)).toBe(false);
    // A slider is a drag: the press lands on the track, not the thumb, and
    // the thumb follows it. The pressed paint follows the drag.
    fireEvent.pointerDown(trackContainer, {
      clientX: 20,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(thumb)).toBe(true);
    fireEvent.pointerMove(trackContainer, {
      clientX: 120,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(thumb)).toBe(true);
    fireEvent.pointerUp(trackContainer, {
      clientX: 120,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(thumb)).toBe(false);
  });

  it('paints only the thumb being dragged in a range slider', () => {
    render(
      <Slider
        label="Price"
        value={[20, 80] as [number, number]}
        min={0}
        max={100}
        onChange={vi.fn()}
      />,
    );
    const [start, end] = screen.getAllByRole('slider');
    // In range mode the control is the group; each thumb sits in its own
    // value-tooltip wrapper.
    const trackContainer = screen.getByRole('group');
    trackContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.pointerDown(trackContainer, {
      clientX: 170,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(end)).toBe(true);
    expect(declaresPressedOverlay(start)).toBe(false);
    fireEvent.pointerUp(trackContainer, {
      clientX: 170,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(end)).toBe(false);
  });

  it('keeps a direct press on the visible upper thumb when range values coincide', () => {
    render(
      <Slider
        label="Price"
        value={[50, 50] as [number, number]}
        min={0}
        max={100}
        onChange={vi.fn()}
      />,
    );
    const [start, end] = screen.getAllByRole('slider');
    const trackContainer = screen.getByRole('group');
    trackContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(end, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(end)).toBe(true);
    expect(declaresPressedOverlay(start)).toBe(false);
  });

  it('does not press a disabled slider', () => {
    render(<Slider label="Volume" value={50} isDisabled onChange={vi.fn()} />);
    const thumb = screen.getByRole('slider');
    fireEvent.pointerDown(thumb.parentElement!, {
      clientX: 20,
      clientY: 10,
      pointerId: 1,
    });
    expect(declaresPressedOverlay(thumb)).toBe(false);
  });
});
