// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircleCheckIndicator.test.tsx
 * @input vitest, Testing Library, CircleCheckIndicator, and core's
 *   CheckboxInput and CheckboxList with a theme that maps `checkbox`
 * @output Unit tests for the theme target and its state attributes, and the
 *   mark drawn per state (a ring, a check, a bar). They also cover children
 *   that replace the mark, the decorative semantics and the theme mapping
 *   into core's checkbox hosts.
 * @position Testing; validates CircleCheckIndicator.tsx. The touch clock is
 *   circleCheck.test.tsx; the real-engine proof is
 *   __tests__/CircleCheckIndicator.interaction.browser.spec.ts
 *
 * SYNC: When CircleCheckIndicator.tsx changes, update tests to match.
 */

import {describe, expect, it} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {useState} from 'react';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {CircleCheckIndicator} from './CircleCheckIndicator';

const circleTheme = defineTheme({
  name: 'circle-check-test',
  indicators: {checkbox: CircleCheckIndicator},
});

/** The visible mark: whether the check and the bar display. */
function marks(root: Element) {
  const check = root.querySelector('.astryx-circle-check-indicator-check');
  const dash = root.querySelector('.astryx-circle-check-indicator-dash');
  if (check == null || dash == null) {
    throw new Error('the mark elements are missing');
  }
  return {
    check: getComputedStyle(check).display !== 'none',
    dash: getComputedStyle(dash).display !== 'none',
  };
}

describe('CircleCheckIndicator', () => {
  it('renders its theme target with state and size, decoratively', () => {
    render(<CircleCheckIndicator state="checked" size="sm" />);
    const circle = document.querySelector('.astryx-circle-check-indicator');
    expect(circle).toHaveAttribute('data-checked', 'checked');
    expect(circle).toHaveAttribute('data-size', 'sm');
    expect(circle).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws an empty ring unchecked, a check when checked, a bar when partial', () => {
    const {rerender} = render(<CircleCheckIndicator state="unchecked" />);
    const circle = document.querySelector('.astryx-circle-check-indicator');
    if (circle == null) {
      throw new Error('no circle');
    }
    // The unchecked circle still renders: an indicator draws in every state.
    expect(circle).not.toHaveAttribute('data-checked');
    expect(marks(circle)).toEqual({check: false, dash: false});
    rerender(<CircleCheckIndicator state="checked" />);
    expect(marks(circle)).toEqual({check: true, dash: false});
    rerender(<CircleCheckIndicator state="indeterminate" />);
    expect(circle).toHaveAttribute('data-checked', 'indeterminate');
    expect(marks(circle)).toEqual({check: false, dash: true});
  });

  it('reflects the disabled state for theme targeting', () => {
    render(<CircleCheckIndicator state="unchecked" isDisabled />);
    expect(
      document.querySelector('.astryx-circle-check-indicator'),
    ).toHaveAttribute('data-disabled', 'disabled');
  });

  it('renders children instead of the mark', () => {
    render(
      <CircleCheckIndicator state="checked">
        <span data-testid="busy" />
      </CircleCheckIndicator>,
    );
    expect(screen.getByTestId('busy')).toBeInTheDocument();
    expect(
      document.querySelector('.astryx-circle-check-indicator-check'),
    ).toBeNull();
  });

  it('stays aria-hidden even when a caller passes false', () => {
    render(<CircleCheckIndicator state="unchecked" aria-hidden={false} />);
    expect(
      document.querySelector('.astryx-circle-check-indicator'),
    ).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('CircleCheckIndicator mapped to `checkbox` by a theme', () => {
  it('draws the circle in a CheckboxInput, which keeps the checkbox semantics', () => {
    function Controlled() {
      const [value, setValue] = useState(false);
      return (
        <Theme theme={circleTheme}>
          <CheckboxInput
            label="Select photo"
            value={value}
            onChange={setValue}
          />
        </Theme>
      );
    }
    render(<Controlled />);
    const input = screen.getByRole('checkbox', {name: 'Select photo'});
    const circle = document.querySelector('.astryx-circle-check-indicator');
    expect(circle).toBeInTheDocument();
    expect(document.querySelector('.astryx-checkbox-indicator')).toBeNull();
    fireEvent.click(input);
    expect(input).toBeChecked();
    expect(circle).toHaveAttribute('data-checked', 'checked');
  });

  it('draws one circle per CheckboxList row', () => {
    render(
      <Theme theme={circleTheme}>
        <CheckboxList label="Photos" value={['a']} onChange={() => {}}>
          <CheckboxListItem label="Beach" value="a" />
          <CheckboxListItem label="Mountains" value="b" />
        </CheckboxList>
      </Theme>,
    );
    const circles = document.querySelectorAll('.astryx-circle-check-indicator');
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute('data-checked', 'checked');
    expect(circles[1]).not.toHaveAttribute('data-checked');
  });
});
