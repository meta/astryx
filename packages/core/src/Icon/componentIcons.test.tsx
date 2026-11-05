// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file componentIcons.test.tsx
 * @input Uses vitest, @testing-library/react, defineTheme, Theme, and the
 *   component icon slot resolver and renderer
 * @output Tests slot precedence, partial requests, malformed requests, slot
 *   functions, static public reads, inheritance, and the public slot types
 * @position Testing; validates resolveComponentIcon, useComponentIcon,
 *   ComponentIcon, and defineTheme({componentIcons})
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type {ReactNode} from 'react';
import {render, screen} from '@testing-library/react';
import {Theme} from '../theme/Theme';
import {defineTheme, type DefinedTheme} from '../theme/defineTheme';
import {resetThemes} from '../theme/themeRegistry';
import {__resetDevWarnings} from '../utils/devWarning';
import {ComponentIcon} from './ComponentIcon';
import {
  getIcon,
  getIconRegistry,
  resolveComponentIcon,
  type ComponentIconFallback,
} from './globalIconRegistry';
import type {
  ComponentIconMap,
  ComponentIconRequest,
  ComponentIconSlotMap,
  ComponentIconSlotName,
  ComponentIconStaticMap,
  IconName,
} from './index';

// A package adds its own component's slots by augmenting the public map.
declare module './index' {
  interface ComponentIconSlotMap {
    'example-panel-dismiss': true;
    'example-nav-item-leading': {selected: boolean; disabled: boolean};
  }
}

const COPY = 'code-block-copy';
const FALLBACK = {icon: 'copy', size: 'sm'} as const;

let themeCount = 0;
/** Resolve the copy slot under a theme that sets `value` for it. */
function resolveCopy(
  value: unknown,
  {
    copied = false,
    fallback = FALLBACK,
    iconVariants,
  }: {
    copied?: boolean;
    fallback?: ComponentIconFallback;
    iconVariants?: string[];
  } = {},
) {
  const theme = defineTheme({
    name: `slots-${themeCount++}`,
    iconVariants,
    componentIcons: {[COPY]: value} as ComponentIconMap<string>,
  });
  return resolveComponentIcon(COPY, {copied}, fallback, theme);
}

