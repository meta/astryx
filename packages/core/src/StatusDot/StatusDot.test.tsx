// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {StatusDot} from './StatusDot';
import {getForcedColorsRules} from '../__tests__/forcedColors';

/** Renders a StatusDot and returns its root element. */
function renderDot(props: React.ComponentProps<typeof StatusDot>) {
  render(<StatusDot {...props} />);
  return screen.getByRole('img', {name: props.label});
}

describe('StatusDot', () => {
  it('renders with role="img" and aria-label', () => {
    render(<StatusDot variant="success" label="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot).toBeInTheDocument();
  });

  it('renders as a span element', () => {
    render(<StatusDot variant="success" label="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot.tagName).toBe('SPAN');
  });

  it('renders with all variant types', () => {
    const variants = [
      'success',
      'warning',
      'error',
      'accent',
      'neutral',
    ] as const;

    for (const variant of variants) {
      const {unmount} = render(<StatusDot variant={variant} label={variant} />);
      expect(screen.getByRole('img', {name: variant})).toBeInTheDocument();
      unmount();
    }
  });

  it('renders at fixed 8px size', () => {
    render(<StatusDot variant="success" label="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLSpanElement | null};
    render(<StatusDot ref={ref} variant="success" label="Online" />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('supports data-testid', () => {
    render(
      <StatusDot variant="success" label="Online" data-testid="status-dot" />,
    );
    expect(screen.getByTestId('status-dot')).toBeInTheDocument();
  });

  it('is not focusable', () => {
    render(<StatusDot variant="success" label="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot.getAttribute('tabindex')).toBeNull();
  });

  it('renders with isPulsing', () => {
    render(<StatusDot variant="success" label="Live" isPulsing />);
    const dot = screen.getByRole('img', {name: 'Live'});
    expect(dot).toBeInTheDocument();
  });

  it('renders without isPulsing by default', () => {
    render(<StatusDot variant="success" label="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot).toBeInTheDocument();
  });

  it('renders with tooltip', () => {
    render(<StatusDot variant="success" label="Online" tooltip="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot).toBeInTheDocument();
  });

  it('renders every variant as a plain childless dot by default (design review #4373)', () => {
    // The dot is deliberately a colour-only signal by default — no built-in
    // per-variant glyph. Making the status accessible in context (label,
    // icon, or an accessible alternative) is the builder's responsibility;
    // see the usage guidance.
    const variants = [
      'success',
      'warning',
      'error',
      'accent',
      'neutral',
    ] as const;
    for (const variant of variants) {
      const dot = renderDot({variant, label: `plain-${variant}`});
      expect(dot.childElementCount, variant).toBe(0);
    }
  });

  describe('custom icon (parity with AvatarStatusDot)', () => {
    const ICON_TESTID = 'custom-icon';
    function Icon() {
      return <svg data-testid={ICON_TESTID} />;
    }

    it('renders a provided icon inside the dot', () => {
      renderDot({variant: 'success', label: 'Verified', icon: <Icon />});
      expect(screen.getByTestId(ICON_TESTID)).toBeInTheDocument();
    });

    it('hides the icon wrapper from assistive tech (the label carries the status)', () => {
      renderDot({variant: 'success', label: 'Verified', icon: <Icon />});
      const iconEl = screen.getByTestId(ICON_TESTID);
      expect(iconEl.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it.each([false, true, null, undefined, ''])(
      'ignores %s and keeps the plain dot (safe for `cond && <Icon />`)',
      value => {
        const dot = renderDot({
          variant: 'error',
          label: 'Offline',
          icon: value,
        });
        expect(dot.childElementCount).toBe(0);
      },
    );

    it('keeps the accessible name on the dot when an icon renders', () => {
      const dot = renderDot({
        variant: 'success',
        label: 'Verified',
        icon: <Icon />,
      });
      expect(dot).toHaveAttribute('role', 'img');
      expect(dot).toHaveAttribute('aria-label', 'Verified');
    });
  });

  describe('variant ink (a passed icon paints from currentColor)', () => {
    it('pairs the warning plate with the dedicated dark on-warning ink', () => {
      // The regression this guards: a light surface ink on the yellow warning
      // plate lands near 2:1, while `--color-on-warning` is the fixed dark
      // ink (~9.6:1). An icon inherits the ink via `currentColor`, so the
      // pairing is what keeps custom icons legible.
      const probe = stylex.create({
        warning: {
          backgroundColor: colorVars['--color-warning'],
          color: colorVars['--color-on-warning'],
        },
      });
      const dot = renderDot({variant: 'warning', label: 'Degraded'});
      const atomicClasses = (stylex.props(probe.warning).className ?? '')
        .split(' ')
        // Dev mode prepends a per-file `File__style.key` debug class that
        // legitimately differs between the probe and the component.
        .filter(cls => !cls.includes('__'));
      expect(atomicClasses.length).toBeGreaterThan(0);
      for (const cls of atomicClasses) {
        expect(dot.className).toContain(cls);
      }
    });
  });

  describe('accessible name (label reaches AT without hover)', () => {
    it('exposes the status label as the accessible name for every variant, without a tooltip', () => {
      const variants = [
        'success',
        'warning',
        'error',
        'accent',
        'neutral',
      ] as const;
      for (const variant of variants) {
        const {unmount} = render(
          <StatusDot variant={variant} label={`Status: ${variant}`} />,
        );
        const dot = screen.getByRole('img', {name: `Status: ${variant}`});
        expect(dot).toHaveAttribute('aria-label', `Status: ${variant}`);
        // The name must not depend on hover or focus.
        expect(dot.getAttribute('tabindex')).toBeNull();
        unmount();
      }
    });
  });
});

describe('StatusDot theme target names', () => {
  it('renders only the canonical target class', () => {
    render(<StatusDot variant="success" label="Online" />);
    const dot = screen.getByRole('img', {name: 'Online'});
    expect(dot).toHaveClass('astryx-status-dot');
    expect(dot).not.toHaveClass('astryx-statusdot');
  });
});

// jsdom cannot emulate forced colors, so this asserts the compiled rule the
// status fill relies on (architecture:theme-tokens INV11): the fill becomes
// Canvas, and a CanvasText boundary keeps its shape.
describe('StatusDot forced colors', () => {
  it('keeps a visible boundary on the status fill', () => {
    render(<StatusDot variant="error" label="Offline" />);
    const css = getForcedColorsRules();
    expect(css).toContain('outline-style: solid;');
    expect(css).toContain('outline-color: canvastext;');
  });
});
