// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme seams for the spinner picture, the tree disclosure mark, the
 *   number stepper buttons, and the toast and banner close buttons.
 * @input Spinner, TreeList, NumberInput, Toast and Banner rendered in jsdom,
 *   with and without a theme that supplies `spinner` and `tree-disclosure`
 *   indicators.
 * @output Failures naming a seam that is missing, a theme picture that does
 *   not replace the built-in one, or a default render that changed.
 * @position Beside themingTargets.test.ts, which checks the documented
 *   targets against the source; this checks what each part renders.
 */

import {act, render, screen} from '@testing-library/react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {Banner} from '../Banner/Banner';
import type {IndicatorProps} from '../Indicator/types';
import {NumberInput} from '../NumberInput/NumberInput';
import {Spinner} from '../Spinner/Spinner';
import {Toast} from '../Toast/Toast';
import {TreeList} from '../TreeList/TreeList';
import {declaredValue} from '../__tests__/stylexDeclarations';
import {Theme} from './Theme';
import {defineTheme} from './defineTheme';
import {registerTheme} from './themeRegistry';
import {dataAttr} from '../naming';

function Hourglass({state}: IndicatorProps<'activity'>) {
  return <span data-testid="hourglass" data-state={state} aria-hidden="true" />;
}

function PlusMinus({state}: IndicatorProps<'disclosure'>) {
  return (
    <span data-testid="plus-minus" aria-hidden="true">
      {state === 'expanded' ? '-' : '+'}
    </span>
  );
}

const era = defineTheme({
  name: 'era-indicators',
  indicators: {spinner: Hourglass, 'tree-disclosure': PlusMinus},
});

const tree = (
  <TreeList
    aria-label="Files"
    items={[
      {
        id: 'src',
        label: 'src',
        isExpanded: true,
        children: [{id: 'index', label: 'index.ts'}],
      },
    ]}
  />
);

describe('the default render is unchanged', () => {
  it('draws the built-in spinner ring', () => {
    expect(renderToStaticMarkup(<Spinner />)).toMatchSnapshot();
  });

  it('draws the built-in rotating chevron', () => {
    expect(renderToStaticMarkup(tree)).toMatchSnapshot();
  });
});

describe('a theme replaces the spinner and the tree disclosure mark', () => {
  it('draws the theme spinner inside the spinner box, busy', () => {
    render(
      <Theme theme={era}>
        <Spinner />
      </Theme>,
    );
    const box = screen.getByRole('progressbar');
    expect(box).toHaveClass('astryx-spinner');
    const pic = screen.getByTestId('hourglass');
    expect(box.contains(pic)).toBe(true);
    expect(pic.getAttribute('data-state')).toBe('busy');
    expect(box.querySelector('svg')).toBeNull();
  });

  it('draws the theme mark in the chevron slot for each state', () => {
    const {container} = render(<Theme theme={era}>{tree}</Theme>);
    const marks = screen.getAllByTestId('plus-minus');
    expect(marks[0].textContent).toBe('-');
    expect(
      marks[0].closest('.astryx-tree-list-chevron')?.getAttribute('data-state'),
    ).toBe('expanded');
    expect(container.querySelector('.astryx-tree-list-chevron svg')).toBeNull();
  });
});

describe('parts that paint carry their own target', () => {
  it('gives each number stepper button its direction', () => {
    const {container} = render(
      <NumberInput
        label="Count"
        value={1}
        onChange={vi.fn()}
        hasNumberSteppers
      />,
    );
    const steppers = container.querySelectorAll('.astryx-number-input-stepper');
    expect([...steppers].map(s => s.getAttribute('data-direction'))).toEqual([
      'increment',
      'decrement',
    ]);
  });

  it("gives the toast close button toast-close, in the card's text color", () => {
    render(
      <Toast
        body="Saved"
        type="error"
        isAutoHide={false}
        autoHideDuration={0}
        onDismiss={vi.fn()}
      />,
    );
    const close = document.querySelector<HTMLElement>('.astryx-toast-close');
    expect(close).not.toBeNull();
    expect(declaredValue(close!, 'color')).toBe('inherit');
  });

  it('gives the banner close button banner-close, in its status text color', () => {
    render(<Banner status="error" title="Failed" isDismissable />);
    const close = document.querySelector<HTMLElement>('.astryx-banner-close');
    expect(close).not.toBeNull();
    // The button's text reads the status on-color the banner scopes to it,
    // as before: no color of its own.
    expect(declaredValue(close!, '--color-text-primary')).toMatch(
      /--color-on-error-muted/,
    );
    expect(declaredValue(close!, 'color')).not.toBe('inherit');
  });
});

describe('with no Theme provider', () => {
  it("draws Core's own spinner ring and chevron when no theme is active", () => {
    const {container} = render(
      <>
        <Spinner />
        {tree}
      </>,
    );
    expect(screen.queryByTestId('hourglass')).toBeNull();
    expect(screen.queryByTestId('plus-minus')).toBeNull();
    expect(container.querySelector('[role="progressbar"] svg')).not.toBeNull();
  });

  it("follows the root theme's indicators, as every other indicator does", () => {
    // A separate React root, or the fallback toast viewport, sees the root
    // theme through <html> and the registry, with no provider context.
    registerTheme(era);
    document.documentElement.setAttribute(dataAttr('theme'), era.name);
    try {
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      act(() => {
        root.render(
          <>
            <Spinner />
            {tree}
          </>,
        );
      });
      expect(host.querySelector('[data-testid="hourglass"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="plus-minus"]')).not.toBeNull();
      expect(host.querySelector('[role="progressbar"] svg')).toBeNull();
      act(() => root.unmount());
      host.remove();
    } finally {
      document.documentElement.removeAttribute(dataAttr('theme'));
    }
  });
});
