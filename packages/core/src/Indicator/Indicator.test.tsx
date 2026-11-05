// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render, renderHook, screen} from '@testing-library/react';
import type {PropsWithChildren, ReactNode} from 'react';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {CheckboxIndicator} from './CheckboxIndicator';
import {CheckIndicator} from './CheckIndicator';
import {RadioIndicator} from './RadioIndicator';
import {getIndicator} from './indicatorRegistry';
import {useIndicator} from './useIndicator';
import type {IndicatorProps} from './types';

function createThemeWrapper(theme: ReturnType<typeof defineTheme>) {
  function ThemeWrapper({children}: PropsWithChildren): ReactNode {
    return <Theme theme={theme}>{children}</Theme>;
  }
  return ThemeWrapper;
}

describe('default indicators', () => {
  it('renders the checkbox theme target with state and size', () => {
    render(<CheckboxIndicator state="indeterminate" size="sm" />);

    const box = document.querySelector('.astryx-checkbox-indicator');
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute('data-checked', 'indeterminate');
    expect(box).toHaveAttribute('data-size', 'sm');
    // Decorative: the owning control keeps the role and accessible name.
    expect(box).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the radio dot only when checked, in both states', () => {
    const {rerender} = render(<RadioIndicator state="unchecked" />);

    // The circle draws in the unchecked state — this is what lets a radio act
    // as a selection indicator where an icon would render nothing.
    expect(
      document.querySelector('.astryx-radio-indicator'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('.astryx-radio-indicator-dot'),
    ).not.toBeInTheDocument();

    rerender(<RadioIndicator state="checked" />);
    expect(
      document.querySelector('.astryx-radio-indicator-dot'),
    ).toBeInTheDocument();
    expect(document.querySelector('.astryx-radio-indicator')).toHaveAttribute(
      'data-checked',
      'checked',
    );
  });

  it('renders children instead of the state mark', () => {
    render(
      <CheckboxIndicator state="checked">
        <span data-testid="busy" />
      </CheckboxIndicator>,
    );

    expect(screen.getByTestId('busy')).toBeInTheDocument();
  });

  it('reflects the disabled state for theme targeting', () => {
    render(<RadioIndicator state="checked" isDisabled />);

    expect(document.querySelector('.astryx-radio-indicator')).toHaveAttribute(
      'data-disabled',
      'disabled',
    );
  });
});

/**
 * CheckIndicator is the one indicator that draws nothing in a state, which is
 * what makes it the default selection mark — and what made its two escape
 * hatches (props and children) easy to get wrong. Both are pinned here.
 */
describe('CheckIndicator', () => {
  it('draws the mark when checked and nothing when not', () => {
    const {container, rerender} = render(<CheckIndicator state="checked" />);

    const mark = container.querySelector('.astryx-icon');
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute('aria-hidden', 'true');

    rerender(<CheckIndicator state="unchecked" />);
    // No empty box beside an unchosen row — the reason a check is the default.
    expect(container).toBeEmptyDOMElement();
  });

  it('renders children INSTEAD of the mark, in both states', () => {
    // A host shows a pending Spinner through `children` in whatever state the
    // row is in, and an unchosen row is the common one. The unchecked case
    // used to render nothing at all.
    for (const state of ['checked', 'unchecked'] as const) {
      const {unmount} = render(
        <CheckIndicator state={state}>
          <span data-testid="busy" />
        </CheckIndicator>,
      );

      expect(screen.getByTestId('busy'), `state=${state}`).toBeInTheDocument();
      // The mark is replaced, not accompanied.
      expect(document.querySelector('.astryx-icon')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('forwards caller props and styling on both render paths', () => {
    // Same contract whether or not children are present: a data-testid, an id
    // and an xstyle-driven class must survive either branch.
    const {container, rerender} = render(
      <CheckIndicator state="checked" data-testid="mark" id="pinned" />,
    );

    expect(screen.getByTestId('mark')).toHaveAttribute('id', 'pinned');

    rerender(
      <CheckIndicator
        state="checked"
        data-testid="mark"
        id="pinned"
        className="host-target">
        <span data-testid="busy" />
      </CheckIndicator>,
    );

    const withChildren = screen.getByTestId('mark');
    expect(withChildren).toHaveAttribute('id', 'pinned');
    expect(withChildren).toHaveClass('host-target');
    expect(withChildren).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[data-testid="busy"]')).toBeInTheDocument();
  });
});

/**
 * The busy idiom a host actually writes is `children={isBusy && <Spinner/>}`,
 * which passes `false` when it is not busy. `false` is non-null and is not
 * caught by `??`, so both a `!= null` guard and a `children ?? mark` fallback
 * take the children path, render nothing in it, and delete the state mark
 * (#4893). Every indicator gets the same case, because all three had the bug.
 */
describe('falsy children never suppress the state mark (#4893)', () => {
  const cases = [
    {
      name: 'CheckIndicator',
      render: (children: ReactNode) =>
        render(<CheckIndicator state="checked">{children}</CheckIndicator>),
      markSelector: '.astryx-icon',
    },
    {
      name: 'CheckboxIndicator',
      render: (children: ReactNode) =>
        render(
          <CheckboxIndicator state="checked">{children}</CheckboxIndicator>,
        ),
      markSelector: 'svg',
    },
    {
      name: 'RadioIndicator',
      render: (children: ReactNode) =>
        render(<RadioIndicator state="checked">{children}</RadioIndicator>),
      markSelector: '.astryx-radio-indicator-dot',
    },
  ] as const;

  // Everything React renders as nothing. `0` is deliberately absent: it
  // renders the visible text "0", so it IS content and must replace the mark.
  const emptyValues = [
    ['false — the `isBusy && …` idiom', false],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ] as const;

  for (const {name, render: renderCase, markSelector} of cases) {
    for (const [label, child] of emptyValues) {
      it(`${name} keeps its mark when children is ${label}`, () => {
        const {container} = renderCase(child);

        expect(
          container.querySelector(markSelector),
          `${name} lost its mark to a falsy child`,
        ).toBeInTheDocument();
      });
    }

    it(`${name} still lets real children replace the mark`, () => {
      // The negative control: without this, "always render the mark" would
      // pass every case above and break the busy state instead.
      const {container} = renderCase(<span data-testid="busy" />);

      expect(
        container.querySelector('[data-testid="busy"]'),
      ).toBeInTheDocument();
      expect(container.querySelector(markSelector)).not.toBeInTheDocument();
    });
  }

  it('treats 0 as content, not as empty', () => {
    // isRenderable's documented edge: 0 renders the character "0".
    const {container} = render(
      <CheckIndicator state="checked">{0}</CheckIndicator>,
    );

    expect(container.textContent).toBe('0');
    expect(container.querySelector('.astryx-icon')).not.toBeInTheDocument();
  });
});

/**
 * An indicator is decorative BY CONTRACT: the owning control supplies the role
 * and the accessible name, so an indicator that is also announced says the same
 * thing twice (#4918).
 *
 * The contract is held in two places, because neither covers the whole thing:
 *
 *   - `IndicatorProps` omits the a11y props, which makes `role` a compile
 *     error. It does NOT make `aria-hidden` one: TypeScript exempts JSX
 *     attribute names that are not valid JS identifiers from excess-property
 *     checking, so anything hyphenated slips through. That is a language rule,
 *     not a gap in our types — the second test below is the proof, and it will
 *     start failing the day TS changes its mind, which is when we can drop the
 *     ordering.
 *   - So each component emits its own `aria-hidden` AFTER `{...rest}`, which is
 *     what actually keeps a caller from un-hiding it. Nothing is stripped.
 */
describe('the decorative contract (#4918)', () => {
  it('rejects `role` and `tabIndex` at compile time', () => {
    // Both are valid JS identifiers, so excess-property checking applies and
    // the type alone is enough — no runtime guard needed. `tabIndex` matters
    // because the element is unconditionally aria-hidden: a tab stop on it is
    // a focusable node in a hidden subtree (axe `aria-hidden-focus`).
    const rejected = [
      // @ts-expect-error — the owning control holds the role.
      <CheckIndicator key="a" state="checked" role="checkbox" />,
      // @ts-expect-error — the owning control holds the focus.
      <CheckboxIndicator key="b" state="checked" tabIndex={0} />,
    ];

    expect(rejected).toHaveLength(2);
  });

  it('cannot reject a hyphenated a11y attribute — TS exempts those', () => {
    // NO @ts-expect-error here, deliberately: this compiles, and the comment
    // above explains why. Runtime order is what makes it harmless.
    const accepted = <CheckIndicator state="checked" aria-label="inert" />;

    expect(accepted).toBeTruthy();
  });

  it('cannot reject a SPREAD either — which is the ordinary host idiom', () => {
    // Also no @ts-expect-error, also deliberate. A spread bypasses
    // excess-property checking for every member, so even `role` and `tabIndex`
    // — the two the type catches as literals — get through this way.
    //
    // Left alone on purpose. Nothing in the repo spreads a hostile object at an
    // indicator, `aria-hidden` is settled by attribute order regardless, and a
    // forwarded `role`/`aria-label` is inert inside a hidden subtree. Guarding
    // it at runtime would cost a module to defend a case no call site reaches.
    const hostile = {role: 'checkbox', tabIndex: 0};
    const accepted = <CheckIndicator state="checked" {...hostile} />;

    expect(accepted).toBeTruthy();
  });

  const cases = [
    {
      name: 'CheckIndicator (glyph path)',
      render: (p: Record<string, unknown>) => (
        <CheckIndicator state="checked" {...p} />
      ),
    },
    {
      name: 'CheckIndicator (children path)',
      render: (p: Record<string, unknown>) => (
        <CheckIndicator state="checked" {...p}>
          <b />
        </CheckIndicator>
      ),
    },
    {
      name: 'CheckboxIndicator',
      render: (p: Record<string, unknown>) => (
        <CheckboxIndicator state="checked" {...p} />
      ),
    },
    {
      name: 'RadioIndicator',
      render: (p: Record<string, unknown>) => (
        <RadioIndicator state="checked" {...p} />
      ),
    },
  ] as const;

  for (const {name, render: renderCase} of cases) {
    it(`${name} stays aria-hidden even when a caller passes false`, () => {
      const {container} = render(renderCase({'aria-hidden': 'false'}));

      expect(container.firstElementChild).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    it(`${name} still forwards ordinary props`, () => {
      // The negative control: order must not turn into "drop everything".
      const {container} = render(
        renderCase({'data-testid': 'ind', id: 'pinned', dir: 'rtl'}),
      );
      const el = container.firstElementChild;

      expect(el).toHaveAttribute('data-testid', 'ind');
      expect(el).toHaveAttribute('id', 'pinned');
      expect(el).toHaveAttribute('dir', 'rtl');
    });
  }
});

describe('useIndicator', () => {
  it('returns the built-in indicator without a theme override', () => {
    const {result} = renderHook(() => useIndicator('checkbox'));

    expect(result.current).toBe(CheckboxIndicator);
  });

  it('resolves an indicator component from the nearest theme', () => {
    function BrandCheckbox({state}: IndicatorProps) {
      return <span data-testid="brand">{state}</span>;
    }
    const theme = defineTheme({
      name: 'brand-indicators',
      indicators: {checkbox: BrandCheckbox},
    });

    const {result} = renderHook(() => useIndicator('checkbox'), {
      wrapper: createThemeWrapper(theme),
    });

    expect(result.current).toBe(BrandCheckbox);
    // Unmapped indicators keep the built-in.
    expect(getIndicator('radio', theme)).toBe(RadioIndicator);
  });
});

/** Canonical target names are the only component classes emitted in 0.7. */
describe('indicator theme target names', () => {
  const cases = [
    {
      name: 'CheckboxIndicator',
      render: () => <CheckboxIndicator state="checked" />,
      current: 'astryx-checkbox-indicator',
      removed: 'astryx-checkbox',
    },
    {
      name: 'RadioIndicator',
      render: () => <RadioIndicator state="checked" />,
      current: 'astryx-radio-indicator',
      removed: 'astryx-radio',
    },
  ] as const;

  for (const {name, render: renderCase, current, removed} of cases) {
    it(`${name} emits only the canonical target`, () => {
      const {container} = render(renderCase());
      const el = container.querySelector(`.${current}`);
      expect(el, `${name} should render ${current}`).toBeInTheDocument();
      expect(el, `${name} must not render ${removed}`).not.toHaveClass(removed);
    });
  }

  it('uses only the canonical dot target on the radio mark', () => {
    const {container} = render(<RadioIndicator state="checked" />);
    const dot = container.querySelector('.astryx-radio-indicator-dot');
    expect(dot).toBeInTheDocument();
    expect(dot).not.toHaveClass('astryx-radio-dot');
  });

  it('renders one canonical checkbox target element', () => {
    const {container} = render(<CheckboxIndicator state="unchecked" />);
    expect(
      container.querySelectorAll('.astryx-checkbox-indicator'),
    ).toHaveLength(1);
    expect(container.querySelector('.astryx-checkbox')).toBeNull();
  });
});
