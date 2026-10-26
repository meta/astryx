// Copyright (c) Meta Platforms, Inc. and affiliates.

import {StrictMode, createRef, useLayoutEffect} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Stepper} from './Stepper';
import {Step} from './Step';
import {useStepperContext} from './StepperContext';
import {useLayer} from '../Layer/useLayer';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {getForcedColorsRules} from '../__tests__/forcedColors';

describe('Stepper', () => {
  it('renders an ordered list of steps (not a nav landmark)', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    // A stepper is a sequence/progress list, not a navigation landmark.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    const list = screen.getByRole('list', {name: 'Progress'});
    expect(list.tagName).toBe('OL');
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('renders step numbers', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="First" indicator="number" />
        <Step step={1} label="Second" indicator="number" />
      </Stepper>,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marks the active step with aria-current', () => {
    render(
      <Stepper activeStep={1}>
        <Step step={0} label="Step 1" data-testid="step-0" />
        <Step step={1} label="Step 2" data-testid="step-1" />
        <Step step={2} label="Step 3" data-testid="step-2" />
      </Stepper>,
    );
    expect(screen.getByTestId('step-0')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('step-1')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByTestId('step-2')).not.toHaveAttribute('aria-current');
  });

  it('renders descriptions when provided', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="Account" description="Create your account" />
        <Step step={1} label="Profile" />
      </Stepper>,
    );
    expect(screen.getByText('Create your account')).toBeInTheDocument();
  });

  it('supports custom accessible label', () => {
    render(
      <Stepper activeStep={0} label="Checkout progress">
        <Step step={0} label="Cart" />
        <Step step={1} label="Payment" />
      </Stepper>,
    );
    expect(
      screen.getByRole('list', {name: 'Checkout progress'}),
    ).toBeInTheDocument();
  });

  it.each(['horizontal', 'vertical'] as const)(
    'exposes only the supported public context keys at runtime when %s',
    orientation => {
      let contextKeys: string[] = [];

      function ContextProbe() {
        contextKeys = Object.keys(useStepperContext()).sort();
        return null;
      }

      render(
        <Stepper activeStep={0} orientation={orientation}>
          <ContextProbe />
          <Step step={0} label="Step 1" />
        </Stepper>,
      );

      expect(contextKeys).toEqual(
        [
          'activeStep',
          'previousActiveStep',
          'orientation',
          'isNonLinear',
          'onStepClick',
          'density',
          'indicatorPosition',
          'registerStep',
        ].sort(),
      );
    },
  );

  it('supports vertical orientation', () => {
    render(
      <Stepper activeStep={0} orientation="vertical">
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
      </Stepper>,
    );
    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('data-orientation', 'vertical');
  });

  it('calls onStepClick when a completed step is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Stepper activeStep={2} onStepClick={handleClick}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    await user.click(
      screen.getByRole('button', {name: 'Go to step 1: Step 1, completed'}),
    );
    expect(handleClick).toHaveBeenCalledWith(0);
  });

  it('calls onStepClick when the active step is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Stepper activeStep={1} onStepClick={handleClick}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    await user.click(
      screen.getByRole('button', {name: 'Go to step 2: Step 2'}),
    );
    expect(handleClick).toHaveBeenCalledWith(1);
  });

  it('renders buttons for upcoming steps in non-linear mode', () => {
    render(
      <Stepper activeStep={0} onStepClick={() => {}}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
      </Stepper>,
    );
    expect(
      screen.getByRole('button', {name: 'Go to step 1: Step 1'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Go to step 2: Step 2'}),
    ).toBeInTheDocument();
  });

  it('calls onStepClick when an upcoming step is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Stepper activeStep={0} onStepClick={handleClick}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    await user.click(
      screen.getByRole('button', {name: 'Go to step 3: Step 3'}),
    );
    expect(handleClick).toHaveBeenCalledWith(2);
  });

  it('does not render buttons for disabled steps', () => {
    render(
      <Stepper activeStep={2} onStepClick={() => {}}>
        <Step step={0} label="Step 1" isDisabled />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    expect(
      screen.queryByRole('button', {name: /Go to step 1: Step 1/}),
    ).not.toBeInTheDocument();
  });

  it('does not render buttons when onStepClick is not provided', () => {
    render(
      <Stepper activeStep={2}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('applies a semantic color status (color only) via data attribute', () => {
    render(
      <Stepper activeStep={1}>
        <Step step={0} label="Step 1" data-testid="step-0" />
        <Step step={1} label="Step 2" status="error" data-testid="step-1" />
      </Stepper>,
    );
    expect(screen.getByTestId('step-1')).toHaveAttribute(
      'data-status',
      'error',
    );
    // status is color-only — it must not change progress semantics.
    expect(screen.getByTestId('step-1')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('reflects each global semantic status on the data attribute', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="A" status="accent" data-testid="s-accent" />
        <Step step={1} label="B" status="success" data-testid="s-success" />
        <Step step={2} label="C" status="warning" data-testid="s-warning" />
        <Step step={3} label="D" status="error" data-testid="s-error" />
      </Stepper>,
    );
    expect(screen.getByTestId('s-accent')).toHaveAttribute(
      'data-status',
      'accent',
    );
    expect(screen.getByTestId('s-success')).toHaveAttribute(
      'data-status',
      'success',
    );
    expect(screen.getByTestId('s-warning')).toHaveAttribute(
      'data-status',
      'warning',
    );
    expect(screen.getByTestId('s-error')).toHaveAttribute(
      'data-status',
      'error',
    );
  });

  it('keeps the progress bar progress-colored regardless of status, recoloring only the indicator', () => {
    // Baseline: a completed step with no status.
    const baseline = render(
      <Stepper activeStep={1}>
        <Step step={0} label="A" data-testid="base" />
      </Stepper>,
    );
    const baseStep = baseline.getByTestId('base');
    const baseBar = baseStep.querySelector('.astryx-step-bar') as HTMLElement;
    const baseIndicator = baseStep.querySelector('svg')
      ?.parentElement as HTMLElement;

    // Same completed step, now with a semantic status.
    const themed = render(
      <Stepper activeStep={1}>
        <Step step={0} label="A" status="error" data-testid="themed" />
      </Stepper>,
    );
    const themedStep = themed.getByTestId('themed');
    const themedBar = themedStep.querySelector(
      '.astryx-step-bar',
    ) as HTMLElement;
    const themedIndicator = themedStep.querySelector('svg')
      ?.parentElement as HTMLElement;

    // Bar coloring must be identical — status must NOT recolor the bar
    // (always --color-accent when filled / --color-border when incomplete).
    expect(themedBar.className).toBe(baseBar.className);

    // The indicator, however, must pick up the status color.
    expect(themedIndicator.className).not.toBe(baseIndicator.className);
  });

  it('keeps an incomplete step bar border-colored regardless of status', () => {
    // Baseline: a not-started step with no status.
    const baseline = render(
      <Stepper activeStep={0}>
        <Step step={0} label="A" data-testid="base-active" />
        <Step step={1} label="B" data-testid="base" />
      </Stepper>,
    );
    const baseBar = baseline
      .getByTestId('base')
      .querySelector('.astryx-step-bar') as HTMLElement;

    // Same not-started step, now with a semantic status.
    const themed = render(
      <Stepper activeStep={0}>
        <Step step={0} label="A" data-testid="themed-active" />
        <Step step={1} label="B" status="warning" data-testid="themed" />
      </Stepper>,
    );
    const themedBar = themed
      .getByTestId('themed')
      .querySelector('.astryx-step-bar') as HTMLElement;

    // Incomplete bar stays border-colored — status must not recolor it.
    expect(themedBar.className).toBe(baseBar.className);
  });

  it('does not set a status data attribute when status is unset', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="Step 1" data-testid="step-0" />
      </Stepper>,
    );
    expect(screen.getByTestId('step-0')).not.toHaveAttribute('data-status');
  });

  it('handles zero active step correctly', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="Step 1" data-testid="step-0" />
        <Step step={1} label="Step 2" data-testid="step-1" />
      </Stepper>,
    );
    expect(screen.getByTestId('step-0')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByTestId('step-1')).not.toHaveAttribute('aria-current');
  });

  it('renders each step as a list item', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="Step 1" />
        <Step step={1} label="Step 2" />
        <Step step={2} label="Step 3" />
      </Stepper>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].tagName).toBe('LI');
  });

  it('accepts a custom ReactNode as indicator', () => {
    render(
      <Stepper activeStep={0}>
        <Step
          step={0}
          label="Step 1"
          indicator={<span data-testid="custom-icon">★</span>}
        />
      </Stepper>,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('accepts a ReactNode as indicator', () => {
    render(
      <Stepper activeStep={1}>
        <Step
          step={1}
          label="Payment"
          indicator={<span data-testid="pay-icon">$</span>}
        />
      </Stepper>,
    );
    expect(screen.getByTestId('pay-icon')).toBeInTheDocument();
  });

  it('renders a distinct indicator glyph per status on non-current steps', () => {
    // All steps completed (activeStep past them) so none is the current step.
    render(
      <Stepper activeStep={4}>
        <Step step={0} label="A" status="success" data-testid="s-success" />
        <Step step={1} label="B" status="warning" data-testid="s-warning" />
        <Step step={2} label="C" status="error" data-testid="s-error" />
        <Step step={3} label="D" data-testid="s-plain" />
      </Stepper>,
    );

    const indicatorClass = (testid: string) =>
      (
        screen.getByTestId(testid).querySelector('svg')
          ?.parentElement as HTMLElement
      ).className;

    // Each status renders an svg indicator (no number badge)...
    expect(screen.getByTestId('s-success').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('s-warning').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('s-error').querySelector('svg')).toBeTruthy();

    // ...and each status tints the indicator differently from the others and
    // from the plain completed (accent) step.
    const classes = new Set([
      indicatorClass('s-success'),
      indicatorClass('s-warning'),
      indicatorClass('s-error'),
      indicatorClass('s-plain'),
    ]);
    expect(classes.size).toBe(4);
  });

  it('lets the current step keep its ring indicator regardless of status', () => {
    // The current-step ring's painted color is driven by the StyleX
    // `iconInProgress` class (accent), never a status color — the ring replaces
    // any status glyph. The `astryx-step-indicator` theme target reflects
    // `status` as a data attribute so a theme can still reach it, which is
    // orthogonal to the painted color, so assert the StyleX color class here.
    const stylexColorClasses = (el: HTMLElement) =>
      el.className
        .split(/\s+/)
        // Keep StyleX classes (debug `Step__styles.*` names + `x*` atomic
        // hashes); drop the themeProps data reflections (`in-progress`,
        // `success`, `astryx-*`) which are orthogonal to the painted color.
        .filter(c => c.startsWith('Step__styles.') || /^x[a-z0-9]+$/.test(c))
        .sort()
        .join(' ');

    const plain = render(
      <Stepper activeStep={0}>
        <Step step={0} label="A" data-testid="plain" />
      </Stepper>,
    );
    const plainIndicator = stylexColorClasses(
      plain.getByTestId('plain').querySelector('svg')
        ?.parentElement as HTMLElement,
    );

    // The same current step, now with status="success": the painted ring must
    // be unchanged (the current-step ring replaces any status glyph).
    const themed = render(
      <Stepper activeStep={0}>
        <Step step={0} label="A" status="success" data-testid="themed" />
      </Stepper>,
    );
    const themedIndicator = stylexColorClasses(
      themed.getByTestId('themed').querySelector('svg')
        ?.parentElement as HTMLElement,
    );

    expect(themedIndicator).toBe(plainIndicator);
    // And it is the in-progress (accent) color, not a status color.
    expect(plainIndicator).toContain('Step__styles.iconInProgress');
  });

  it('replaces the number badge with a status glyph on not-started steps', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="A" data-testid="current" />
        <Step step={1} label="B" status="error" data-testid="future" />
      </Stepper>,
    );
    const future = screen.getByTestId('future');
    // The not-started step would normally show its number ("2"); with a status
    // glyph it shows an icon instead.
    expect(future.textContent).not.toContain('2');
    expect(future.querySelector('svg')).toBeTruthy();
  });

  it('exposes progress/status as visually hidden text (indicators are aria-hidden)', () => {
    render(
      <Stepper activeStep={2}>
        <Step step={0} label="Account" data-testid="done" />
        <Step step={1} label="Payment" status="error" data-testid="failed" />
        <Step step={2} label="Review" data-testid="current" />
        <Step step={3} label="Confirm" data-testid="upcoming" />
      </Stepper>,
    );
    // Completed step announces "completed"; error status wins over completion.
    expect(
      within(screen.getByTestId('done')).getByText('completed'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('failed')).getByText('error'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('failed')).queryByText('completed'),
    ).not.toBeInTheDocument();
    // Current step is announced via aria-current, not hidden text; upcoming
    // steps stay silent.
    expect(
      within(screen.getByTestId('current')).queryByText('completed'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('upcoming')).queryByText(
        /completed|error|warning/,
      ),
    ).not.toBeInTheDocument();
  });

  it('exposes warning and success statuses as visually hidden text', () => {
    render(
      <Stepper activeStep={2}>
        <Step step={0} label="Build" status="warning" data-testid="warned" />
        <Step step={1} label="Deploy" status="success" data-testid="passed" />
      </Stepper>,
    );
    expect(
      within(screen.getByTestId('warned')).getByText('warning'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('passed')).getByText('completed'),
    ).toBeInTheDocument();
  });

  it('composes status into the accessible name of clickable steps', () => {
    render(
      <Stepper activeStep={2} onStepClick={() => {}}>
        <Step step={0} label="Account" />
        <Step step={1} label="Payment" status="error" />
        <Step step={2} label="Review" />
      </Stepper>,
    );
    expect(
      screen.getByRole('button', {name: 'Go to step 1: Account, completed'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Go to step 2: Payment, error'}),
    ).toBeInTheDocument();
    // The current step gets no status suffix (aria-current covers it).
    expect(
      screen.getByRole('button', {name: 'Go to step 3: Review'}),
    ).toBeInTheDocument();
  });

  it('exposes hidden status text in the on-track layout too', () => {
    render(
      <Stepper activeStep={1} indicatorPosition="on-track">
        <Step step={0} label="Account" data-testid="ot-done" />
        <Step step={1} label="Payment" data-testid="ot-current" />
      </Stepper>,
    );
    expect(
      within(screen.getByTestId('ot-done')).getByText('completed'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('ot-current')).queryByText('completed'),
    ).not.toBeInTheDocument();
  });

  // A vertical on-track step's content slot renders outside the row that draws
  // the connector, so without its own segment the track breaks open around any
  // step carrying content. jsdom can't measure the line, so assert the wiring:
  // the slot carries a segment, and it hides on the last step like the row's
  // trailing one does.
  it('continues the on-track connector past a step content slot', () => {
    render(
      <Stepper
        activeStep={1}
        orientation="vertical"
        indicatorPosition="on-track">
        <Step step={0} label="Account" data-testid="ot-plain" />
        <Step step={1} label="Payment" data-testid="ot-content">
          <button type="button">Pay now</button>
        </Step>
      </Stepper>,
    );
    expect(
      screen
        .getByTestId('ot-content')
        .querySelector('[class*="otContentSegV"][class*="otSegHiddenIfLast"]'),
    ).toBeInTheDocument();
    // A step without content has no slot, so no extra segment.
    expect(
      screen.getByTestId('ot-plain').querySelector('[class*="otContentSegV"]'),
    ).not.toBeInTheDocument();
  });

  describe('keyboard interaction', () => {
    it('activates a step with Enter', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Stepper activeStep={2} onStepClick={handleClick}>
          <Step step={0} label="Step 1" />
          <Step step={1} label="Step 2" />
          <Step step={2} label="Step 3" />
        </Stepper>,
      );
      await user.tab();
      expect(
        screen.getByRole('button', {name: 'Go to step 1: Step 1, completed'}),
      ).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledWith(0);
    });

    it('activates a step with Space', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Stepper activeStep={2} onStepClick={handleClick}>
          <Step step={0} label="Step 1" />
          <Step step={1} label="Step 2" />
          <Step step={2} label="Step 3" />
        </Stepper>,
      );
      await user.tab();
      await user.keyboard(' ');
      expect(handleClick).toHaveBeenCalledWith(0);
    });

    it('tabs through steps in document order, skipping disabled ones', async () => {
      const user = userEvent.setup();
      render(
        <Stepper activeStep={3} onStepClick={() => {}}>
          <Step step={0} label="One" />
          <Step step={1} label="Two" isDisabled />
          <Step step={2} label="Three" />
        </Stepper>,
      );
      await user.tab();
      expect(
        screen.getByRole('button', {name: 'Go to step 1: One, completed'}),
      ).toHaveFocus();
      // The disabled step renders no button, so Tab lands on step 3 next.
      await user.tab();
      expect(
        screen.getByRole('button', {name: 'Go to step 3: Three, completed'}),
      ).toHaveFocus();
    });

    it('supports keyboard activation in the on-track layout', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Stepper
          activeStep={2}
          indicatorPosition="on-track"
          onStepClick={handleClick}>
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" />
          <Step step={2} label="Payment" />
        </Stepper>,
      );
      await user.tab();
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledWith(0);
    });
  });

  describe('fragment-grouped steps', () => {
    const onTrackSteps = (
      <>
        <Step step={0} label="Cart" />
        <Step step={1} label="Shipping" />
        <Step step={2} label="Payment" />
      </>
    );

    it('renders on-track steps identically whether they are flat or grouped in a fragment', () => {
      const flat = render(
        <Stepper activeStep={1} indicatorPosition="on-track">
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" />
          <Step step={2} label="Payment" />
        </Stepper>,
      );
      const flatHtml = flat.container.innerHTML;
      flat.unmount();

      const grouped = render(
        <Stepper activeStep={1} indicatorPosition="on-track">
          {onTrackSteps}
        </Stepper>,
      );
      expect(grouped.container.innerHTML).toBe(flatHtml);
    });

    // The connector's end segments are hidden by CSS keyed to the step's own
    // <li> position, which jsdom can't evaluate — assert the wiring instead:
    // every step carries the same hide-if-first/hide-if-last classes, so no
    // step is singled out by counting children.
    it('gives every grouped step the same structural connector classes', () => {
      render(
        <Stepper activeStep={1} indicatorPosition="on-track">
          {onTrackSteps}
        </Stepper>,
      );
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(
          item.querySelector('[class*="otSegHiddenIfFirst"]'),
        ).toBeInTheDocument();
        expect(
          item.querySelector('[class*="otSegHiddenIfLast"]'),
        ).toBeInTheDocument();
      }
    });

    it('keeps every grouped step keyboard-activatable', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Stepper
          activeStep={2}
          indicatorPosition="on-track"
          onStepClick={handleClick}>
          {onTrackSteps}
        </Stepper>,
      );
      screen
        .getByRole('button', {name: 'Go to step 2: Shipping, completed'})
        .focus();
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledWith(1);
    });
  });

  // The connector fill animates a ::before scaled along the track axis, which
  // jsdom neither renders nor times — so assert the wiring the animation hangs
  // off: every connector carries the shared track style (the element that owns
  // the fill layer and its transition), and the fill/empty pair it gets is the
  // one for its axis, since the wrong axis would scale the line's thickness
  // away instead of its length.
  describe('connector fill', () => {
    const barEl = (testId: string) =>
      screen
        .getByTestId(testId)
        .querySelector('[class*="connectorTrack"]') as HTMLElement;

    it('scales the separated bar along the inline axis when horizontal', () => {
      render(
        <Stepper activeStep={1} orientation="horizontal">
          <Step step={0} label="A" data-testid="a" />
          <Step step={1} label="B" data-testid="b" />
          <Step step={2} label="C" data-testid="c" />
        </Stepper>,
      );
      // Reached steps are filled, upcoming ones empty — both on the H pair.
      expect(barEl('a').className).toContain('connectorFillH');
      expect(barEl('b').className).toContain('connectorFillH');
      expect(barEl('c').className).toContain('connectorEmptyH');
      expect(barEl('c').className).not.toContain('connectorEmptyV');
    });

    it('scales the separated bar along the block axis when vertical', () => {
      render(
        <Stepper activeStep={1} orientation="vertical">
          <Step step={0} label="A" data-testid="a" />
          <Step step={1} label="B" data-testid="b" />
          <Step step={2} label="C" data-testid="c" />
        </Stepper>,
      );
      expect(barEl('a').className).toContain('connectorFillV');
      expect(barEl('c').className).toContain('connectorEmptyV');
      expect(barEl('c').className).not.toContain('connectorEmptyH');
    });

    it('gives every on-track segment the track style and its axis pair', () => {
      render(
        <Stepper activeStep={1} indicatorPosition="on-track">
          <Step step={0} label="A" data-testid="a" />
          <Step step={1} label="B" data-testid="b" />
          <Step step={2} label="C" data-testid="c" />
        </Stepper>,
      );
      // A step draws the segments flanking its own indicator, so each carries
      // the track style; none may fall back to the vertical axis pair here.
      for (const id of ['a', 'b', 'c']) {
        const segs = Array.from(
          screen.getByTestId(id).querySelectorAll('[class*="connectorTrack"]'),
        );
        expect(segs).toHaveLength(2);
        for (const seg of segs) {
          expect(seg.className).toMatch(/connector(Fill|Empty)H/);
          expect(seg.className).not.toMatch(/connector(Fill|Empty)V/);
        }
      }
      // Progress splits at the current step: the segment arriving at it is
      // filled, the one leaving it is not.
      const current = Array.from(
        screen.getByTestId('b').querySelectorAll('[class*="connectorTrack"]'),
      );
      expect(current[0].className).toContain('connectorFillH');
      expect(current[1].className).toContain('connectorEmptyH');
    });
  });

  // One change animates the connector: advancing a single step. jsdom runs no
  // transitions, so what is asserted here is the schedule one would run on.
  // Every segment's slice is expressed in one unit — the node-to-node span —
  // so a slice reads as `{start, length}` in spans, a segment that lands at
  // once reads as a pair of zeros, and a span stitched from several segments
  // is contiguous when its slices abut in track order.
  describe('connector fill motion', () => {
    const separated = (activeStep: number) => (
      <Stepper activeStep={activeStep} orientation="horizontal">
        <Step step={0} label="A" data-testid="a" />
        <Step step={1} label="B" data-testid="b" />
        <Step step={2} label="C" data-testid="c" />
        <Step step={3} label="D" data-testid="d" />
        <Step step={4} label="E" data-testid="e" />
      </Stepper>
    );

    // StyleX routes dynamic values through hashed custom properties, whose
    // names are not readable by hand. Recover the mapping from the one change
    // that animates — the only one where the two carry different values. The
    // probe mounts alongside whatever the calling test rendered, so it needs a
    // test id of its own to be found.
    const timingVarNames = (() => {
      let cached: {duration: string; delay: string} | null = null;
      return () => {
        if (cached) {
          return cached;
        }
        const steps = (
          <>
            <Step step={0} label="A" />
            <Step step={1} label="B" data-testid="timing-probe" />
          </>
        );
        const probe = render(<Stepper activeStep={0}>{steps}</Stepper>);
        probe.rerender(<Stepper activeStep={1}>{steps}</Stepper>);
        const el = probe
          .getByTestId('timing-probe')
          .querySelector('[class*="connectorTiming"]') as HTMLElement;
        const found: Record<string, string> = {};
        for (const name of Array.from(el.style)) {
          const value = el.style.getPropertyValue(name).trim();
          if (value === 'var(--duration-medium)') {
            found.duration = name;
          } else if (value === '0s') {
            found.delay = name;
          }
        }
        probe.unmount();
        cached = found as {duration: string; delay: string};
        return cached;
      };
    })();

    /**
     * A slice as a multiple of one span: `0s` is none of a span, a bare span
     * expression is all of one, and `calc(<span> * n)` is n of them.
     */
    const spans = (value: string): number => {
      if (value === '0s') {
        return 0;
      }
      const scaled = value.match(/\* ([\d.]+)\)$/);
      return scaled ? Number(scaled[1]) : 1;
    };

    /** Every connector in track order, as `{start, length}` in spans. */
    const schedule = (el: HTMLElement) =>
      Array.from(
        el.querySelectorAll<HTMLElement>('[class*="connectorTiming"]'),
      ).map(seg => {
        const names = timingVarNames();
        return {
          start: spans(seg.style.getPropertyValue(names.delay).trim()),
          length: spans(seg.style.getPropertyValue(names.duration).trim()),
        };
      });

    /** Nothing in this subtree moves over time. */
    const isInstant = (el: HTMLElement) =>
      schedule(el).every(slice => slice.start === 0 && slice.length === 0);

    /** The span expression itself, which carries the fill's duration. */
    const spanExpression = (el: HTMLElement) => {
      const raw = (
        el.querySelector('[class*="connectorTiming"]') as HTMLElement
      ).style
        .getPropertyValue(timingVarNames().duration)
        .trim();
      return raw.replace(/^calc\((.*) \* [\d.]+\)$/, '$1');
    };

    /**
     * The timing functions the fills in this subtree run on. Unlike the
     * duration and the delay this is a static style, so it lives in the
     * injected stylesheet under one of each segment's atomic classes rather
     * than in an inline custom property.
     */
    const fillEasings = (el: HTMLElement) => {
      const found = new Set<string>();
      for (const seg of Array.from(
        el.querySelectorAll<HTMLElement>('[class*="connectorTrack"]'),
      )) {
        const classes = new Set(seg.className.split(/\s+/));
        for (const sheet of Array.from(document.styleSheets)) {
          for (const rule of Array.from(sheet.cssRules)) {
            if (!('selectorText' in rule)) {
              continue;
            }
            const {selectorText, style} = rule as CSSStyleRule;
            const owner = selectorText.match(/^\.([\w-]+)/);
            if (
              owner == null ||
              !classes.has(owner[1]) ||
              !selectorText.endsWith('::before')
            ) {
              continue;
            }
            const value = style
              .getPropertyValue('transition-timing-function')
              .trim();
            if (value !== '') {
              found.add(value);
            }
          }
        }
      }
      return [...found];
    };

    it('animates the one span a single forward step crosses', () => {
      const {rerender, getByTestId} = render(separated(0));
      rerender(separated(1));
      // The bar arriving at the new step fills across the whole span.
      expect(schedule(getByTestId('b'))).toEqual([{start: 0, length: 1}]);
      // Every other bar is untouched, so it is handed no timing that a later
      // change could inherit as a stale delay.
      for (const id of ['a', 'c', 'd', 'e']) {
        expect(isInstant(getByTestId(id))).toBe(true);
      }
    });

    it('fills that span over the medium duration', () => {
      // A fill crossing a whole segment is a spatial change, not a
      // micro-interaction, so it sits above the fast band.
      const {rerender, getByTestId} = render(separated(0));
      rerender(separated(1));
      expect(spanExpression(getByTestId('b'))).toBe('var(--duration-medium)');
    });

    it('fills linearly so a stitched span reads as one front', () => {
      // An on-track span is drawn by two segments, three where a content slot
      // splits it. A curve applied per segment restarts its deceleration at
      // every seam, and the seam becomes the most visible part of the result.
      const {container} = render(separated(0));
      expect(fillEasings(container.firstElementChild as HTMLElement)).toEqual([
        'linear',
      ]);
    });

    it('lands a forward jump of more than one step at once', () => {
      // A jump is a navigation rather than a progression: sweeping a front
      // across the crossed segments makes the user sit out a journey they
      // asked to skip.
      const {rerender, getByTestId} = render(separated(0));
      rerender(separated(3));
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        expect(isInstant(getByTestId(id))).toBe(true);
      }
    });

    it('lands a backward change at once, one step or several', () => {
      // Retracting is the same arithmetic as filling, but it ends on a
      // shrinking stub of accent rather than a nearly-full bar, and a remnant
      // still on the track reads as unfinished however briefly it is there.
      for (const to of [2, 0]) {
        const view = render(separated(3));
        view.rerender(separated(to));
        for (const id of ['a', 'b', 'c', 'd', 'e']) {
          expect(isInstant(view.getByTestId(id))).toBe(true);
        }
        view.unmount();
      }
    });

    it('leaves every segment instant on mount', () => {
      // A stepper opening mid-flow has no previous step to have travelled
      // from, so its completed segments must paint filled at once rather than
      // replaying the history that would have produced them.
      const {getByTestId} = render(separated(3));
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        expect(isInstant(getByTestId(id))).toBe(true);
      }
    });

    const onTrack = (activeStep: number) => (
      <Stepper
        activeStep={activeStep}
        orientation="horizontal"
        indicatorPosition="on-track">
        <Step step={0} label="A" data-testid="a" />
        <Step step={1} label="B" data-testid="b" />
        <Step step={2} label="C" data-testid="c" />
      </Stepper>
    );

    it('runs the leaving half of an on-track span before the arriving half', () => {
      const {rerender, getByTestId} = render(onTrack(0));
      rerender(onTrack(1));
      // The span is drawn by two steps. Left alone both halves flip together
      // and the gap between two nodes reads as two dashes converging on the
      // space between them; split, the one leaving the near node runs first
      // and the pair reads as one stretch of track filling.
      const [aCap, aRail] = schedule(getByTestId('a'));
      const [bCap, bRail] = schedule(getByTestId('b'));
      expect(aRail).toEqual({start: 0, length: 0.5});
      expect(bCap).toEqual({start: 0.5, length: 0.5});
      // The segments either side of the span are not part of it.
      expect(aCap).toEqual({start: 0, length: 0});
      expect(bRail).toEqual({start: 0, length: 0});
      expect(isInstant(getByTestId('c'))).toBe(true);
    });

    const verticalWithContent = (activeStep: number) => (
      <Stepper
        activeStep={activeStep}
        orientation="vertical"
        indicatorPosition="on-track">
        <Step step={0} label="A" data-testid="a" />
        <Step step={1} label="B" data-testid="b">
          <button type="button">Do it</button>
        </Step>
        <Step step={2} label="C" data-testid="c" />
      </Stepper>
    );

    it('threads a content slot segment into its span between rail and cap', () => {
      const {rerender, getByTestId} = render(verticalWithContent(1));
      rerender(verticalWithContent(2));
      // A vertical step with content draws a third segment down the side of
      // the slot, so the span leaving it is stitched from three pieces and all
      // three have to fall in track order. The rail and cap are unequal
      // lengths, so the slices are unequal too.
      const [bCap, bRail, bContent] = schedule(getByTestId('b'));
      const [cCap] = schedule(getByTestId('c'));
      expect(bRail).toEqual({start: 0, length: 0.175});
      expect(bContent).toEqual({start: 0.175, length: 0.525});
      expect(cCap).toEqual({start: 0.7, length: 0.3});
      // The span arriving at this step belongs to the previous change.
      expect(bCap).toEqual({start: 0, length: 0});
      expect(isInstant(getByTestId('a'))).toBe(true);
    });

    it('tracks the previous step correctly under StrictMode double rendering', () => {
      // The previous step is derived during render from state, so StrictMode
      // invoking the render twice must queue the same successor both times
      // rather than losing a step or advancing two — which would turn a single
      // forward step into a two-step jump and stop it animating.
      const {rerender, getByTestId} = render(
        <StrictMode>{separated(0)}</StrictMode>,
      );
      rerender(<StrictMode>{separated(1)}</StrictMode>);
      expect(schedule(getByTestId('b'))).toEqual([{start: 0, length: 1}]);
      // A second step measures from step 1, not from the original mount, so
      // the next span animates and the one behind it stops.
      rerender(<StrictMode>{separated(2)}</StrictMode>);
      expect(schedule(getByTestId('c'))).toEqual([{start: 0, length: 1}]);
      expect(isInstant(getByTestId('b'))).toBe(true);
    });
  });

  describe('Stepper collapse (narrow containers)', () => {
    const FRAME = '.astryx-stepper-frame';
    const SUMMARY = '.astryx-stepper-summary';

    /**
     * jsdom has no layout, so the width the public Stepper list measures is
     * described by hand. The frame deliberately reports a wide parent: this
     * catches any accidental switch to measuring an unconstrained wrapper, while
     * the regression below separately pins consumer layout styling to that frame.
     * The value has to be in place before the first render because the shared
     * resize observer takes its opening measurement synchronously during commit.
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

    const fourSteps = (
      props: Partial<React.ComponentProps<typeof Stepper>>,
    ) => (
      <Stepper activeStep={1} {...props}>
        <Step step={0} label="Cart" />
        <Step step={1} label="Shipping" description="Where it goes" />
        <Step step={2} label="Delivery" />
        <Step step={3} label="Payment" />
      </Stepper>
    );

    it('keeps every label while each step has room for one', () => {
      // Four steps across 600px is 150 each, comfortably over the threshold.
      atWidth(600, fourSteps({}));
      for (const name of ['Cart', 'Shipping', 'Delivery', 'Payment']) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
      expect(document.querySelector(FRAME)).toBeInTheDocument();
    });

    it('keeps a consumer-constrained summary inside the styled component box', () => {
      atWidth(
        320,
        <div style={{width: 1000}}>
          <Stepper activeStep={1} style={{width: 320}}>
            <Step step={0} label="Cart" />
            <Step step={1} label="Shipping" />
            <Step step={2} label="Delivery" />
            <Step step={3} label="Payment" />
          </Stepper>
        </div>,
      );

      const list = screen.getByRole<HTMLOListElement>('list');
      const frame = list.parentElement as HTMLElement;
      const summary = document.querySelector<HTMLElement>(SUMMARY);
      expect(summary).not.toBeNull();
      expect(frame).toHaveClass('astryx-stepper-frame');
      expect(frame).toHaveStyle({width: '320px'});
      expect(summary!.parentElement).toBe(frame);
      expect(list.style.width).toBe('');
    });

    it('puts horizontal className on the frame without moving list DOM props or ref', () => {
      const ref = createRef<HTMLOListElement>();
      atWidth(
        320,
        <Stepper
          ref={ref}
          activeStep={1}
          className="consumer-stepper"
          data-testid="public-stepper-list"
          aria-describedby="stepper-help">
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" />
          <Step step={2} label="Delivery" />
          <Step step={3} label="Payment" />
        </Stepper>,
      );

      const list = screen.getByTestId('public-stepper-list');
      const frame = list.parentElement as HTMLElement;
      expect(ref.current).toBe(list);
      expect(list).toHaveAttribute('aria-describedby', 'stepper-help');
      expect(list).not.toHaveClass('consumer-stepper');
      expect(frame).toHaveClass('consumer-stepper');
      expect(frame).not.toHaveAttribute('data-testid');
      expect(frame).not.toHaveAttribute('aria-describedby');
    });

    it('drops the labels and names the current step once they no longer fit', () => {
      // 320px over four steps is 80 each, under the 112px a label needs.
      atWidth(320, fourSteps({}));
      const summary = document.querySelector<HTMLElement>(SUMMARY);
      expect(summary).not.toBeNull();

      // Only the current step is named where it can be seen, and only it keeps
      // a description — the rest have no label left to hang one under.
      expect(within(summary!).getByText('Shipping')).toBeInTheDocument();
      expect(within(summary!).getByText('Where it goes')).toBeInTheDocument();
      // The separated track has no indicator nodes of its own, so the compact
      // label keeps the active indicator beside it.
      expect(
        summary!.querySelector('.astryx-step-indicator'),
      ).toBeInTheDocument();

      const list = screen.getByRole('list');
      expect(within(list).queryByText('Where it goes')).toBeNull();
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });

    it('places the compact summary directly against the track', () => {
      atWidth(320, fourSteps({}));
      const frame = document.querySelector<HTMLElement>(FRAME);
      expect(frame).not.toBeNull();
      expect(['0', '0px']).toContain(getComputedStyle(frame!).gap);
    });

    it('collapses later the more steps there are', () => {
      // 320px is ample for two steps at 160 each, and far too little for four.
      atWidth(
        320,
        <Stepper activeStep={0}>
          <Step step={0} label="Details" />
          <Step step={1} label="Review" />
        </Stepper>,
      );
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(document.querySelector('.astryx-stepper-summary')).toBeNull();
    });

    it('treats the minimum step width as pixels without a measurement probe', () => {
      atWidth(
        360,
        fourSteps({
          horizontalOptions: {
            minimumStepWidth: 80,
            collapsedVariant: 'withLabelAndControls',
          },
        }),
      );

      expect(document.querySelector(SUMMARY)).toBeNull();
      expect(
        Array.from(
          document.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
        ).find(element => element.style.width !== ''),
      ).toBeUndefined();
    });

    it('leaves a vertical stepper alone at any width', () => {
      // A column gives every label a row of its own, so there is nothing to
      // run out of and no frame to measure.
      atWidth(120, fourSteps({orientation: 'vertical'}));
      for (const name of ['Cart', 'Shipping', 'Delivery', 'Payment']) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
      expect(document.querySelector(FRAME)).toBeNull();
    });

    it('keeps the sequence whole for a screen reader after collapsing', () => {
      atWidth(320, fourSteps({}));
      const items = screen.getAllByRole('listitem');
      // Every step still names itself and the current one is still marked, so
      // the list reads as a complete sequence with the labels off the screen.
      // The status word rides along with the name, as it does when visible —
      // "Cart" is behind the current step, so it reads as completed.
      expect(items.map(li => li.textContent)).toEqual([
        'Cartcompleted',
        'Shipping',
        'Delivery',
        'Payment',
      ]);
      expect(items[1]).toHaveAttribute('aria-current', 'step');
    });

    it('offers no step controls on a stepper that cannot be navigated', () => {
      // A linear flow is driven by the form's own Back and Continue; a second
      // pair pointed at a step it will not honour is worse than none.
      atWidth(320, fourSteps({}));
      expect(screen.queryByRole('button', {name: 'Next step'})).toBeNull();
      expect(screen.queryByRole('button', {name: 'Previous step'})).toBeNull();
    });

    it('moves a step at a time through the controls when one is given', async () => {
      const user = userEvent.setup();
      const onStepClick = vi.fn();
      atWidth(320, fourSteps({onStepClick}));

      await user.click(screen.getByRole('button', {name: 'Next step'}));
      expect(onStepClick).toHaveBeenCalledWith(2);

      await user.click(screen.getByRole('button', {name: 'Previous step'}));
      expect(onStepClick).toHaveBeenCalledWith(0);
    });

    it('skips disabled steps in either direction', async () => {
      const user = userEvent.setup();
      const onStepClick = vi.fn();
      const forward = atWidth(
        320,
        <Stepper activeStep={1} onStepClick={onStepClick}>
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" />
          <Step step={2} label="Delivery" isDisabled />
          <Step step={3} label="Payment" />
        </Stepper>,
      );

      await user.click(screen.getByRole('button', {name: 'Next step'}));
      expect(onStepClick).toHaveBeenLastCalledWith(3);
      forward.unmount();

      atWidth(
        320,
        <Stepper activeStep={2} onStepClick={onStepClick}>
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" isDisabled />
          <Step step={2} label="Delivery" />
          <Step step={3} label="Payment" />
        </Stepper>,
      );
      await user.click(screen.getByRole('button', {name: 'Previous step'}));
      expect(onStepClick).toHaveBeenLastCalledWith(0);
    });

    it('reads registration state again when a compact control activates', async () => {
      const user = userEvent.setup();
      const onStepClick = vi.fn();
      const disabled = {
        0: false,
        1: false,
        2: false,
        3: false,
      };

      function Registration({step}: {step: 0 | 1 | 2 | 3}) {
        const {registerStep} = useStepperContext();
        useLayoutEffect(
          () =>
            registerStep(step, {
              getIsDisabled: () => disabled[step],
            }),
          [registerStep, step],
        );
        return null;
      }

      atWidth(
        320,
        <Stepper activeStep={1} onStepClick={onStepClick}>
          <Registration step={0} />
          <Registration step={1} />
          <Registration step={2} />
          <Registration step={3} />
        </Stepper>,
      );

      // Step 2 was the target during render. Change only the registered source;
      // no parent render should be needed before activation skips it.
      disabled[2] = true;
      await user.click(screen.getByRole('button', {name: 'Next step'}));
      expect(onStepClick).toHaveBeenCalledWith(3);
    });

    it('reads the current disabled state from each registration', async () => {
      const user = userEvent.setup();
      const onStepClick = vi.fn();
      const steps = (isDeliveryDisabled: boolean) => (
        <Stepper activeStep={1} onStepClick={onStepClick}>
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" />
          <Step step={2} label="Delivery" isDisabled={isDeliveryDisabled} />
          <Step step={3} label="Payment" />
        </Stepper>
      );
      const {rerender} = atWidth(320, steps(true));

      await user.click(screen.getByRole('button', {name: 'Next step'}));
      expect(onStepClick).toHaveBeenLastCalledWith(3);

      rerender(steps(false));
      await user.click(screen.getByRole('button', {name: 'Next step'}));
      expect(onStepClick).toHaveBeenLastCalledWith(2);
    });

    it('disables a summary control with no enabled step in its direction', () => {
      atWidth(
        320,
        <Stepper activeStep={1} onStepClick={() => {}}>
          <Step step={0} label="Cart" />
          <Step step={1} label="Shipping" />
          <Step step={2} label="Delivery" isDisabled />
          <Step step={3} label="Payment" isDisabled />
        </Stepper>,
      );
      expect(screen.getByRole('button', {name: 'Next step'})).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it.each(['separated', 'on-track'] as const)(
      'keeps %s step content mounted across compact resizing',
      async indicatorPosition => {
        const originalWidth = Object.getOwnPropertyDescriptor(
          Element.prototype,
          'clientWidth',
        );
        let width = 600;
        let resize: ResizeObserverCallback = () => {};
        class ResizeObserverStub {
          constructor(callback: ResizeObserverCallback) {
            resize = callback;
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        }
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        Object.defineProperty(Element.prototype, 'clientWidth', {
          configurable: true,
          get(this: Element) {
            return this.classList.contains('astryx-stepper') ? width : 0;
          },
        });

        let view: ReturnType<typeof render> | null = null;
        try {
          view = render(
            <Stepper activeStep={0} indicatorPosition={indicatorPosition}>
              <Step step={0} label="Account">
                <input aria-label="Account name" defaultValue="" />
              </Step>
              <Step step={1} label="Review" />
            </Stepper>,
          );
          const user = userEvent.setup();
          const input = screen.getByRole<HTMLInputElement>('textbox', {
            name: 'Account name',
          });
          await user.type(input, 'Draft');
          const list = screen.getByRole('list');

          width = 120;
          act(() =>
            resize([{target: list} as unknown as ResizeObserverEntry], null!),
          );
          const compactInput = document.querySelector<HTMLInputElement>(
            'input[aria-label="Account name"]',
          );
          expect(compactInput).toBe(input);
          expect(compactInput).toHaveValue('Draft');
          expect(compactInput?.closest('[hidden]')).not.toBeNull();
          expect(document.querySelector(SUMMARY)).toBeInTheDocument();

          width = 600;
          act(() =>
            resize([{target: list} as unknown as ResizeObserverEntry], null!),
          );
          expect(
            document.querySelector('input[aria-label="Account name"]'),
          ).toBe(input);
          expect(input.closest('[hidden]')).toBeNull();
          expect(document.querySelector(SUMMARY)).toBeNull();
        } finally {
          view?.unmount();
          vi.unstubAllGlobals();
          if (originalWidth) {
            Object.defineProperty(
              Element.prototype,
              'clientWidth',
              originalWidth,
            );
          } else {
            delete (Element.prototype as {clientWidth?: number}).clientWidth;
          }
        }
      },
    );

    it('stops the controls at both ends of the sequence', () => {
      const onStepClick = vi.fn();
      // Disabled the Astryx way: aria-disabled, so the control keeps its place
      // in the tab order and can still explain itself at the end of a flow.
      const disabled = (name: string) =>
        screen.getByRole('button', {name}).getAttribute('aria-disabled');

      const {unmount} = atWidth(320, fourSteps({onStepClick, activeStep: 0}));
      expect(disabled('Previous step')).toBe('true');
      expect(disabled('Next step')).not.toBe('true');
      unmount();

      atWidth(320, fourSteps({onStepClick, activeStep: 3}));
      expect(disabled('Previous step')).not.toBe('true');
      expect(disabled('Next step')).toBe('true');
    });

    it('takes the collapsed steps out of the tab order', () => {
      // The label goes and the click target goes with it: a 4px bar is not
      // something to press, and a focus stop with nothing visible to show for
      // it is worse than no focus stop at all.
      atWidth(320, fourSteps({onStepClick: vi.fn()}));
      const stepButtons = screen
        .getAllByRole('button')
        .filter(b => (b.getAttribute('aria-label') ?? '').startsWith('Go to'));
      expect(stepButtons).toHaveLength(0);
    });

    it('keeps collapsed on-track nodes visible but non-interactive', () => {
      // The indicator stays on the rail as progress information, while the
      // summary controls below it own navigation in the compact presentation.
      atWidth(
        320,
        fourSteps({indicatorPosition: 'on-track', onStepClick: vi.fn()}),
      );
      const delivery = screen.getAllByRole('listitem')[2];
      expect(
        delivery.querySelector('.astryx-step-indicator'),
      ).toBeInTheDocument();
      const summary = document.querySelector<HTMLElement>(SUMMARY);
      expect(summary).not.toBeNull();
      expect(summary!.querySelector('.astryx-step-indicator')).toBeNull();
      expect(
        screen.queryByRole('button', {name: /^Go to step 3: Delivery/}),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', {name: 'Previous step'})).toBeEnabled();
      expect(screen.getByRole('button', {name: 'Next step'})).toBeEnabled();
    });

    it('drops the controls but keeps the name on request', () => {
      // The shape of a wizard whose footer already has Back and Continue: the
      // steps stay clickable at full width, and the phone gets one pair of
      // controls rather than two.
      atWidth(
        320,
        fourSteps({
          onStepClick: vi.fn(),
          horizontalOptions: {
            minimumStepWidth: 112,
            collapsedVariant: 'withLabel',
          },
        }),
      );
      expect(screen.queryByRole('button', {name: 'Next step'})).toBeNull();
      expect(screen.queryByRole('button', {name: 'Previous step'})).toBeNull();

      const summary = document.querySelector<HTMLElement>(SUMMARY);
      expect(summary).not.toBeNull();
      expect(within(summary!).getByText('Shipping')).toBeInTheDocument();
    });

    it('leaves a bare track when the label is hidden, even with a handler', () => {
      // The surrounding flow owns both its heading and navigation. Keeping an
      // onStepClick handler for the expanded layout must not add a compact row.
      atWidth(
        320,
        fourSteps({
          onStepClick: vi.fn(),
          horizontalOptions: {
            minimumStepWidth: 112,
            collapsedVariant: 'hiddenLabel',
          },
        }),
      );
      expect(document.querySelector(SUMMARY)).toBeNull();
      expect(screen.queryByRole('button', {name: 'Previous step'})).toBeNull();
      expect(screen.queryByRole('button', {name: 'Next step'})).toBeNull();
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });

    it('also leaves the bare track when there is no handler', () => {
      atWidth(
        320,
        fourSteps({
          horizontalOptions: {
            minimumStepWidth: 112,
            collapsedVariant: 'hiddenLabel',
          },
        }),
      );
      expect(document.querySelector(SUMMARY)).toBeNull();
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });

    it('keeps the sequence whole for a screen reader when the label is hidden', () => {
      // The visible row only repeats the list, so suppressing it cannot shorten
      // what a screen reader hears. Same expectation as the default collapse.
      atWidth(
        320,
        fourSteps({
          horizontalOptions: {
            minimumStepWidth: 112,
            collapsedVariant: 'hiddenLabel',
          },
        }),
      );
      const items = screen.getAllByRole('listitem');
      expect(items.map(li => li.textContent)).toEqual([
        'Cartcompleted',
        'Shipping',
        'Delivery',
        'Payment',
      ]);
      expect(items[1]).toHaveAttribute('aria-current', 'step');
    });

    it('leaves a stepper that has room for its labels alone', () => {
      // The variant is scoped to the collapse and does not strip desktop labels.
      atWidth(
        600,
        fourSteps({
          onStepClick: vi.fn(),
          horizontalOptions: {
            minimumStepWidth: 112,
            collapsedVariant: 'hiddenLabel',
          },
        }),
      );
      for (const name of ['Cart', 'Shipping', 'Delivery', 'Payment']) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
      expect(
        screen.getByRole('button', {name: /^Go to step 3: Delivery/}),
      ).toBeInTheDocument();
    });

    it('keeps on-track nodes presentational after controls are dropped', () => {
      // Compact navigation belongs to the summary controls in both layouts.
      // Turning those controls off leaves the rail as progress information,
      // rather than reviving a second, denser set of click targets.
      atWidth(
        320,
        fourSteps({
          indicatorPosition: 'on-track',
          onStepClick: vi.fn(),
          horizontalOptions: {
            minimumStepWidth: 112,
            collapsedVariant: 'withLabel',
          },
        }),
      );
      expect(screen.queryByRole('button', {name: 'Next step'})).toBeNull();
      expect(
        screen.queryByRole('button', {name: /^Go to step 3: Delivery/}),
      ).toBeNull();
      const indicators = screen
        .getAllByRole('listitem')
        .map(item => item.querySelector('.astryx-step-indicator'));
      expect(indicators).toHaveLength(4);
      expect(indicators.every(Boolean)).toBe(true);
    });
  });
  describe('--step-connector-gap', () => {
    // The on-track layouts draw the connector as one segment either side of
    // the indicator. A theme that wants the track to stop short of the node
    // sets one var; Astryx spends it on whichever side each segment faces the
    // node from, so the pair leaves a symmetric hole and the caller never
    // names the pieces.
    const onTrack = (orientation: 'vertical' | 'horizontal') => (
      <Stepper
        activeStep={1}
        orientation={orientation}
        indicatorPosition="on-track">
        <Step step={0} label="One" />
        <Step step={1} label="Two" />
      </Stepper>
    );

    /**
     * Every declaration the injected stylesheet carries for an element's own
     * atomic classes, `::before` rules included — the same route `fillEasings`
     * above takes, because StyleX puts static styles in the sheet rather than
     * inline and jsdom resolves no cascade of its own.
     *
     * Atomic class names are unique hashes, so the owning class is matched
     * anywhere in the selector rather than only at its head: a StyleX variant
     * such as the `dir="rtl"` mirror emits a compound selector the class does
     * not lead. Those rules are tagged `rtl:` so a test can tell the two
     * directions apart.
     */
    const declarationsFor = (el: Element) => {
      const classes = new Set(el.className.split(/\s+/));
      const out: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (!('selectorText' in rule)) {
            continue;
          }
          const {selectorText, style} = rule as CSSStyleRule;
          const owner = [...selectorText.matchAll(/\.([\w-]+)/g)].find(match =>
            classes.has(match[1]),
          );
          if (owner == null) {
            continue;
          }
          const prefix =
            (selectorText.includes('[dir="rtl"]') ? 'rtl:' : '') +
            (selectorText.endsWith('::before') ? 'before:' : '');
          for (const prop of Array.from(style)) {
            out.push(`${prefix}${prop}:${style.getPropertyValue(prop)}`);
          }
        }
      }
      return out.join(';');
    };

    it('clips the side each segment faces the node from', () => {
      const {container} = render(onTrack('vertical'));
      const [lead, rail] = [
        ...container.querySelectorAll('.astryx-step-connector'),
      ];
      // Above the node clips its bottom edge, below it clips its top —
      // mirrored, so the hole is centred on the indicator.
      expect(declarationsFor(lead)).toMatch(/clip-path:inset\(0 0 [^;]*\)/);
      expect(declarationsFor(rail)).toMatch(/clip-path:inset\([^0][^;]*0 0\)/);
    });

    it('uses the inline axis when the stepper is horizontal', () => {
      const {container} = render(onTrack('horizontal'));
      const [lead, rail] = [
        ...container.querySelectorAll('.astryx-step-connector'),
      ];
      expect(declarationsFor(lead)).toMatch(
        /clip-path:inset\(0 [^0][^;]*0 0\)/,
      );
      expect(declarationsFor(rail)).toMatch(
        /clip-path:inset\(0 0 0 [^0][^;]*\)/,
      );
    });

    it('clips the track and the fill with one declaration', () => {
      // The gap has to reach two layers: the track is the segment's own
      // background, the accent fill an absolutely placed ::before. Spending it
      // on each separately meant two declarations on two boxes, so a
      // percentage resolved against a different containing block for each and
      // stopped them ~1.2px apart. One clip on the segment covers both.
      const {container} = render(onTrack('vertical'));
      const lead = container.querySelector(
        '.astryx-step-connector',
      ) as HTMLElement;
      const declarations = declarationsFor(lead);
      expect(declarations).toContain('clip-path');
      // No per-layer copy of the gap to disagree with.
      expect(declarations).not.toMatch(
        /before:[a-z-]*padding[^;]*connector-gap/,
      );
      expect(declarations).not.toMatch(/before:inset[^;]*connector-gap/);
    });

    it('clamps a negative gap away and caps an oversized one', () => {
      // A theme value arrives with nothing in between to reject it, and
      // `inset()` is not padding: Chromium ACCEPTS `inset(0 0 -4px 0)` rather
      // than clamping it, so the floor has to be written. The cap is the
      // flexible segment's own `min-height`, bounding an oversized gap to a
      // short track. Neither can grow the Stepper — a clip cannot change
      // layout.
      const {container} = render(onTrack('vertical'));
      const lead = container.querySelector(
        '.astryx-step-connector',
      ) as HTMLElement;
      const declarations = declarationsFor(lead);
      expect(declarations).toContain('max(0px');
      expect(declarations).toContain('min(var(--step-connector-gap');
    });

    it('flips the horizontal clip under dir="rtl"', () => {
      // `clip-path: inset()` is physical (top/right/bottom/left) and has no
      // logical form, but the row reverses under `dir="rtl"`. Unflipped, the
      // leading segment sits to the RIGHT of the node in RTL and still clips
      // its right edge, opening the hole at the join between steps instead of
      // at the indicator.
      const {container} = render(onTrack('horizontal'));
      const [lead, rail] = [
        ...container.querySelectorAll('.astryx-step-connector'),
      ];
      // Each segment carries BOTH the LTR clip and its mirrored RTL variant.
      const leadRules = declarationsFor(lead);
      const railRules = declarationsFor(rail);
      expect(leadRules).toMatch(/rtl:clip-path:inset\(0 0 0 [^0]/);
      expect(railRules).toMatch(/rtl:clip-path:inset\(0 [^0][^;]*0 0\)/);
    });

    it('leaves the track unbroken when there is no indicator to avoid', () => {
      // `indicator="none"` renders no node, so a gap is a hole in a track that
      // is meant to be continuous.
      const {container} = render(
        <Stepper activeStep={0} indicatorPosition="on-track">
          <Step step={0} label="One" indicator="none" />
          <Step step={1} label="Two" indicator="none" />
        </Stepper>,
      );
      const connectors = [
        ...container.querySelectorAll('.astryx-step-connector'),
      ];
      expect(connectors.length).toBeGreaterThan(0);
      for (const node of connectors) {
        expect(declarationsFor(node)).not.toContain('--step-connector-gap');
      }
    });

    it('defaults to no connector gap at the point of use', () => {
      const {container} = render(onTrack('vertical'));
      const root = container.querySelector('.astryx-stepper') as HTMLElement;
      const lead = container.querySelector(
        '.astryx-step-connector',
      ) as HTMLElement;

      expect(declarationsFor(root)).toContain('--step-connector-gap:inherit');
      expect(declarationsFor(lead)).toContain('var(--step-connector-gap,0px)');
    });

    it('inherits a horizontal frame override through the root', () => {
      // Horizontal layout props belong to the frame. The list must leave the
      // public variable inheriting so that value reaches its connectors; the
      // use-site fallback above supplies 0px when no ancestor sets a value.
      const {container} = render(
        <Stepper
          activeStep={1}
          orientation="horizontal"
          indicatorPosition="on-track"
          style={{'--step-connector-gap': '6px'} as React.CSSProperties}>
          <Step step={0} label="One" />
          <Step step={1} label="Two" />
        </Stepper>,
      );
      const root = container.querySelector('.astryx-stepper') as HTMLElement;
      const frame = container.querySelector(
        '.astryx-stepper-frame',
      ) as HTMLElement;
      expect(frame.style.getPropertyValue('--step-connector-gap')).toBe('6px');
      expect(declarationsFor(frame)).toContain('--step-connector-gap:0px');
      expect(root.style.getPropertyValue('--step-connector-gap')).toBe('');
      expect(declarationsFor(root)).toContain('--step-connector-gap:inherit');
    });

    it('emits a root-owned override through the theme build path', () => {
      const theme = defineTheme({
        name: 'stepper-connector-gap-test',
        components: {
          stepper: {
            base: {'--step-connector-gap': '6px'},
          },
        },
      });
      const {component} = generateThemeCSS(theme);

      expect(component).toMatch(
        /\.astryx-stepper\s*\{[^}]*--step-connector-gap:\s*6px;/,
      );
      expect(component).not.toMatch(
        /\.astryx-step-connector\s*\{[^}]*--step-connector-gap:/,
      );
    });

    it('stops an outer gap at a layer opened from a step', async () => {
      // An outer Stepper's gap is scoped to its own track. A layer opened from
      // one of its steps is new content, so an inner Stepper there starts from
      // the connector's own 0px fallback (AST-038 FR7) instead of inheriting
      // the outer value through the DOM.
      function StepLayer() {
        const layer = useLayer({mode: 'context'});
        return (
          <>
            <button type="button" ref={layer.ref} onClick={layer.show}>
              Details
            </button>
            {layer.render(
              <Stepper activeStep={0} indicatorPosition="on-track">
                <Step step={0} label="Inner one" />
                <Step step={1} label="Inner two" />
              </Stepper>,
            )}
          </>
        );
      }
      const user = userEvent.setup();
      const {container} = render(
        <div style={{'--step-connector-gap': '6px'} as React.CSSProperties}>
          <Stepper activeStep={0} indicatorPosition="on-track">
            <Step step={0} label="Outer one">
              <StepLayer />
            </Step>
            <Step step={1} label="Outer two" />
          </Stepper>
        </div>,
      );
      await user.click(screen.getByRole('button', {name: 'Details'}));

      const layerRoot = container.querySelector('[popover]') as HTMLElement;
      expect(layerRoot).not.toBeNull();
      expect(declarationsFor(layerRoot)).toContain(
        '--step-connector-gap:initial',
      );

      // Ancestor inheritance still works outside the layer, and the inner
      // Stepper keeps the same inheriting root, so a value set on it or through
      // the `stepper` target still reaches its connectors.
      const [outerRoot, innerRoot] = [
        ...container.querySelectorAll<HTMLElement>('.astryx-stepper'),
      ];
      expect(layerRoot.contains(outerRoot)).toBe(false);
      expect(layerRoot.contains(innerRoot)).toBe(true);
      expect(declarationsFor(innerRoot)).toContain(
        '--step-connector-gap:inherit',
      );
    });

    it('leaves the connector target itself free of a segment vocabulary', () => {
      // The pieces are an implementation of the on-track layout, not API: no
      // `data-segment`, and no bare `lead`/`rail`/`content` class that could
      // collide with a consumer's own stylesheet.
      const {container} = render(onTrack('vertical'));
      const connectors = [
        ...container.querySelectorAll('.astryx-step-connector'),
      ];
      expect(connectors.length).toBeGreaterThan(0);
      for (const node of connectors) {
        expect(node.getAttribute('data-segment')).toBeNull();
        for (const cls of ['lead', 'rail', 'content']) {
          expect(node.classList.contains(cls)).toBe(false);
        }
      }
    });
  });
});

