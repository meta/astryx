// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InputClearButton.test.tsx
 * @input Uses node:fs, node:path, vitest, @testing-library/react, @stylexjs/stylex,
 *   InputClearButton, Icon and the global icon registry, theme, and the shared
 *   declaredValue StyleX read-back helper
 * @output Unit tests for the shared clear-button primitive
 * @position Testing; validates InputClearButton.tsx — the single home for the
 *   clearable input family's clear (✕) affordance and its theme target. Covers
 *   the accessible name, contextual hover tooltip, click callback, decorative
 *   registry glyph, both theme targets, touch hit area, and xstyle forwarding.
 *
 * SYNC: When InputClearButton.tsx changes, update tests to match new behavior.
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {
  InputClearButton,
  InternalInputClearButton,
  type InputClearButtonProps,
} from './InputClearButton';
import {Icon, registerIcons, resetIcons} from '../Icon';
import {InternationalizationProvider} from '../i18n';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {declaredValue} from '../__tests__/stylexDeclarations';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

interface InjectedRule {
  selector: string;
  text: string;
  media: string | null;
}

/**
 * Every style rule StyleX has injected at runtime (`runtimeInjection` in the
 * root vitest config), flattened out of any at-rule wrapper and tagged with
 * that wrapper's condition — so a `@media (pointer: coarse)` rule stays
 * distinguishable from the unconditional one.
 */
function injectedRules(): InjectedRule[] {
  const walk = (rules: CSSRuleList, condition: string | null) =>
    [...rules].flatMap((rule): InjectedRule[] => {
      const {selectorText} = rule as CSSStyleRule;
      if (typeof selectorText === 'string') {
        return [{selector: selectorText, text: rule.cssText, media: condition}];
      }
      // A grouping rule (@media, @keyframes, ...): descend, carrying the
      // innermost condition down. jsdom hangs an empty `cssRules` off plain
      // style rules too, which is why the leaf check comes first.
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested == null) {
        return [];
      }
      const own = (rule as CSSMediaRule).media?.mediaText;
      return walk(nested, own != null && own !== '' ? own : condition);
    });

  return [...document.styleSheets].flatMap(sheet => walk(sheet.cssRules, null));
}

const getGlyph = (): HTMLElement => {
  const button = screen.getByRole('button', {name: 'Clear'});
  const icon = button.querySelector('.astryx-icon');
  if (icon == null) {
    throw new Error('clear glyph not found');
  }
  return icon as HTMLElement;
};

const testStyles = stylex.create({
  wide: {width: '999px'},
});

describe('InputClearButton public props', () => {
  it('keep popup invoker handlers internal', () => {
    const hasPointerDown: 'onPointerDown' extends keyof InputClearButtonProps
      ? true
      : false = false;
    const hasClickCapture: 'onClickCapture' extends keyof InputClearButtonProps
      ? true
      : false = false;

    expect(hasPointerDown).toBe(false);
    expect(hasClickCapture).toBe(false);
  });
});

