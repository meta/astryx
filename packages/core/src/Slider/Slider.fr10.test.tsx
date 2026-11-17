// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {createRef} from 'react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {Slider, type SliderProps} from './Slider';

describe('Slider props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<SliderProps>();
  });
});

describeFieldInputParts('Slider', {
  renderMember: props => (
    <Slider label="Volume" value={50} onChange={() => {}} {...props} />
  ),
  getControl: () => screen.getByRole('slider'),
  inGroup: false,
});

describe('Slider range mode prop targets', () => {
  it('forwards base props and ref to the role="group" control', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Slider
        label="Price"
        value={[20, 80]}
        onChange={() => {}}
        ref={ref}
        data-testid="price"
        aria-details="price-help"
      />,
    );
    const group = screen.getByRole('group', {name: 'Price'});
    expect(ref.current).toBe(group);
    expect(group).toHaveAttribute('data-testid', 'price');
    expect(group).toHaveAttribute('aria-details', 'price-help');
  });

  it('calls a consumer onPointerDown after its own press handling', () => {
    const onPointerDown = vi.fn();
    render(
      <Slider
        label="Volume"
        value={50}
        onChange={() => {}}
        onPointerDown={onPointerDown}
      />,
    );
    const control = document.querySelector<HTMLElement>(
      '.astryx-slider-control',
    )!;
    fireEvent.pointerDown(control, {pointerId: 1, clientX: 10, clientY: 5});
    expect(onPointerDown).toHaveBeenCalledOnce();
  });
});

describe("Slider keeps a caller's aria-labelledby", () => {
  it('names the thumb by its label and then the caller ids', () => {
    render(
      <>
        <span id="caller-name">Speaker</span>
        <Slider
          label="Volume"
          value={50}
          onChange={() => {}}
          aria-labelledby="caller-name"
        />
      </>,
    );
    expect(
      screen.getByRole('slider', {name: 'Volume Speaker'}),
    ).toBeInTheDocument();
  });

  it('names the range group by its label and then the caller ids', () => {
    render(
      <>
        <span id="caller-name">USD</span>
        <Slider
          label="Price"
          value={[20, 80]}
          onChange={() => {}}
          aria-labelledby="caller-name"
        />
      </>,
    );
    expect(screen.getByRole('group', {name: 'Price USD'})).toBeInTheDocument();
  });
});