describe('step-label and step-description theme targets', () => {
  // A step's two text parts each declare their own typography, so a theme
  // cannot reach them by styling the step and letting the cascade do the rest
  // — an inherited value never beats a value the element declares itself.
  // These targets are the seam; the assertions below pin what a theme selects
  // and, in the last case, why the cheaper route does not work.

  const withText = (props = {}) => (
    <Stepper activeStep={1}>
      <Step step={0} label="Account" description="Your email" {...props} />
      <Step step={1} label="Payment" description="Card details" />
      <Step step={2} label="Review" description="Check and submit" />
    </Stepper>
  );

  it('puts the target on the element that paints the text', () => {
    const {container} = render(withText());
    const label = container.querySelector('.astryx-step-label') as HTMLElement;
    const description = container.querySelector(
      '.astryx-step-description',
    ) as HTMLElement;
    // The text is the element's own content, not a descendant's: the target
    // sits where the paint is rather than on a wrapper around it.
    expect(label.textContent).toBe('Account');
    expect(description.textContent).toBe('Your email');
  });

  it('reflects progress and status, the vocabulary step-indicator uses', () => {
    // Same shape as the sibling target in this file, so a theme states a
    // step's phase identically wherever it reaches in. Without it a theme
    // could not say "the label of a completed step": the compiler emits a
    // compound selector on one element, never a descendant of `.astryx-step`.
    const {container} = render(
      <Stepper activeStep={1}>
        <Step step={0} label="Done" description="d" />
        <Step step={1} label="Now" description="d" />
        <Step step={2} label="Later" description="d" status="error" />
      </Stepper>,
    );
    const labels = [
      ...container.querySelectorAll<HTMLElement>('.astryx-step-label'),
    ];
    expect(labels.map(el => el.dataset.progress)).toEqual([
      'completed',
      'in-progress',
      'not-started',
    ]);
    expect(labels[2].dataset.status).toBe('error');

    const descriptions = [
      ...container.querySelectorAll<HTMLElement>('.astryx-step-description'),
    ];
    expect(descriptions.map(el => el.dataset.progress)).toEqual([
      'completed',
      'in-progress',
      'not-started',
    ]);
    expect(descriptions[2].dataset.status).toBe('error');
  });

  it('reflects disabled on the label target and emits its theme selector', () => {
    // The label owns disabled paint (`styles.labelDisabled`); the description
    // does not. The selector follows that ownership instead of being copied to
    // every text target for vocabulary symmetry.
    const {container} = render(
      <Stepper activeStep={0}>
        <Step
          step={0}
          label="Unavailable"
          description="Try again later"
          isDisabled
        />
      </Stepper>,
    );
    const label = container.querySelector('.astryx-step-label');
    const description = container.querySelector('.astryx-step-description');
    expect(label).toHaveAttribute('data-disabled', 'disabled');
    expect(label).toHaveAttribute('data-disabled', 'disabled');
    expect(description).not.toHaveAttribute('data-disabled');
    expect(description).not.toHaveAttribute('data-disabled');

    // A DOM attribute alone would not prove the public defineTheme path accepts
    // and emits the state. Hold both halves of the contract.
    const theme = defineTheme({
      name: 'step-label-disabled-state-test',
      components: {
        'step-label': {
          'disabled:disabled': {opacity: '0.4'},
        },
      },
    });
    const {component: css} = generateThemeCSS(theme);
    expect(css).toContain('.astryx-step-label[data-disabled="disabled"]');
    expect(css).toContain('opacity: 0.4');
  });

  it('carries them on the on-track layout too', () => {
    // The indicator-on-the-connector layout renders its own label and
    // description nodes; a target that only covered the default layout would
    // leave a theme reaching for structural selectors in exactly one mode.
    const {container} = render(
      <Stepper activeStep={0} indicatorPosition="on-track">
        <Step step={0} label="Account" description="Your email" />
        <Step step={1} label="Payment" description="Card details" />
      </Stepper>,
    );
    expect(container.querySelectorAll('.astryx-step-label')).toHaveLength(2);
    expect(container.querySelectorAll('.astryx-step-description')).toHaveLength(
      2,
    );
  });
});