describe('InputClearButton', () => {
  it('shows a generic "Clear" tooltip while the accessible name keeps the field label', async () => {
    // A long field label repeated in the tooltip reads as awkward copy
    // ("Clear Assigned engineering partner"); the field's own label already
    // sits beside the glyph. The contextual name stays for assistive tech.
    const showPopover = vi.spyOn(HTMLElement.prototype, 'showPopover');
    render(
      <InputClearButton
        label="Clear Assigned engineering partner"
        onClick={() => {}}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Clear Assigned engineering partner',
    });
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    expect(tooltip).toHaveTextContent(/^Clear$/);
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);

    fireEvent.mouseEnter(button);
    await waitFor(() => expect(showPopover).toHaveBeenCalled());
    showPopover.mockRestore();
  });

  it('localizes the tooltip through the catalog', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.inputClearButton.tooltip': 'Leeren'}}}>
        <InputClearButton label="Suche leeren" onClick={() => {}} />
      </InternationalizationProvider>,
    );
    expect(screen.getByRole('button', {name: 'Suche leeren'})).toBeTruthy();
    expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
      /^Leeren$/,
    );
  });

  it('renders a real button with the given accessible label', () => {
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    const button = screen.getByRole('button', {name: 'Clear'});
    expect(button.tagName).toBe('BUTTON');
  });

  it('renders no visible text so the button stays icon-only', () => {
    // `label` is the accessible name only: Button's isIconOnly drops the
    // visible label span, so the affordance keeps its square glyph footprint.
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    expect(screen.getByRole('button', {name: 'Clear'}).textContent).toBe('');
  });

  it('fires onClick with the native event when pressed', () => {
    const onClick = vi.fn();
    render(<InputClearButton label="Clear" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', {name: 'Clear'}));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toMatchObject({type: 'click'});
  });

  it('renders the astryx-input-clear-icon target on the glyph', () => {
    // One canonical target on the icon element itself — so a theme restyles
    // the clear glyph across the whole input family from a single place.
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    const glyph = getGlyph();
    expect(glyph).toHaveClass('astryx-input-clear-icon');
    expect(glyph).toHaveClass('astryx-icon');
  });

  it('matches a standalone inherit/sm close icon aside from the target class', () => {
    // The glyph is a secondary/sm close icon (matching the other field
    // affordances — chevrons, calendar toggles, status icons); aside from the
    // target class it is exactly that standalone Icon, so the default look is
    // defined once here rather than per input.
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    const glyph = getGlyph();

    const {container} = render(
      <Icon icon="close" size="sm" color="secondary" />,
    );
    const refIcon = container.querySelector('.astryx-icon') as HTMLElement;

    const styleClasses = (el: HTMLElement) =>
      el.className
        .split(' ')
        .filter(c => c !== 'astryx-input-clear-icon')
        .sort();

    expect(styleClasses(glyph)).toEqual(styleClasses(refIcon));
  });

  it('hides the glyph from assistive tech so the label is the whole name', () => {
    // The Icon carries no label of its own, so it stays decorative and never
    // duplicates or dilutes the button's announcement.
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    expect(getGlyph()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button')).toHaveAccessibleName('Clear');
  });

  it('merges a consumer iconClassName beside the canonical target', () => {
    render(
      <InputClearButton
        label="Clear"
        onClick={() => {}}
        iconClassName="consumer-clear-icon"
      />,
    );
    const glyph = getGlyph();
    expect(glyph).toHaveClass('astryx-input-clear-icon');
    expect(glyph).toHaveClass('consumer-clear-icon');
  });

  it('exposes input-clear-icon so a theme reaches the glyph color, size, and hover', () => {
    const theme = defineTheme({
      name: 'input-clear-icon-test',
      components: {
        'input-clear-icon': {
          base: {
            width: '12px',
            height: '12px',
            fontSize: '12px',
            color: 'var(--color-icon-secondary)',
            ':hover': {color: 'var(--color-icon-primary)'},
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-input-clear-icon {');
    expect(css).toContain('width: 12px');
    expect(css).toContain('.astryx-input-clear-icon:hover');
    expect(css).toContain('color: var(--color-icon-primary)');
  });

  it('renders the astryx-input-clear-button target on the button wrapper', () => {
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    const button = screen.getByRole('button', {name: 'Clear'});
    expect(button).toHaveClass('astryx-input-clear-button');
  });

  it('keeps its own 20px height when no xstyle is given', () => {
    // The button pins a 20px box of its own (tighter than Button's sm
    // default); the coarse-pointer overlay below grows the hit area from it.
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    expect(declaredValue(screen.getByRole('button'), 'height')).toBe('20px');
  });

  it('applies the caller xstyle to the button', () => {
    render(
      <InputClearButton
        label="Clear"
        onClick={() => {}}
        xstyle={testStyles.wide}
      />,
    );
    expect(declaredValue(screen.getByRole('button'), 'width')).toBe('999px');
  });

  it('grows the hit area to 24px on a coarse pointer only (WCAG 2.5.8 AA)', () => {
    // The visual glyph stays 20px; an ::after overlay expands only the
    // tappable region, and only under a coarse pointer. Asserted against the
    // CSS StyleX injects at runtime, because jsdom resolves neither media
    // queries nor pseudo-element boxes.
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    const button = screen.getByRole('button', {name: 'Clear'});
    const classes = new Set(button.className.split(' ').filter(Boolean));

    const css = injectedRules();
    const rulesForButton = css.filter(({selector}) =>
      [...classes].some(c => selector.includes(`.${c}`)),
    );
    // Guards every assertion below against silently passing if StyleX's
    // runtime injection or the class plumbing ever changes shape.
    expect(rulesForButton.length).toBeGreaterThan(0);

    const decl = (pattern: RegExp, inMedia?: string) =>
      rulesForButton.some(
        ({text, media}) =>
          pattern.test(text) &&
          (inMedia == null ? media == null : (media ?? '').includes(inMedia)),
      );

    // Fine pointer: hit area == the 20px visual glyph, no expansion.
    expect(decl(/--_input-clear-hit-inset\s*:\s*0px/)).toBe(true);
    // Coarse pointer: 20px + 2px on each side = 24x24, the AA floor.
    expect(decl(/--_input-clear-hit-inset\s*:\s*-2px/, 'pointer: coarse')).toBe(
      true,
    );
    // ...and nothing wider than that, which would reach into the adornment
    // gap and the input's caret area. Scoped to the coarse block, because
    // that is the only place a wider value can appear.
    expect(
      decl(
        /--_input-clear-hit-inset\s*:\s*-(?:[3-9]|\d{2,})px/,
        'pointer: coarse',
      ),
    ).toBe(false);
    // The overlay exists only on touch. On a fine pointer a generated
    // ::after would cover the button and take hover away from the glyph
    // target, so `content` is gated the same way the inset is.
    expect(decl(/--_input-clear-hit-content\s*:\s*none/)).toBe(true);
    expect(decl(/--_input-clear-hit-content\s*:\s*""/, 'pointer: coarse')).toBe(
      true,
    );
    // The overlay itself is what carries the expansion, and what is gated.
    expect(
      decl(/::after\s*\{[^}]*inset\s*:\s*var\(--_input-clear-hit-inset\)/),
    ).toBe(true);
    expect(
      decl(/::after\s*\{[^}]*content\s*:\s*var\(--_input-clear-hit-content\)/),
    ).toBe(true);
  });

  it('declares its own containing block for the hit overlay', () => {
    // The ::after overlay must resolve against this button. Button happens to
    // set `position: relative` on itself, so at runtime the overlay is
    // correctly placed either way — and StyleX compiles both declarations to
    // the same atomic class, so the rendered CSS cannot tell the two apart.
    // Assert on the source instead, so a future edit can't quietly leave the
    // overlay depending on another component's internal.
    const source = readFileSync(
      path.resolve(__dirname, './InputClearButton.tsx'),
      'utf-8',
    );
    const buttonStyle = source.match(/button:\s*\{[\s\S]*?\n {2}\},/)?.[0];
    expect(buttonStyle).toBeDefined();
    expect(buttonStyle).toMatch(/position:\s*'relative'/);
  });

  it('exposes input-clear-button so a theme controls the button size and hover', () => {
    const theme = defineTheme({
      name: 'input-clear-button-test',
      components: {
        'input-clear-button': {
          base: {
            height: '28px',
            ':hover': {backgroundImage: 'none'},
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-input-clear-button {');
    expect(css).toContain('height: 28px');
    expect(css).toContain('.astryx-input-clear-button:hover');
    expect(css).toContain('background-image: none');
  });
});

describe('InputClearButton glyph source', () => {
  afterEach(() => {
    resetIcons();
  });

  it('renders the close glyph from the global icon registry', () => {
    // The glyph is resolved by name, so a consumer that swaps the icon set via
    // registerIcons() gets its own close glyph in every clearable input.
    registerIcons({
      close: (
        <svg data-testid="custom-close">
          <path d="M0 0" />
        </svg>
      ),
    });
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    expect(getGlyph()).toContainElement(screen.getByTestId('custom-close'));
  });
});

describe('InputClearButton pointer and focus interactions', () => {
  it('prevents default on pointerdown and mousedown to keep focus on input', () => {
    render(<InputClearButton label="Clear" onClick={() => {}} />);
    const button = screen.getByRole('button', {name: 'Clear'});

    const pointerDownEvent = fireEvent.pointerDown(button);
    expect(pointerDownEvent).toBe(false);

    const mouseDownEvent = fireEvent.mouseDown(button);
    expect(mouseDownEvent).toBe(false);
  });

  it('composes custom onPointerDown while preventing default in InternalInputClearButton', () => {
    const handlePointerDown = vi.fn();
    render(
      <InternalInputClearButton
        label="Clear"
        onClick={() => {}}
        onPointerDown={handlePointerDown}
        onClickCapture={() => {}}
      />,
    );
    const button = screen.getByRole('button', {name: 'Clear'});
    const pointerDownEvent = fireEvent.pointerDown(button);

    expect(handlePointerDown).toHaveBeenCalledTimes(1);
    expect(pointerDownEvent).toBe(false);
  });
});
