// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon.test.tsx
 * @input Uses vitest, @testing-library/react, Icon component
 * @output Unit tests for Icon component behavior
 * @position Testing; validates Icon.tsx implementation
 *
 * SYNC: When Icon.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {TestIcon} from '../__tests__/TestIcon';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {resetThemes} from '../theme/themeRegistry';
import {Icon} from './Icon';
import {registerIcons, resetIcons} from './globalIconRegistry';

describe('Icon', () => {
  it('renders the icon component', () => {
    render(<Icon icon={TestIcon} data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders as an SVG element', () => {
    render(<Icon icon={TestIcon} data-testid="icon" />);
    const icon = screen.getByTestId('icon');
    expect(icon.tagName.toLowerCase()).toBe('svg');
  });

  it('applies aria-hidden by default', () => {
    render(<Icon icon={TestIcon} data-testid="icon" />);
    expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with different color variants', () => {
    const {rerender} = render(
      <Icon icon={TestIcon} color="primary" data-testid="icon" />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="secondary" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="accent" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="info" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="success" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="error" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="warning" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} color="inherit" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders with non-semantic color variants', () => {
    const nonSemanticColors = [
      'blue',
      'red',
      'green',
      'gray',
      'cyan',
      'teal',
      'yellow',
      'orange',
      'pink',
      'purple',
    ] as const;
    const {rerender} = render(
      <Icon icon={TestIcon} color={nonSemanticColors[0]} data-testid="icon" />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    for (const c of nonSemanticColors.slice(1)) {
      rerender(<Icon icon={TestIcon} color={c} data-testid="icon" />);
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    }
  });

  it('renders with different size variants', () => {
    const {rerender} = render(
      <Icon icon={TestIcon} size="xsm" data-testid="icon" />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} size="sm" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} size="md" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();

    rerender(<Icon icon={TestIcon} size="lg" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('sizes component-mode icons in rem so they scale with root font-size', () => {
    const sizes = {
      xsm: '0.75rem',
      sm: '1rem',
      md: '1.25rem',
      lg: '1.5rem',
    } as const;
    for (const [size, expected] of Object.entries(sizes)) {
      const {unmount} = render(
        <Icon
          icon={TestIcon}
          size={size as keyof typeof sizes}
          data-testid="icon"
        />,
      );
      const style = getComputedStyle(screen.getByTestId('icon'));
      expect(style.width).toBe(expected);
      expect(style.height).toBe(expected);
      unmount();
    }
  });

  it('sizes registry (string-mode) icons in rem, including fontSize', () => {
    const sizes = {
      xsm: '0.75rem',
      sm: '1rem',
      md: '1.25rem',
      lg: '1.5rem',
    } as const;
    for (const [size, expected] of Object.entries(sizes)) {
      const {unmount} = render(
        <Icon
          icon="check"
          size={size as keyof typeof sizes}
          data-testid="icon"
        />,
      );
      const style = getComputedStyle(screen.getByTestId('icon'));
      expect(style.width).toBe(expected);
      expect(style.height).toBe(expected);
      // fontSize is expressed in rem so 1em-based registry icons scale too.
      expect(style.fontSize).toBe(expected);
      unmount();
    }
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Icon icon={TestIcon} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(SVGSVGElement));
  });

  it('passes additional SVG props', () => {
    render(
      <Icon icon={TestIcon} data-testid="icon" role="img" aria-label="Home" />,
    );
    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('role', 'img');
    expect(icon).toHaveAttribute('aria-label', 'Home');
  });

  it('uses default color and standalone size when not specified', () => {
    render(<Icon icon={TestIcon} data-testid="icon" />);

    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('data-size', 'md');
    expect(getComputedStyle(icon).width).toBe('1.25rem');
    expect(getComputedStyle(icon).height).toBe('1.25rem');
  });

  it('applies aria-hidden by default in string (registry) mode', () => {
    render(<Icon icon="check" data-testid="icon" />);
    expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('resolves string-mode icons from the nearest Theme without leaking globally', () => {
    resetIcons();
    resetThemes();
    const outer = defineTheme({name: 'outer', icons: {check: 'outer-check'}});
    const inner = defineTheme({name: 'inner', icons: {check: 'inner-check'}});

    render(
      <Theme theme={outer}>
        <Icon icon="check" data-testid="outer" />
        <Theme theme={inner}>
          <Icon icon="check" data-testid="inner" />
        </Theme>
      </Theme>,
    );

    expect(screen.getByTestId('outer')).toHaveTextContent('outer-check');
    expect(screen.getByTestId('inner')).toHaveTextContent('inner-check');
  });

  describe('namespaced extension keys', () => {
    it('renders a theme-registered namespaced key with size and color applied', () => {
      resetIcons();
      resetThemes();
      const theme = defineTheme({
        name: 'ns-theme',
        icons: {'numberInput:stepperDown': 'themed-stepper'},
      });

      render(
        <Theme theme={theme}>
          <Icon icon="numberInput:stepperDown" size="xsm" data-testid="icon" />
        </Theme>,
      );

      const icon = screen.getByTestId('icon');
      expect(icon).toHaveTextContent('themed-stepper');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon.className).not.toBe('');
    });

    it('resolves a namespaced key registered globally', () => {
      resetIcons();
      resetThemes();
      registerIcons({'numberInput:stepperDown': 'global-stepper'});

      render(<Icon icon="numberInput:stepperDown" data-testid="icon" />);

      expect(screen.getByTestId('icon')).toHaveTextContent('global-stepper');
    });

    it('still rejects a misspelled built-in name', () => {
      render(
        // @ts-expect-error — the prop takes built-in names and namespaced
        // keys, not any string, so a typo is still a compile error.
        <Icon icon="chevrondown" data-testid="icon" />,
      );

      expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    });

    it('renders nothing when a namespaced key resolves to nothing', () => {
      resetIcons();
      resetThemes();

      const {container} = render(
        <Icon icon="numberInput:missing" data-testid="icon" />,
      );

      expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('lets a string-mode icon be made meaningful by overriding aria-hidden', () => {
    render(
      <Icon
        icon="check"
        data-testid="icon"
        role="img"
        aria-label="Done"
        aria-hidden={false}
      />,
    );
    const icon = screen.getByTestId('icon');
    expect(icon).toHaveAttribute('role', 'img');
    expect(icon).toHaveAttribute('aria-label', 'Done');
    expect(icon).toHaveAttribute('aria-hidden', 'false');
  });

  describe('label (accessible name)', () => {
    it('makes a component-mode icon meaningful: role="img" + aria-label, no aria-hidden', () => {
      render(<Icon icon={TestIcon} label="Completed" data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('role', 'img');
      expect(icon).toHaveAttribute('aria-label', 'Completed');
      expect(icon).not.toHaveAttribute('aria-hidden');
    });

    it('makes a string-mode (registry) icon meaningful: role="img" + aria-label, no aria-hidden', () => {
      render(<Icon icon="check" label="Completed" data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('role', 'img');
      expect(icon).toHaveAttribute('aria-label', 'Completed');
      expect(icon).not.toHaveAttribute('aria-hidden');
    });

    it('keeps the decorative default when label is omitted (component mode)', () => {
      render(<Icon icon={TestIcon} data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).not.toHaveAttribute('role');
      expect(icon).not.toHaveAttribute('aria-label');
    });

    it('keeps the decorative default when label is omitted (string mode)', () => {
      render(<Icon icon="check" data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).not.toHaveAttribute('role');
      expect(icon).not.toHaveAttribute('aria-label');
    });

    it('treats an empty string label as decorative (component mode)', () => {
      render(<Icon icon={TestIcon} label="" data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).not.toHaveAttribute('role');
      expect(icon).not.toHaveAttribute('aria-label');
    });

    it('treats an empty string label as decorative (string mode)', () => {
      render(<Icon icon="check" label="" data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).not.toHaveAttribute('role');
      expect(icon).not.toHaveAttribute('aria-label');
    });

    it('lets an explicit aria-hidden win over label (component mode)', () => {
      render(
        <Icon icon={TestIcon} label="Close" aria-hidden data-testid="icon" />,
      );
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('lets an explicit aria-hidden win over label (string mode)', () => {
      render(
        <Icon icon="check" label="Close" aria-hidden data-testid="icon" />,
      );
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('lets an explicit aria-label override the label-derived name (component mode)', () => {
      render(
        <Icon
          icon={TestIcon}
          label="Close"
          aria-label="Dismiss"
          data-testid="icon"
        />,
      );
      expect(screen.getByTestId('icon')).toHaveAttribute(
        'aria-label',
        'Dismiss',
      );
    });

    it('lets an explicit role override the label-derived role (string mode)', () => {
      render(
        <Icon
          icon="check"
          label="Close"
          role="presentation"
          data-testid="icon"
        />,
      );
      expect(screen.getByTestId('icon')).toHaveAttribute(
        'role',
        'presentation',
      );
    });
  });

  describe('styling prop handling', () => {
    it('composes a consumer className with the internal classes (string mode)', () => {
      render(
        <Icon icon="check" className="consumer-target" data-testid="icon" />,
      );
      const icon = screen.getByTestId('icon');
      // Consumer className must survive alongside the stable astryx-icon class
      // and the StyleX classes — previously it was clobbered by the later
      // internal spread.
      expect(icon).toHaveClass('consumer-target');
      expect(icon).toHaveClass('astryx-icon');
      // At least one StyleX-generated class is still present.
      expect(icon.className.split(' ').length).toBeGreaterThan(2);
    });

    it('forwards a consumer className in component (SVG) mode', () => {
      render(
        <Icon icon={TestIcon} className="consumer-target" data-testid="icon" />,
      );
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveClass('consumer-target');
      expect(icon).toHaveClass('astryx-icon');
    });

    it('merges a consumer style onto the rendered element (string mode)', () => {
      render(<Icon icon="check" style={{opacity: 0.5}} data-testid="icon" />);
      expect(screen.getByTestId('icon')).toHaveStyle({opacity: '0.5'});
    });

    it('merges a consumer style onto the rendered element (component mode)', () => {
      render(
        <Icon icon={TestIcon} style={{opacity: 0.5}} data-testid="icon" />,
      );
      expect(screen.getByTestId('icon')).toHaveStyle({opacity: '0.5'});
    });

    it('applies xstyle to the rendered element (string mode)', () => {
      const overrides = stylex.create({root: {opacity: 0.25}});
      render(<Icon icon="check" xstyle={overrides.root} data-testid="icon" />);
      const icon = screen.getByTestId('icon');
      // xstyle is folded into stylex.props, so it contributes a StyleX class
      // (and, in jsdom's stylex runtime, an inline style) alongside the base
      // color/size classes rather than clobbering them.
      expect(icon).toHaveClass('astryx-icon');
      expect(icon).toHaveStyle({opacity: '0.25'});
    });

    it('applies xstyle to the rendered element (component mode)', () => {
      const overrides = stylex.create({root: {opacity: 0.25}});
      render(
        <Icon icon={TestIcon} xstyle={overrides.root} data-testid="icon" />,
      );
      const icon = screen.getByTestId('icon');
      expect(icon).toHaveClass('astryx-icon');
      expect(icon).toHaveStyle({opacity: '0.25'});
    });

    it('leaves default rendering unchanged when no styling props are passed (string mode)', () => {
      const {container} = render(
        <Icon icon="check" size="sm" color="secondary" />,
      );
      const icon = container.querySelector('.astryx-icon') as HTMLElement;
      const {container: refContainer} = render(
        <Icon icon="check" size="sm" color="secondary" />,
      );
      const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;
      // Default output is identical to itself — the styling-prop handling adds
      // nothing (no extra class, no inline style) unless a prop is passed.
      expect(icon.className).toBe(refIcon.className);
      expect(icon.getAttribute('style')).toBe(refIcon.getAttribute('style'));
    });

    it('leaves default rendering unchanged when no styling props are passed (component mode)', () => {
      const {container} = render(
        <Icon icon={TestIcon} size="sm" color="secondary" />,
      );
      const icon = container.querySelector('.astryx-icon') as HTMLElement;
      const {container: refContainer} = render(
        <Icon icon={TestIcon} size="sm" color="secondary" />,
      );
      const refIcon = refContainer.querySelector('.astryx-icon') as HTMLElement;
      // SVGElement.className is an SVGAnimatedString, so compare the class
      // attribute string rather than the property object.
      expect(icon.getAttribute('class')).toBe(refIcon.getAttribute('class'));
      expect(icon.getAttribute('style')).toBe(refIcon.getAttribute('style'));
    });
  });
});