describe('component icon slot resolution', () => {
  let warn: {mock: {calls: unknown[][]}};
  const warnings = () =>
    warn.mock.calls
      .map(([message]) => String(message))
      .filter(message => message.includes('componentIcons['));

  beforeEach(() => {
    resetThemes();
    __resetDevWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the component fallback without a theme or a slot entry', () => {
    expect(resolveComponentIcon(COPY, {copied: false}, 'copy', null)).toEqual({
      icon: 'copy',
    });
    expect(resolveCopy(undefined)).toEqual(FALLBACK);
  });

  it.each([
    ['a shared name replaces the icon', 'clock', {icon: 'clock', size: 'sm'}],
    ['null hides the icon', null, {icon: null, size: 'sm'}],
    ['icon: null hides the icon', {icon: null}, {icon: null, size: 'sm'}],
    ['a null result hides the icon', () => null, {icon: null, size: 'sm'}],
    ['an undefined result changes nothing', () => undefined, FALLBACK],
    ['a size keeps the icon', {size: 'lg'}, {icon: 'copy', size: 'lg'}],
  ])('%s', (_label, value, expected) => {
    expect(resolveCopy(value)).toEqual(expected);
  });

  it('keeps every field a request leaves out, variant included', () => {
    const fallback = {icon: 'copy', size: 'sm', variant: 'outline'} as const;
    expect(resolveCopy({size: 'lg'}, {fallback})).toEqual({
      ...fallback,
      size: 'lg',
    });
    expect(
      resolveCopy({variant: 'filled'}, {fallback, iconVariants: ['filled']}),
    ).toEqual({...fallback, variant: 'filled'});
  });

  it('passes the slot state to a slot function and uses its request', () => {
    const slot = vi.fn(({copied}: {copied: boolean}) => ({
      icon: copied ? ('checkDouble' as const) : ('copy' as const),
    }));

    expect(resolveCopy(slot, {copied: true}).icon).toBe('checkDouble');
    expect(slot).toHaveBeenLastCalledWith({copied: true});
    expect(resolveCopy(slot).icon).toBe('copy');
  });

  it('resolves through a registered theme name', () => {
    defineTheme({name: 'slots-by-name', componentIcons: {[COPY]: 'clock'}});

    expect(
      resolveComponentIcon(COPY, {copied: false}, 'copy', 'slots-by-name').icon,
    ).toBe('clock');
  });

  it.each([
    [
      'an unknown icon',
      {icon: 'clipboard', size: 'lg'},
      {icon: 'copy', size: 'lg'},
    ],
    ['a namespaced key', 'numberInput:stepperDown', FALLBACK],
    [
      'an unlisted variant',
      {icon: 'clock', variant: 'bold'},
      {icon: 'clock', size: 'sm'},
    ],
    [
      'an unsupported size',
      {icon: 'clock', size: 'xl'},
      {icon: 'clock', size: 'sm'},
    ],
    ['a result that is not a request', () => 'clock', FALLBACK],
  ])('ignores %s with one warning', (_label, value, expected) => {
    for (let i = 0; i < 3; i++) {
      expect(
        resolveComponentIcon(
          COPY,
          {copied: false},
          FALLBACK,
          defineTheme({
            name: 'slots-malformed',
            iconVariants: ['outline'] as ReadonlyArray<string>,
            componentIcons: {[COPY]: value} as ComponentIconMap<string>,
          }),
        ),
      ).toEqual(expected);
    }
    expect(warnings()).toHaveLength(1);
  });

  it('does not warn in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const registry = await import('./globalIconRegistry');
      const themes = await import('../theme/defineTheme');
      const theme = themes.defineTheme({
        name: 'slots-production',
        componentIcons: {
          // @ts-expect-error -- not a shared icon name.
          [COPY]: 'clipboard',
        },
      });
      expect(
        registry.resolveComponentIcon(COPY, {copied: false}, 'copy', theme)
          .icon,
      ).toBe('copy');
      expect(warnings()).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe('defineTheme({componentIcons})', () => {
  beforeEach(() => {
    resetThemes();
  });

  it('reads slot values back as a static view without slot functions', () => {
    const slot = vi.fn(() => ({icon: 'clock' as const}));
    const theme = defineTheme({
      name: 'slots-static-view',
      componentIcons: {
        [COPY]: slot,
        'example-panel-dismiss': {icon: 'close', size: 'sm'},
        'example-nav-item-leading': null,
      },
    });

    expect(theme.componentIcons).toEqual({
      'example-panel-dismiss': {icon: 'close', size: 'sm'},
      'example-nav-item-leading': null,
    });
    // Public reads never call a slot function.
    expect(getIcon('copy', theme)).toBeTruthy();
    expect(getIconRegistry(theme).copy).toBeTruthy();
    expect(slot).not.toHaveBeenCalled();
  });

  it('keeps a map without functions as the static view', () => {
    const theme = defineTheme({
      name: 'slots-identity',
      componentIcons: {[COPY]: 'clock'},
    });

    expect(theme.componentIcons).toEqual({[COPY]: 'clock'});
    expect(theme.__componentIcons).toBeUndefined();
    expect('componentIcons' in defineTheme({name: 'slots-absent'})).toBe(false);
  });

  it('inherits slot values, functions included, and replaces a slot whole', () => {
    const base = defineTheme({
      name: 'slots-base',
      componentIcons: {
        [COPY]: ({copied}) => ({icon: copied ? 'checkDouble' : 'clock'}),
        'example-panel-dismiss': {icon: 'close', size: 'sm'},
        'example-nav-item-leading': 'menu',
      },
    });
    const inherits = defineTheme({name: 'slots-inherits', extends: base});
    const child = defineTheme({
      name: 'slots-replaces',
      extends: base,
      componentIcons: {
        'example-panel-dismiss': {size: 'lg'},
        [COPY]: undefined,
        'example-nav-item-leading': null,
      },
    });

    expect(
      resolveComponentIcon(COPY, {copied: true}, 'check', inherits).icon,
    ).toBe('checkDouble');
    // An undefined entry inherits the base's slot function.
    expect(
      resolveComponentIcon(COPY, {copied: false}, 'copy', child).icon,
    ).toBe('clock');
    // The child's request replaces the base's whole: its icon is not merged.
    expect(
      resolveComponentIcon(
        'example-panel-dismiss',
        undefined,
        'chevronDown',
        child,
      ),
    ).toEqual({icon: 'chevronDown', size: 'lg'});
    // A child hides an inherited slot with null.
    expect(child.componentIcons).toEqual({
      'example-panel-dismiss': {size: 'lg'},
      'example-nav-item-leading': null,
    });
  });
});

describe('ComponentIcon', () => {
  beforeEach(() => {
    resetThemes();
  });

  function renderSlot(
    componentIcons: ComponentIconMap<never>,
    content?: ReactNode,
  ) {
    const theme = defineTheme({
      name: `slots-render-${themeCount++}`,
      icons: {
        copy: <span data-icon="copy" />,
        clock: <span data-icon="clock" />,
      },
      componentIcons,
    });
    render(
      <Theme theme={theme}>
        <span data-testid="slot">
          <ComponentIcon
            slot={COPY}
            state={{copied: false}}
            fallback={FALLBACK}
            content={content}
          />
        </span>
      </Theme>,
    );
    return screen.getByTestId('slot');
  }

  it('renders caller content instead of the slot, null included', () => {
    const slot = vi.fn(() => ({icon: 'clock' as const}));

    expect(
      renderSlot({[COPY]: slot}, <b data-icon="caller" />).querySelector(
        '[data-icon]',
      ),
    ).toHaveAttribute('data-icon', 'caller');
    expect(slot).not.toHaveBeenCalled();
  });

  it('renders nothing for caller content null', () => {
    expect(renderSlot({[COPY]: 'clock'}, null)).toBeEmptyDOMElement();
  });

  it('renders the resolved name through the theme icon registry', () => {
    const icon = renderSlot({
      [COPY]: {icon: 'clock', size: 'lg'},
    }).querySelector('.astryx-icon');

    expect(icon).toHaveAttribute('data-size', 'lg');
    expect(icon?.querySelector('[data-icon]')).toHaveAttribute(
      'data-icon',
      'clock',
    );
  });

  it('renders nothing for a resolved null', () => {
    expect(renderSlot({[COPY]: null})).toBeEmptyDOMElement();
  });
});

describe('component icon slot types', () => {
  it('types slot names, values, and the static view', () => {
    expectTypeOf<ComponentIconSlotName>().toEqualTypeOf<
      | 'chat-send-button-send'
      | 'code-block-copy'
      | 'timestamp-copy'
      | 'table-sort-indicator'
      | 'table-row-expand'
      | 'example-panel-dismiss'
      | 'example-nav-item-leading'
    >();
    expectTypeOf<ComponentIconSlotMap[typeof COPY]>().toEqualTypeOf<{
      readonly copied: boolean;
    }>();
    expectTypeOf<ComponentIconMap['example-panel-dismiss']>().toEqualTypeOf<
      IconName | null | ComponentIconRequest | undefined
    >();
    expectTypeOf<
      NonNullable<DefinedTheme['componentIcons']>
    >().toEqualTypeOf<ComponentIconStaticMap>();

    defineTheme({
      name: 'slots-types',
      iconVariants: ['outline', 'filled'],
      componentIcons: {
        'example-nav-item-leading': ({selected, disabled}) => {
          expectTypeOf(selected).toEqualTypeOf<boolean>();
          expectTypeOf(disabled).toEqualTypeOf<boolean>();
          return {variant: selected ? 'filled' : 'outline'};
        },
        // @ts-expect-error -- a stateless slot takes no function.
        'example-panel-dismiss': () => ({icon: 'close'}),
      },
    });

    defineTheme({
      name: 'slots-types-variant',
      iconVariants: ['outline'],
      componentIcons: {
        // @ts-expect-error -- 'filled' is not a name this theme lists.
        'example-nav-item-leading': {variant: 'filled'},
        // @ts-expect-error -- not a shared icon name.
        [COPY]: 'clipboard',
      },
    });

    defineTheme({
      name: 'slots-types-unknown',
      componentIcons: {
        // @ts-expect-error -- not a declared slot.
        'code-block-paste': 'copy',
      },
    });
  });
});
