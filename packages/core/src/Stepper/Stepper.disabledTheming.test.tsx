// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Stepper} from './Stepper';
import {Step} from './Step';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';

/**
 * Verification test suite for Stepper disabled theming surface:
 *
 * Architecture Invariant:
 * `architecture:component-theming-surface` INV6:
 * "has a state that changes paint reflected on the owning target"
 *
 * Contract:
 * - In compact on-track layout (where step-label is omitted for non-active steps),
 *   `step-indicator` and `step` reflect `data-disabled="disabled"`.
 * - In expanded horizontal and vertical layouts, `step`, `step-indicator`, and
 *   `step-label` reflect `data-disabled="disabled"`.
 * - `step-description` does not reflect `disabled` (keeps its phase vocabulary).
 * - Theme rules generated for `.astryx-step[data-disabled="disabled"]` and
 *   `.astryx-step-indicator[data-disabled="disabled"]` are supported.
 */

function atWidth(width: number, ui: React.ReactElement) {
  const original = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'clientWidth',
  );
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      if (this.classList.contains('astryx-stepper')) {
        return width;
      }
      return this.classList.contains('astryx-stepper-frame') ? 1000 : 0;
    },
  });
  try {
    return render(ui);
  } finally {
    if (original) {
      Object.defineProperty(Element.prototype, 'clientWidth', original);
    } else {
      delete (Element.prototype as {clientWidth?: number}).clientWidth;
    }
  }
}

describe('Stepper disabled theming surface (architecture:component-theming-surface INV6)', () => {
  it('reflects disabled on step and step-indicator in compact on-track layout', () => {
    atWidth(
      240,
      <Stepper
        activeStep={0}
        label="Checkout"
        indicatorPosition="on-track"
        horizontalOptions={{
          minimumStepWidth: 160,
          collapsedVariant: 'withLabelAndControls',
        }}>
        <Step step={0} label="Shipping" />
        <Step step={1} label="Delivery" isDisabled />
        <Step step={2} label="Payment" />
      </Stepper>,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const shippingStep = items[0];
    const deliveryStep = items[1];
    const paymentStep = items[2];

    const shippingIndicator = shippingStep.querySelector(
      '.astryx-step-indicator',
    );
    const deliveryIndicator = deliveryStep.querySelector(
      '.astryx-step-indicator',
    );
    const paymentIndicator = paymentStep.querySelector(
      '.astryx-step-indicator',
    );

    // Shipping (enabled, in-progress)
    expect(shippingStep).not.toHaveAttribute('data-disabled');
    expect(shippingIndicator).not.toHaveAttribute('data-disabled');

    // Delivery (isDisabled=true):
    // step-indicator and owning step must reflect data-disabled="disabled"
    expect(deliveryStep).toHaveAttribute('data-disabled', 'disabled');
    expect(deliveryStep).toHaveAttribute('data-progress', 'not-started');
    expect(deliveryIndicator).toHaveAttribute('data-disabled', 'disabled');
    expect(deliveryIndicator).toHaveAttribute('data-progress', 'not-started');

    // Payment (enabled, not-started)
    expect(paymentStep).not.toHaveAttribute('data-disabled');
    expect(paymentIndicator).not.toHaveAttribute('data-disabled');

    // In compact layout, step-label is omitted for non-active steps
    expect(deliveryStep.querySelector('.astryx-step-label')).toBeNull();
  });

  it('reflects disabled on step, step-indicator, and step-label in expanded horizontal layout', () => {
    render(
      <Stepper activeStep={0} label="Checkout">
        <Step step={0} label="Shipping" />
        <Step
          step={1}
          label="Delivery"
          description="Standard delivery"
          isDisabled
        />
        <Step step={2} label="Payment" />
      </Stepper>,
    );

    const items = screen.getAllByRole('listitem');
    const deliveryStep = items[1];
    const deliveryIndicator = deliveryStep.querySelector(
      '.astryx-step-indicator',
    );
    const deliveryLabel = deliveryStep.querySelector('.astryx-step-label');
    const deliveryDesc = deliveryStep.querySelector('.astryx-step-description');

    expect(deliveryStep).toHaveAttribute('data-disabled', 'disabled');
    expect(deliveryIndicator).toHaveAttribute('data-disabled', 'disabled');
    expect(deliveryLabel).toHaveAttribute('data-disabled', 'disabled');
    // Description does not carry disabled selector
    expect(deliveryDesc).not.toHaveAttribute('data-disabled');
  });

  it('reflects disabled across all indicator variants (number, auto, custom icon)', () => {
    render(
      <Stepper activeStep={0} orientation="vertical">
        <Step step={0} label="Number" indicator="number" isDisabled />
        <Step step={1} label="Auto" indicator="auto" isDisabled />
        <Step
          step={2}
          label="Custom Icon"
          indicator={<span data-testid="custom-icon">★</span>}
          isDisabled
        />
      </Stepper>,
    );

    const items = screen.getAllByRole('listitem');
    for (const item of items) {
      const indicator = item.querySelector('.astryx-step-indicator');
      expect(indicator).toHaveAttribute('data-disabled', 'disabled');
      expect(item).toHaveAttribute('data-disabled', 'disabled');
    }
  });

  it('supports theme rules targeting disabled step and step-indicator via defineTheme', () => {
    const theme = defineTheme({
      name: 'stepper-disabled-theming-test',
      components: {
        step: {
          'disabled:disabled': {opacity: '0.6'},
        },
        'step-indicator': {
          'disabled:disabled': {filter: 'grayscale(1)'},
        },
        'step-label': {
          'disabled:disabled': {opacity: '0.4'},
        },
      },
    });

    const {component: css} = generateThemeCSS(theme);
    expect(css).toContain('.astryx-step[data-disabled="disabled"]');
    expect(css).toContain('.astryx-step-indicator[data-disabled="disabled"]');
    expect(css).toContain('.astryx-step-label[data-disabled="disabled"]');
  });
});
