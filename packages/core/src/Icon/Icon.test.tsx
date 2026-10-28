// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon.test.tsx
 * @input Uses vitest, @testing-library/react, Icon component
 * @output Unit tests for Icon component behavior, including theme size
 *   dimensions
 * @position Testing; validates Icon.tsx implementation
 *
 * SYNC: When Icon.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {TestIcon} from '../__tests__/TestIcon';
import {unthemedLength} from '../__tests__/unthemedLength';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {resetThemes} from '../theme/themeRegistry';
import {Icon} from './Icon';
import {IconDefaultSizeProvider} from './IconDefaultSizeContext';
import {
  registerIcons,
  resetIcons,
  type IconRequest,
} from './globalIconRegistry';

// The variant names these tests request (spec:AST-087 FR3: an application
// augments the public map).
declare module './index' {
  interface IconVariantMap {
    outline: true;
    filled: true;
  }
}

/** The custom properties a declaration value reads, in order. */
function varsRead(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]);
}

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
      expect(unthemedLength(style.width)).toBe(expected);
      expect(unthemedLength(style.height)).toBe(expected);
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
      expect(unthemedLength(style.width)).toBe(expected);
      expect(unthemedLength(style.height)).toBe(expected);
      // fontSize is expressed in rem so 1em-based registry icons scale too.
      expect(unthemedLength(style.fontSize)).toBe(expected);
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
    expect(unthemedLength(getComputedStyle(icon).width)).toBe('1.25rem');
    expect(unthemedLength(getComputedStyle(icon).height)).toBe('1.25rem');
  });

  describe('theme size dimensions', () => {
    // spec:AST-087 FR10, component:Icon FR7: width and height on an `icon`
    // size selector set that size's glyph dimension in both source modes,
    // and a size the theme leaves alone keeps its own. jsdom resolves neither
    // `var()` nor the theme's scoped layer, so this checks the two halves that
    // meet in the browser: the rule the provider mounts writes the dimension
    // into exactly the vars the glyph's own size styles read.
    const sizes = {
      xsm: '0.75rem',
      sm: '1rem',
      md: '1.25rem',
      lg: '1.5rem',
    } as const;
    type Size = keyof typeof sizes;

    /** The declarations of the mounted theme rule for one Icon size. */
    function mountedSizeRule(
      themeName: string,
      size: Size,
    ): Record<string, string> | null {
      const css =
        document.querySelector<HTMLStyleElement>(
          `style[data-astryx-theme="${themeName}"]`,
        )?.textContent ?? '';
      const selector = `.astryx-icon[data-size="${size}"] {`;
      const start = css.indexOf(selector);
      if (start === -1) {
        return null;
      }
      const body = css.slice(start + selector.length, css.indexOf('}', start));
      return Object.fromEntries(
        body
          .split(';')
          .map(declaration => declaration.split(':').map(part => part.trim()))
          .filter(([property]) => property),
      );
    }

    it.each(Object.keys(sizes) as Size[])(
      'a %s rule sets that glyph in both modes and leaves the other sizes alone',
      styled => {
        resetIcons();
        resetThemes();
        const themeName = `icon-size-${styled}`;
        render(
          <Theme
            theme={defineTheme({
              name: themeName,
              components: {
                icon: {[`size:${styled}`]: {width: '18px', height: '22px'}},
              },
            })}>
            {(Object.keys(sizes) as Size[]).map(size => (
              <span key={size}>
                <Icon
                  icon={TestIcon}
                  size={size}
                  data-testid={`direct-${size}`}
                />
                <Icon
                  icon="check"
                  size={size}
                  data-testid={`registry-${size}`}
                />
              </span>
            ))}
          </Theme>,
        );

        const mounted = mountedSizeRule(themeName, styled);
        expect(mounted).not.toBeNull();
        const declared = mounted ?? {};
        // Raw width/height would lose to an unlayered StyleX build, so the
        // rule carries the dimension only through the glyph's vars.
        expect(Object.keys(declared)).not.toContain('width');
        expect(Object.keys(declared)).not.toContain('height');

        for (const size of Object.keys(sizes) as Size[]) {
          for (const mode of ['direct', 'registry']) {
            const style = getComputedStyle(
              screen.getByTestId(`${mode}-${size}`),
            );
            if (size !== styled) {
              expect(mountedSizeRule(themeName, size)).toBeNull();
              expect(unthemedLength(style.width)).toBe(sizes[size]);
              expect(unthemedLength(style.height)).toBe(sizes[size]);
              continue;
            }
            const [widthVar] = varsRead(style.width);
            const [heightVar] = varsRead(style.height);
            expect(declared[widthVar], `${mode} width`).toBe('18px');
            expect(declared[heightVar], `${mode} height`).toBe('22px');
            if (mode === 'registry') {
              // 1em registry artwork follows the font size: the smaller side.
              expect(style.fontSize).toMatch(/^min\(/);
              expect(varsRead(style.fontSize).sort()).toEqual(
                [widthVar, heightVar].sort(),
              );
            }
          }
        }
      },
    );
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

  // spec:AST-087 FR1, FR6, FR9 — a function registry entry receives the size
  // resolved by component:Icon ORD1, and its result is final.
  describe('function registry entries', () => {
    const sized = (label: string) => (request: IconRequest) =>
      `${label}-${request.size}`;

    it('passes each explicit size to a theme function entry', () => {
      resetIcons();
      resetThemes();
      const info = vi.fn(sized('theme-info'));
      const theme = defineTheme({name: 'fn-sizes', icons: {info}});

      render(
        <Theme theme={theme}>
          {(['xsm', 'sm', 'md', 'lg'] as const).map(size => (
            <Icon key={size} icon="info" size={size} data-testid={size} />
          ))}
        </Theme>,
      );

      for (const size of ['xsm', 'sm', 'md', 'lg'] as const) {
        const icon = screen.getByTestId(size);
        expect(icon).toHaveTextContent(`theme-info-${size}`);
        expect(icon).toHaveAttribute('data-size', size);
        expect(info).toHaveBeenCalledWith({size});
      }
    });

    it('passes the standalone md fallback when no size is set', () => {
      resetIcons();
      resetThemes();
      const theme = defineTheme({
        name: 'fn-standalone',
        icons: {info: sized('theme-info')},
      });

      render(
        <Theme theme={theme}>
          <Icon icon="info" data-testid="icon" />
        </Theme>,
      );

      expect(screen.getByTestId('icon')).toHaveTextContent('theme-info-md');
    });

    it('passes the owning component default, and an explicit size over it', () => {
      resetIcons();
      resetThemes();
      const theme = defineTheme({
        name: 'fn-contextual',
        icons: {info: sized('theme-info')},
      });

      render(
        <Theme theme={theme}>
          <IconDefaultSizeProvider value="sm">
            <Icon icon="info" data-testid="contextual" />
            <Icon icon="info" size="lg" data-testid="explicit" />
          </IconDefaultSizeProvider>
        </Theme>,
      );

      expect(screen.getByTestId('contextual')).toHaveTextContent(
        'theme-info-sm',
      );
      expect(screen.getByTestId('explicit')).toHaveTextContent('theme-info-lg');
    });

    it('passes the resolved size to a process-wide function entry', () => {
      resetIcons();
      resetThemes();
      registerIcons({info: sized('global-info')});

      render(<Icon icon="info" size="xsm" data-testid="icon" />);

      expect(screen.getByTestId('icon')).toHaveTextContent('global-info-xsm');
    });

    it('resolves function entries from the nearest Theme', () => {
      resetIcons();
      resetThemes();
      const outer = defineTheme({
        name: 'fn-outer',
        icons: {info: sized('outer-info')},
      });
      const inner = defineTheme({
        name: 'fn-inner',
        icons: {info: sized('inner-info')},
      });

      render(
        <Theme theme={outer}>
          <Icon icon="info" size="sm" data-testid="outer" />
          <Theme theme={inner}>
            <Icon icon="info" size="lg" data-testid="inner" />
          </Theme>
        </Theme>,
      );

      expect(screen.getByTestId('outer')).toHaveTextContent('outer-info-sm');
      expect(screen.getByTestId('inner')).toHaveTextContent('inner-info-lg');
    });

    it('renders no glyph when the selected function returns null', () => {
      resetIcons();
      resetThemes();
      registerIcons({info: 'global-info'});
      const theme = defineTheme({name: 'fn-null', icons: {info: () => null}});

      const {container} = render(
        <Theme theme={theme}>
          <Icon icon="info" data-testid="icon" />
        </Theme>,
      );

      expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
      expect(container.querySelector('.astryx-icon')).toBeNull();
    });

    it('renders a supplied icon component as given', () => {
      resetIcons();
      resetThemes();
      const info = vi.fn(sized('theme-info'));
      const theme = defineTheme({name: 'fn-direct', icons: {info}});
      info.mockClear();

      render(
        <Theme theme={theme}>
          <Icon icon={TestIcon} size="sm" data-testid="icon" />
        </Theme>,
      );

      expect(screen.getByTestId('icon').tagName.toLowerCase()).toBe('svg');
      expect(info).not.toHaveBeenCalled();
    });
  });

  // spec:AST-087 FR4, FR5; component:Icon FR6 — a requested variant reaches
  // the selected entry only when the active theme lists it and, for a theme
  // entry, the theme that defined it lists it too. Everything else receives
  // `undefined` and draws its normal artwork.
  describe('variant', () => {
    const drawn = (label: string) =>
      vi.fn(
        ({size, variant}: IconRequest) =>
          `${label}-${size}-${variant ?? 'normal'}`,
      );

    function renderInTheme(
      theme: Parameters<typeof Theme>[0]['theme'],
      ui: React.ReactNode,
    ) {
      return render(<Theme theme={theme}>{ui}</Theme>);
    }

    it('passes a variant the active theme lists to its entry', () => {
      resetIcons();
      resetThemes();
      const info = drawn('info');
      const theme = defineTheme({
        name: 'variant-listed',
        iconVariants: ['outline', 'filled'],
        icons: {info},
      });

      renderInTheme(
        theme,
        <Icon icon="info" size="sm" variant="filled" data-testid="icon" />,
      );

      expect(screen.getByTestId('icon')).toHaveTextContent('info-sm-filled');
      expect(info).toHaveBeenLastCalledWith({size: 'sm', variant: 'filled'});
    });

    it('passes undefined when the variant is omitted', () => {
      resetIcons();
      resetThemes();
      const info = drawn('info');
      const theme = defineTheme({
        name: 'variant-omitted',
        iconVariants: ['outline', 'filled'],
        icons: {info},
      });
      info.mockClear();

      renderInTheme(theme, <Icon icon="info" data-testid="icon" />);

      expect(screen.getByTestId('icon')).toHaveTextContent('info-md-normal');
      expect(info).toHaveBeenLastCalledWith({size: 'md'});
    });

    it('renders the normal artwork for a variant the active theme does not list', () => {
      // The theme-independent fallback (component-theming-surface INV14).
      resetIcons();
      resetThemes();
      const info = drawn('info');
      const theme = defineTheme({
        name: 'variant-unlisted',
        iconVariants: ['outline'],
        icons: {info},
      });
      info.mockClear();

      renderInTheme(
        theme,
        <Icon icon="info" size="lg" variant="filled" data-testid="icon" />,
      );

      expect(screen.getByTestId('icon')).toHaveTextContent('info-lg-normal');
      expect(info).toHaveBeenLastCalledWith({size: 'lg'});
    });

    it('renders the normal artwork when the active theme lists no variants', () => {
      resetIcons();
      resetThemes();
      const info = drawn('info');
      const theme = defineTheme({name: 'variant-no-list', icons: {info}});

      renderInTheme(
        theme,
        <Icon icon="info" variant="filled" data-testid="icon" />,
      );

      expect(screen.getByTestId('icon')).toHaveTextContent('info-md-normal');
    });

    it('keeps the defining theme list for an inherited entry', () => {
      resetIcons();
      resetThemes();
      const base = defineTheme({
        name: 'variant-base',
        iconVariants: ['outline'],
        icons: {info: drawn('base-info')},
      });
      const child = defineTheme({
        name: 'variant-child',
        extends: base,
        iconVariants: ['outline', 'filled'],
        icons: {close: drawn('child-close')},
      });

      renderInTheme(
        child,
        <>
          <Icon icon="info" variant="filled" data-testid="inherited-filled" />
          <Icon icon="info" variant="outline" data-testid="inherited-outline" />
          <Icon icon="close" variant="filled" data-testid="own-filled" />
        </>,
      );

      // The base never listed 'filled', so its entry draws normal artwork.
      expect(screen.getByTestId('inherited-filled')).toHaveTextContent(
        'base-info-md-normal',
      );
      expect(screen.getByTestId('inherited-outline')).toHaveTextContent(
        'base-info-md-outline',
      );
      expect(screen.getByTestId('own-filled')).toHaveTextContent(
        'child-close-md-filled',
      );
    });

    it('passes an inherited entry only the variants the child still lists', () => {
      resetIcons();
      resetThemes();
      const base = defineTheme({
        name: 'variant-wide-base',
        iconVariants: ['outline', 'filled'],
        icons: {info: drawn('base-info')},
      });
      const replaced = defineTheme({
        name: 'variant-narrow-child',
        extends: base,
        iconVariants: ['outline'],
      });
      const inherited = defineTheme({
        name: 'variant-inherit-child',
        extends: base,
      });

      renderInTheme(
        replaced,
        <Icon icon="info" variant="filled" data-testid="replaced" />,
      );
      renderInTheme(
        inherited,
        <Icon icon="info" variant="filled" data-testid="inherited" />,
      );

      expect(screen.getByTestId('replaced')).toHaveTextContent(
        'base-info-md-normal',
      );
      expect(screen.getByTestId('inherited')).toHaveTextContent(
        'base-info-md-filled',
      );
    });

    it('passes a process-wide registration the variants the active theme lists', () => {
      resetIcons();
      resetThemes();
      registerIcons({info: drawn('global-info')});
      const listing = defineTheme({
        name: 'variant-global-listed',
        iconVariants: ['filled'],
      });
      const notListing = defineTheme({
        name: 'variant-global-unlisted',
        iconVariants: ['outline'],
      });

      renderInTheme(
        listing,
        <Icon icon="info" variant="filled" data-testid="listed" />,
      );
      renderInTheme(
        notListing,
        <Icon icon="info" variant="filled" data-testid="unlisted" />,
      );
      render(<Icon icon="info" variant="filled" data-testid="no-theme" />);

      expect(screen.getByTestId('listed')).toHaveTextContent(
        'global-info-md-filled',
      );
      expect(screen.getByTestId('unlisted')).toHaveTextContent(
        'global-info-md-normal',
      );
      expect(screen.getByTestId('no-theme')).toHaveTextContent(
        'global-info-md-normal',
      );
    });

    it('renders the same node entry for every variant', () => {
      resetIcons();
      resetThemes();
      const theme = defineTheme({
        name: 'variant-node',
        iconVariants: ['outline', 'filled'],
        icons: {info: 'node-info'},
      });

      renderInTheme(
        theme,
        <>
          <Icon icon="info" variant="filled" data-testid="filled" />
          <Icon icon="info" data-testid="normal" />
        </>,
      );

      expect(screen.getByTestId('filled')).toHaveTextContent('node-info');
      expect(screen.getByTestId('normal')).toHaveTextContent('node-info');
    });

    it('never passes variant to a supplied icon component', () => {
      resetIcons();
      resetThemes();
      const Supplied = vi.fn((props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} />
      ));
      const theme = defineTheme({
        name: 'variant-direct',
        iconVariants: ['outline', 'filled'],
      });

      renderInTheme(
        theme,
        <Icon icon={Supplied} variant="filled" data-testid="icon" />,
      );

      const props = Supplied.mock.calls[0]?.[0] ?? {};
      expect(props).not.toHaveProperty('variant');
      expect(screen.getByTestId('icon')).not.toHaveAttribute('variant');
    });

    it('writes no variant to the DOM or the icon theming target', () => {
      resetIcons();
      resetThemes();
      const theme = defineTheme({
        name: 'variant-dom',
        iconVariants: ['outline', 'filled'],
        icons: {info: drawn('info')},
      });

      renderInTheme(
        theme,
        <>
          <Icon icon="info" variant="filled" data-testid="registry" />
          <Icon icon={TestIcon} variant="filled" data-testid="component" />
        </>,
      );

      for (const id of ['registry', 'component']) {
        const icon = screen.getByTestId(id);
        expect(icon).toHaveClass('astryx-icon');
        expect(icon).not.toHaveAttribute('variant');
        expect(icon).not.toHaveAttribute('data-variant');
        expect(icon.outerHTML).not.toContain('filled"');
      }
    });

    it('types variant by IconVariantMap', () => {
      render(
        <>
          <Icon icon="info" variant="outline" />
          {/* @ts-expect-error — 'bold' is not in IconVariantMap. */}
          <Icon icon="info" variant="bold" />
        </>,
      );
    });
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
