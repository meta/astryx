// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  describe,
  it,
  expect,
  expectTypeOf,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import type {ReactNode} from 'react';
import {render, screen} from '@testing-library/react';
import {Theme} from '../theme/Theme';
import {defineTheme, type DefinedTheme} from '../theme/defineTheme';
import {resetThemes} from '../theme/themeRegistry';
import {__resetDevWarnings} from '../utils/devWarning';
import {defaultIcons} from './defaultIcons';
import {
  registerIcons,
  getIconRegistry,
  getIcon,
  getExtendedIcon,
  resetIcons,
  resolveIcon,
  type IconEntry,
  type IconRegistry,
  type IconRequest,
} from './globalIconRegistry';
import {Icon} from './Icon';
import type {IconSize} from './IconSize.stylex';
import type {IconVariant, IconVariantMap} from './index';
import {useIcon} from './useIcon';

// An application augments the public map with the variant names it requests
// (spec:AST-087 FR3).
declare module './index' {
  interface IconVariantMap {
    outline: true;
    filled: true;
  }
}

describe('iconRegistry (global, RSC-compatible)', () => {
  beforeEach(() => {
    resetIcons();
    resetThemes();
    __resetDevWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a default icon registry snapshot', () => {
    const registry = getIconRegistry();
    const builtInDefaults = Object.fromEntries(
      Object.entries(defaultIcons).filter(([name]) => !name.includes(':')),
    );

    expect(registry).toEqual(builtInDefaults);
    expect(registry).not.toBe(defaultIcons);
  });

  it('provides a distinct default for the NumberInput stepper icon', () => {
    const icon = getIcon('numberInput:stepperDown');

    expect(icon).toBe(defaultIcons['numberInput:stepperDown']);
    expect(icon).toBeDefined();
    expect(icon).not.toBe(defaultIcons.chevronDown);
  });

  it('draws the default upload distinctly from arrowUp', () => {
    const {container: upload} = render(<Icon icon="upload" />);
    const {container: arrowUp} = render(<Icon icon="arrowUp" />);

    expect(getIcon('upload')).toBe(defaultIcons.upload);
    expect(upload.querySelector('svg')).not.toBeNull();
    expect(upload.querySelector('svg')?.innerHTML).not.toBe(
      arrowUp.querySelector('svg')?.innerHTML,
    );
  });

  it('requires all IconNames including upload in complete icon registries', () => {
    const {upload: _upload, ...incompleteIcons} = defaultIcons;
    // @ts-expect-error IconRegistry requires all IconNames including upload
    const incompleteRegistry: IconRegistry = incompleteIcons;
    expect(incompleteRegistry).toBeDefined();

    const completeRegistry: IconRegistry = defaultIcons;
    expect(completeRegistry.upload).toBe(defaultIcons.upload);
  });

  it('lets a theme draw upload without changing arrowUp', () => {
    const theme = defineTheme({
      name: 'upload-only',
      icons: {upload: 'theme-upload'},
    });

    expect(getIcon('upload', theme)).toBe('theme-upload');
    expect(getIcon('arrowUp', theme)).toBe(defaultIcons.arrowUp);
    expect(getIconRegistry(theme).arrowUp).toBe(defaultIcons.arrowUp);
  });

  it('resolves the default upload for a theme that only draws arrowUp', () => {
    const {upload: _upload, ...legacyIcons} = defaultIcons;
    const theme = defineTheme({
      name: 'legacy-complete',
      icons: {...legacyIcons, arrowUp: 'theme-arrow-up'},
    });

    expect(getIcon('arrowUp', theme)).toBe('theme-arrow-up');
    expect(getIcon('upload', theme)).toBe(defaultIcons.upload);
    expect(getIconRegistry(theme).upload).toBe(defaultIcons.upload);
  });

  it('returns default icons when nothing is registered', () => {
    const icon = getIcon('close');
    expect(icon).toBeDefined();
    expect(icon).not.toBeNull();
  });

  it('warns once that registerIcons applies global overrides', () => {
    const warnSpy = vi.mocked(console.warn);

    registerIcons({close: 'custom-close'});
    registerIcons({check: 'custom-check'});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      '`registerIcons()` applies icon overrides globally',
    );
  });

  it('returns registered icons over defaults', () => {
    const customClose = 'custom-close-icon';
    registerIcons({close: customClose});

    expect(getIcon('close')).toBe(customClose);
    expect(getIconRegistry().close).toBe(customClose);
    expect(getIconRegistry().check).toBe(defaultIcons.check);
  });

  it('falls back to defaults for unregistered names', () => {
    registerIcons({close: 'custom-close'});
    // 'check' was not registered, should fall back to default
    const checkIcon = getIcon('check');
    expect(checkIcon).toBeDefined();
    expect(checkIcon).not.toBe('custom-close');
  });

  it('keeps registry snapshots aligned with getIcon fallback behavior', () => {
    registerIcons({close: null});

    expect(getIcon('close')).toBe(defaultIcons.close);
    expect(getIconRegistry().close).toBe(defaultIcons.close);
  });

  it('merges multiple registerIcons calls', () => {
    registerIcons({close: 'close-v1'});
    registerIcons({check: 'check-v1'});
    expect(getIcon('close')).toBe('close-v1');
    expect(getIcon('check')).toBe('check-v1');
  });

  it('later registrations override earlier ones', () => {
    registerIcons({close: 'close-v1'});
    registerIcons({close: 'close-v2'});
    expect(getIcon('close')).toBe('close-v2');
  });

  it('resolves icons from an explicit theme object over global registrations', () => {
    registerIcons({close: 'global-close'});
    const theme = defineTheme({
      name: 'brand',
      icons: {close: 'theme-close'},
    });

    expect(getIcon('close', theme)).toBe('theme-close');
    expect(getIconRegistry(theme).close).toBe('theme-close');
  });

  it('resolves icons from a registered theme name for SSR-friendly lookups', () => {
    defineTheme({
      name: 'brand',
      icons: {close: 'theme-close'},
    });

    expect(getIcon('close', 'brand')).toBe('theme-close');
    expect(getIconRegistry('brand').close).toBe('theme-close');
  });

  it('falls back through global registrations when a theme omits a name', () => {
    registerIcons({close: 'global-close'});
    const theme = defineTheme({name: 'brand', icons: {check: 'theme-check'}});

    expect(getIcon('close', theme)).toBe('global-close');
    expect(getIcon('check', theme)).toBe('theme-check');
  });

  it('resetIcons clears the global registry', () => {
    registerIcons({close: 'custom'});
    expect(getIcon('close')).toBe('custom');
    resetIcons();
    // Should fall back to default
    expect(getIcon('close')).not.toBe('custom');
  });

  describe('extension keys', () => {
    it('registers and resolves library-contributed keys', () => {
      registerIcons({'richtext:bold': 'my-bold'});
      expect(getIcon('richtext:bold')).toBe('my-bold');
      expect(getExtendedIcon('richtext:bold')).toBe('my-bold');
    });

    it('getExtendedIcon returns the caller fallback when unregistered', () => {
      expect(getExtendedIcon('richtext:bold', 'inline-svg')).toBe('inline-svg');
    });

    it('getExtendedIcon prefers a registered icon over the fallback', () => {
      registerIcons({'richtext:bold': 'theme-bold'});
      expect(getExtendedIcon('richtext:bold', 'inline-svg')).toBe('theme-bold');
    });

    it('getExtendedIcon still resolves built-in defaults', () => {
      expect(getExtendedIcon('close', 'fallback')).toBe(defaultIcons.close);
    });

    it('extension keys do not leak into the built-in registry snapshot', () => {
      registerIcons({'richtext:bold': 'my-bold'});
      // getIconRegistry() is the built-in IconName snapshot; extension keys
      // are resolved via getIcon/getExtendedIcon, not surfaced here.
      expect(Object.keys(getIconRegistry())).not.toContain('richtext:bold');
      expect(Object.keys(getIconRegistry())).not.toContain(
        'numberInput:stepperDown',
      );
    });

    it('extension keys are cleared by resetIcons', () => {
      registerIcons({'richtext:bold': 'my-bold'});
      resetIcons();
      expect(getExtendedIcon('richtext:bold', 'fallback')).toBe('fallback');
    });
  });

  // spec:AST-087 FR1, FR6, FR7, FR9, FR18 — an entry is a node or a pure
  // function of the request; sources resolve before the request; public reads
  // stay node-valued and read a function at {size: 'md'}.
  describe('function entries', () => {
    const sized = (label: string) => (request: IconRequest) =>
      `${label}-${request.size}`;

    it('calls a theme function entry with the requested size', () => {
      const info = vi.fn(sized('theme-info'));
      const theme = defineTheme({name: 'fn-theme', icons: {info}});

      for (const size of ['xsm', 'sm', 'md', 'lg'] as const) {
        expect(resolveIcon('info', theme, {size})).toBe(`theme-info-${size}`);
        expect(info).toHaveBeenLastCalledWith({size});
      }
    });

    it('calls a process-wide function entry with the requested size', () => {
      const info = vi.fn(sized('global-info'));
      registerIcons({info});

      expect(resolveIcon('info', null, {size: 'lg'})).toBe('global-info-lg');
      expect(info).toHaveBeenLastCalledWith({size: 'lg'});
    });

    it('resolves a function entry for a namespaced key', () => {
      const theme = defineTheme({
        name: 'fn-namespaced',
        icons: {'numberInput:stepperDown': sized('stepper')},
      });

      expect(resolveIcon('numberInput:stepperDown', theme, {size: 'xsm'})).toBe(
        'stepper-xsm',
      );
    });

    it('resolves through a registered theme name', () => {
      defineTheme({name: 'fn-by-name', icons: {info: sized('named-info')}});

      expect(resolveIcon('info', 'fn-by-name', {size: 'sm'})).toBe(
        'named-info-sm',
      );
      expect(getIcon('info', 'fn-by-name')).toBe('named-info-md');
    });

    describe('source precedence', () => {
      it('prefers a theme entry over a process-wide registration and the default', () => {
        const global = vi.fn(sized('global-info'));
        registerIcons({info: global});
        const theme = defineTheme({
          name: 'fn-precedence',
          icons: {info: sized('theme-info')},
        });

        expect(resolveIcon('info', theme, {size: 'sm'})).toBe('theme-info-sm');
        expect(global).not.toHaveBeenCalled();
      });

      it('prefers a process-wide registration over the built-in default', () => {
        registerIcons({info: sized('global-info')});

        expect(resolveIcon('info', null, {size: 'sm'})).toBe('global-info-sm');
        expect(getIcon('info')).toBe('global-info-md');
      });

      it('uses the built-in default when neither source has an entry', () => {
        const theme = defineTheme({
          name: 'fn-default',
          icons: {close: sized('theme-close')},
        });

        expect(resolveIcon('info', theme, {size: 'sm'})).toBe(
          defaultIcons.info,
        );
      });

      it('lets a nullish static theme entry fall through to the next source', () => {
        registerIcons({info: sized('global-info')});
        const theme = defineTheme({
          name: 'fn-nullish-static',
          icons: {info: null, close: undefined},
        });

        expect(resolveIcon('info', theme, {size: 'sm'})).toBe('global-info-sm');
        expect(resolveIcon('close', theme, {size: 'sm'})).toBe(
          defaultIcons.close,
        );
      });

      it('treats a selected function result as final, even when nullish', () => {
        registerIcons({info: 'global-info', close: 'global-close'});
        const theme = defineTheme({
          name: 'fn-final',
          icons: {info: () => null, close: () => undefined},
        });

        expect(resolveIcon('info', theme, {size: 'sm'})).toBeNull();
        expect(resolveIcon('close', theme, {size: 'sm'})).toBeUndefined();
        expect(getIcon('info', theme)).toBeNull();
        expect(getIconRegistry(theme).info).toBeNull();
        expect(getExtendedIcon('info', 'fallback', theme)).toBeNull();
      });

      it('treats a process-wide function result as final', () => {
        registerIcons({info: () => null});

        expect(resolveIcon('info', null, {size: 'sm'})).toBeNull();
        expect(getIcon('info')).toBeNull();
        expect(getExtendedIcon('info', 'fallback')).toBeNull();
      });

      it('returns a function result per request, never mixing sources', () => {
        // The theme draws only `sm`; every other size draws nothing rather than
        // borrowing the default's artwork.
        const theme = defineTheme({
          name: 'fn-partial',
          icons: {info: ({size}) => (size === 'sm' ? 'theme-info-sm' : null)},
        });

        expect(resolveIcon('info', theme, {size: 'sm'})).toBe('theme-info-sm');
        expect(resolveIcon('info', theme, {size: 'lg'})).toBeNull();
      });
    });

    describe('extends', () => {
      it('inherits a base function entry and keeps calling it per request', () => {
        const base = defineTheme({
          name: 'fn-base',
          icons: {info: sized('base-info')},
        });
        const child = defineTheme({name: 'fn-child', extends: base});

        expect(resolveIcon('info', child, {size: 'lg'})).toBe('base-info-lg');
        expect(child.icons?.info).toBe('base-info-md');
      });

      it("replaces the inherited entry whole with the child's entry for the same key", () => {
        const base = defineTheme({
          name: 'fn-base-replace',
          icons: {info: sized('base-info'), close: 'base-close'},
        });
        const child = defineTheme({
          name: 'fn-child-replace',
          extends: base,
          icons: {info: 'child-info', close: sized('child-close')},
        });

        expect(resolveIcon('info', child, {size: 'lg'})).toBe('child-info');
        expect(resolveIcon('close', child, {size: 'lg'})).toBe(
          'child-close-lg',
        );
        expect(child.icons).toEqual({
          info: 'child-info',
          close: 'child-close-md',
        });
      });
    });

    describe('public reads stay node-valued', () => {
      it('getIcon reads a theme function entry at md', () => {
        const info = vi.fn(sized('theme-info'));
        const theme = defineTheme({name: 'fn-read', icons: {info}});
        info.mockClear();

        expect(getIcon('info', theme)).toBe('theme-info-md');
        expect(info).toHaveBeenCalledWith({size: 'md'});
      });

      it('getIconRegistry reads every function entry at md', () => {
        registerIcons({close: sized('global-close')});
        const theme = defineTheme({
          name: 'fn-snapshot',
          icons: {info: sized('theme-info')},
        });

        const registry = getIconRegistry(theme);
        expect(registry.info).toBe('theme-info-md');
        expect(registry.close).toBe('global-close-md');
        expect(registry.check).toBe(defaultIcons.check);
        expect(
          Object.values(registry).some(value => typeof value === 'function'),
        ).toBe(false);
      });

      it('getExtendedIcon reads a function entry at md', () => {
        registerIcons({'richtext:bold': sized('bold')});

        expect(getExtendedIcon('richtext:bold', 'fallback')).toBe('bold-md');
      });

      it("DefinedTheme['icons'] holds the md node for a function entry", () => {
        const theme = defineTheme({
          name: 'fn-public-icons',
          icons: {info: sized('theme-info'), close: 'theme-close'},
        });

        expect(theme.icons).toEqual({
          info: 'theme-info-md',
          close: 'theme-close',
        });
      });

      it('useIcon reads a function entry at md from the nearest Theme', () => {
        const theme = defineTheme({
          name: 'fn-hook',
          icons: {info: sized('theme-info')},
        });
        function Probe() {
          return <span data-testid="probe">{useIcon('info')}</span>;
        }

        render(
          <Theme theme={theme}>
            <Probe />
          </Theme>,
        );

        expect(screen.getByTestId('probe')).toHaveTextContent('theme-info-md');
      });

      it('keeps public read types node-valued while entries accept functions', () => {
        expectTypeOf<IconRegistry['info']>().toEqualTypeOf<ReactNode>();
        expectTypeOf(getIcon).returns.toEqualTypeOf<ReactNode>();
        expectTypeOf(getIconRegistry).returns.toEqualTypeOf<
          Readonly<Record<keyof IconRegistry, ReactNode>>
        >();
        expectTypeOf<
          NonNullable<DefinedTheme['icons']>['info']
        >().toEqualTypeOf<ReactNode>();
        expectTypeOf<IconRequest>().toEqualTypeOf<
          Readonly<{size: IconSize; variant?: IconVariant}>
        >();
        expectTypeOf<IconEntry>().toEqualTypeOf<
          ReactNode | ((request: IconRequest) => ReactNode)
        >();

        defineTheme({
          name: 'fn-types',
          icons: {
            info: ({size, variant}) => {
              expectTypeOf(size).toEqualTypeOf<IconSize>();
              expectTypeOf(variant).toEqualTypeOf<undefined>();
              return null;
            },
            // @ts-expect-error — an entry returns artwork, not a props object.
            close: () => ({weight: 'bold'}),
          },
        });
        registerIcons({
          info: ({size}) => `global-${size}`,
          // @ts-expect-error — the request has no `name`.
          close: ({name}) => String(name),
        });
      });
    });

    describe('variant names', () => {
      it('types a process-wide entry by the augmentable IconVariantMap', () => {
        expectTypeOf<IconVariant>().toEqualTypeOf<
          keyof IconVariantMap & string
        >();
        expectTypeOf<IconVariant>().toEqualTypeOf<'outline' | 'filled'>();

        registerIcons({
          info: ({variant}) => {
            expectTypeOf(variant).toEqualTypeOf<
              'outline' | 'filled' | undefined
            >();
            return variant === 'filled' ? 'global-info-filled' : 'global-info';
          },
          close: ({variant}) =>
            // @ts-expect-error — 'bold' is not an augmented variant name.
            variant === 'bold' ? 'bold-close' : 'close',
        });
      });

      it('passes a listed variant to theme and process-wide entries only', () => {
        const themeInfo = vi.fn(
          ({variant}: IconRequest) => `theme-${variant ?? 'normal'}`,
        );
        const globalClose = vi.fn(
          ({variant}: IconRequest) => `global-${variant ?? 'normal'}`,
        );
        registerIcons({close: globalClose});
        const theme = defineTheme({
          name: 'resolve-listed',
          iconVariants: ['filled'],
          icons: {info: themeInfo},
        });

        expect(
          resolveIcon('info', theme, {size: 'sm', variant: 'filled'}),
        ).toBe('theme-filled');
        expect(
          resolveIcon('close', theme, {size: 'sm', variant: 'filled'}),
        ).toBe('global-filled');
        expect(
          resolveIcon('info', theme, {size: 'sm', variant: 'outline'}),
        ).toBe('theme-normal');
        expect(
          resolveIcon('close', null, {size: 'sm', variant: 'filled'}),
        ).toBe('global-normal');
        expect(
          resolveIcon('check', theme, {size: 'sm', variant: 'filled'}),
        ).toBe(defaultIcons.check);
      });

      it('keeps the defining list through more than one extends', () => {
        const grandparent = defineTheme({
          name: 'resolve-grandparent',
          iconVariants: ['outline'],
          icons: {info: ({variant}) => `info-${variant ?? 'normal'}`},
        });
        const parent = defineTheme({
          name: 'resolve-parent',
          extends: grandparent,
          iconVariants: ['outline', 'filled'],
        });
        const child = defineTheme({name: 'resolve-child', extends: parent});

        expect(child.iconVariants).toEqual(['outline', 'filled']);
        expect(
          resolveIcon('info', child, {size: 'md', variant: 'filled'}),
        ).toBe('info-normal');
        expect(
          resolveIcon('info', child, {size: 'md', variant: 'outline'}),
        ).toBe('info-outline');
      });

      it('never passes a variant through public reads', () => {
        const info = vi.fn(
          ({variant}: IconRequest) => `info-${variant ?? 'normal'}`,
        );
        const theme = defineTheme({
          name: 'resolve-public-reads',
          iconVariants: ['outline', 'filled'],
          icons: {info},
        });

        expect(getIcon('info', theme)).toBe('info-normal');
        expect(getIconRegistry(theme).info).toBe('info-normal');
        expect(getExtendedIcon('info', 'fallback', theme)).toBe('info-normal');
        expect(theme.icons?.info).toBe('info-normal');
      });

      it('passes no variant to an entry, so it draws its normal artwork', () => {
        const info = vi.fn(({variant}: IconRequest) =>
          variant === 'filled' ? 'filled-info' : 'normal-info',
        );
        registerIcons({info});
        const theme = defineTheme({
          name: 'fn-listed',
          iconVariants: ['outline', 'filled'],
          icons: {close: info},
        });

        expect(resolveIcon('info', theme, {size: 'sm'})).toBe('normal-info');
        expect(resolveIcon('close', theme, {size: 'sm'})).toBe('normal-info');
        expect(getIcon('close', theme)).toBe('normal-info');
        expect(info).toHaveBeenCalled();
        for (const [request] of info.mock.calls) {
          expect(request.variant).toBeUndefined();
        }
      });
    });
  });
});