describe('clickable step text reading', () => {
  // axe-core's Label in Name rule joins a button's text nodes with nothing
  // between them, aria-hidden ones included, so a number badge next to a label
  // reads as one word ("1Account") that the step's name does not contain.
  // Whitespace between them changes nothing on screen (the rows are flex
  // containers) and keeps the two words apart.
  it.each([
    ['vertical', 'separated'],
    ['horizontal', 'separated'],
    ['vertical', 'on-track'],
    ['horizontal', 'on-track'],
  ] as const)(
    'keeps the number and label apart in a %s %s step',
    (orientation, indicatorPosition) => {
      render(
        <Stepper
          orientation={orientation}
          indicatorPosition={indicatorPosition}
          activeStep={0}
          label="Steps"
          onStepClick={() => {}}>
          <Step step={0} label="Account" indicator="number" />
          <Step step={1} label="Payment" indicator="number" />
        </Stepper>,
      );

      const button = screen.getByRole('button', {name: /Account/});
      expect(button.textContent).toMatch(/1\s+Account/);
      expect(button.textContent).not.toMatch(/1Account/);
    },
  );
});

// jsdom cannot emulate forced colors, so this asserts the compiled rule the
// number badge fill relies on (architecture:theme-tokens INV11).
describe('Step number badge forced colors', () => {
  it('keeps a visible boundary on the badge fill', () => {
    render(
      <Stepper activeStep={0}>
        <Step step={0} label="First" indicator="number" />
        <Step step={1} label="Second" indicator="number" />
      </Stepper>,
    );
    const css = getForcedColorsRules();
    expect(css).toContain('outline-style: solid;');
    expect(css).toContain('outline-color: canvastext;');
  });
});
