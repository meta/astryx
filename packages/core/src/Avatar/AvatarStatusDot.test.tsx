// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {Avatar} from './Avatar';
import {AvatarStatusDot, type AvatarStatusDotVariant} from './AvatarStatusDot';

const GLYPH_SELECTOR = '.astryx-avatar-status-dot-glyph';
const DOT_SELECTOR = '.astryx-avatar-status-dot';

/**
 * Renders an AvatarStatusDot inside an Avatar of the given numeric size and
 * returns the dot root element. Size tiers: <=36 -> 10px dot (no icons),
 * 40-72 -> 20px dot, >=96 -> 32px dot.
 */
function renderDot(
  dotProps: React.ComponentProps<typeof AvatarStatusDot>,
  avatarSize: 36 | 48 | 128 = 48,
) {
  const {container} = render(
    <Avatar
      name="Ada Lovelace"
      size={avatarSize}
      status={<AvatarStatusDot {...dotProps} />}
    />,
  );
  const dot = container.querySelector(DOT_SELECTOR);
  expect(dot).not.toBeNull();
  return dot as HTMLElement;
}

describe('AvatarStatusDot', () => {
  describe('shape glyphs (WCAG 1.4.1 — colour is not the only signal)', () => {
    it('renders no glyph for success: the plain filled dot is the reference shape', () => {
      const dot = renderDot({variant: 'success'});
      expect(dot.querySelector(GLYPH_SELECTOR)).toBeNull();
    });

    it('renders a ring glyph for neutral', () => {
      const dot = renderDot({variant: 'neutral'});
      const glyph = dot.querySelector(GLYPH_SELECTOR);
      expect(glyph).not.toBeNull();
      expect(glyph).toHaveAttribute('data-shape', 'ring');
    });

    it('renders a minus glyph for error', () => {
      const dot = renderDot({variant: 'error'});
      const glyph = dot.querySelector(GLYPH_SELECTOR);
      expect(glyph).not.toBeNull();
      expect(glyph).toHaveAttribute('data-shape', 'minus');
    });

    it('hides the glyph from assistive tech: it is a visual redundancy of the status', () => {
      const dot = renderDot({variant: 'error'});
      expect(dot.querySelector(GLYPH_SELECTOR)).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    });

    it('renders glyphs at every size tier', () => {
      for (const size of [36, 48, 128] as const) {
        const dot = renderDot({variant: 'neutral'}, size);
        expect(dot.querySelector(GLYPH_SELECTOR)).not.toBeNull();
      }
    });

    it('draws the glyph as an inline svg sized to the dot inner field', () => {
      // The glyph is a stroked <svg>, matching how the rest of the system
      // draws marks (Icon's defaultIcons, the CheckboxInput checkmark).
      // Its viewBox is 1 user unit per px of the dot's inner field
      // (dot minus both borders), so stroke widths below are literal px.
      const cases = [
        [36, 8],
        [48, 16],
        [128, 24],
      ] as const;
      for (const [avatarSize, field] of cases) {
        const glyph = renderDot({variant: 'neutral'}, avatarSize).querySelector(
          GLYPH_SELECTOR,
        ) as SVGElement;
        expect(glyph.tagName.toLowerCase(), `avatar ${avatarSize}`).toBe('svg');
        expect(glyph.getAttribute('viewBox'), `avatar ${avatarSize}`).toBe(
          `0 0 ${field} ${field}`,
        );
        expect(glyph.getAttribute('width'), `avatar ${avatarSize}`).toBe(
          String(field),
        );
        expect(glyph.getAttribute('height'), `avatar ${avatarSize}`).toBe(
          String(field),
        );
      }
    });

    it('strokes the ring at the system glyph weight, not a quarter of the field', () => {
      // stroke ~= field / 12, floored at 1px for the smallest tier, which
      // puts these on the icon family's 1 / 1.5 / 2 ladder (~6-12% of the
      // field) instead of the 25% band a CSS box cutout produced.
      const cases = [
        // avatar size, field, stroke, radius = (field - stroke) / 2
        [36, 8, 1, 3.5],
        [48, 16, 1.5, 7.25],
        [128, 24, 2, 11],
      ] as const;
      for (const [avatarSize, field, stroke, radius] of cases) {
        const circle = renderDot(
          {variant: 'neutral'},
          avatarSize,
        ).querySelector(`${GLYPH_SELECTOR} circle`) as SVGCircleElement;
        expect(circle, `avatar ${avatarSize}`).not.toBeNull();
        expect(
          circle.getAttribute('stroke-width'),
          `avatar ${avatarSize}`,
        ).toBe(String(stroke));
        // Radius is to the stroke centreline, so the ring's outer edge lands
        // exactly on the inner field and never clips against the border.
        expect(circle.getAttribute('r'), `avatar ${avatarSize}`).toBe(
          String(radius),
        );
        expect(circle.getAttribute('cx'), `avatar ${avatarSize}`).toBe(
          String(field / 2),
        );
        expect(circle.getAttribute('cy'), `avatar ${avatarSize}`).toBe(
          String(field / 2),
        );
        expect(circle.getAttribute('fill'), `avatar ${avatarSize}`).toBe(
          'none',
        );
      }
    });

    it('strokes the minus bar at the same weight, spanning 75% of the field with round caps', () => {
      // Ends are inset by half the stroke so the round caps land inside the
      // 75% span rather than overhanging it.
      const cases = [
        // avatar size, field, stroke, x1, x2
        [36, 8, 1, 1.5, 6.5],
        [48, 16, 1.5, 2.75, 13.25],
        [128, 24, 2, 4, 20],
      ] as const;
      for (const [avatarSize, field, stroke, x1, x2] of cases) {
        const line = renderDot({variant: 'error'}, avatarSize).querySelector(
          `${GLYPH_SELECTOR} line`,
        ) as SVGLineElement;
        expect(line, `avatar ${avatarSize}`).not.toBeNull();
        expect(line.getAttribute('stroke-width'), `avatar ${avatarSize}`).toBe(
          String(stroke),
        );
        expect(line.getAttribute('x1'), `avatar ${avatarSize}`).toBe(
          String(x1),
        );
        expect(line.getAttribute('x2'), `avatar ${avatarSize}`).toBe(
          String(x2),
        );
        expect(line.getAttribute('y1'), `avatar ${avatarSize}`).toBe(
          String(field / 2),
        );
        expect(line.getAttribute('y2'), `avatar ${avatarSize}`).toBe(
          String(field / 2),
        );
        expect(
          line.getAttribute('stroke-linecap'),
          `avatar ${avatarSize}`,
        ).toBe('round');
      }
    });

    it('paints both glyphs from currentColor so the dot owns the ink colour', () => {
      for (const variant of ['neutral', 'error'] as const) {
        const mark = renderDot({variant}, 48).querySelector(
          `${GLYPH_SELECTOR} circle, ${GLYPH_SELECTOR} line`,
        ) as SVGElement;
        expect(mark.getAttribute('stroke'), variant).toBe('currentColor');
      }
    });

    it('fills the ring variant with surface and inks it with the variant colour', () => {
      // A ring only reads as hollow if its interior is not the variant
      // colour, so `neutral` inverts: surface fill, coloured stroke.
      // StyleX atomic classes are deterministic, so a local probe pins it.
      const probe = stylex.create({
        ring: {
          backgroundColor: colorVars['--color-background-surface'],
          color: colorVars['--color-text-secondary'],
        },
      });
      const dot = renderDot({variant: 'neutral'}, 48);
      const atomicClasses = (stylex.props(probe.ring).className ?? '')
        .split(' ')
        // Dev mode prepends a per-file `File__style.key` debug class that
        // legitimately differs between the probe and the component.
        .filter(cls => !cls.includes('__'));
      expect(atomicClasses.length).toBeGreaterThan(0);
      for (const cls of atomicClasses) {
        expect(dot.className).toContain(cls);
      }
    });

    it('uses each filled status plate matching on-fill ink role', () => {
      const probe = stylex.create({
        successInk: {color: colorVars['--color-on-success']},
        errorInk: {color: colorVars['--color-on-error']},
      });
      const cases = [
        ['success', probe.successInk],
        ['error', probe.errorInk],
      ] as const;

      for (const [variant, ink] of cases) {
        const inkClasses = (stylex.props(ink).className ?? '')
          .split(' ')
          .filter(cls => !cls.includes('__'));
        expect(inkClasses.length).toBeGreaterThan(0);
        const dot = renderDot({variant}, 48);
        for (const cls of inkClasses) {
          expect(dot.className).toContain(cls);
        }
      }
    });

    it('lets a user icon inherit the dot ink instead of hard-coding surface', () => {
      // Surface ink on the surface-filled ring variant would be invisible.
      const probe = stylex.create({
        surfaceInk: {color: colorVars['--color-background-surface']},
      });
      renderDot(
        {variant: 'neutral', icon: <svg data-testid="user-icon" />},
        48,
      );
      const iconWrapper = screen.getByTestId('user-icon')
        .parentElement as HTMLElement;
      const surfaceInkClasses = (stylex.props(probe.surfaceInk).className ?? '')
        .split(' ')
        .filter(cls => !cls.includes('__'));
      expect(surfaceInkClasses.length).toBeGreaterThan(0);
      for (const cls of surfaceInkClasses) {
        expect(iconWrapper.className).not.toContain(cls);
      }
    });

    it('renders no glyph for custom augmented variants (documented: they must bring their own non-colour mark)', () => {
      const dot = renderDot({variant: 'away' as AvatarStatusDotVariant});
      expect(dot.querySelector(GLYPH_SELECTOR)).toBeNull();
    });
  });

  describe('glyph and icon interplay', () => {
    it('suppresses the glyph when a user icon renders: the icon is the non-colour mark', () => {
      const dot = renderDot(
        {variant: 'error', icon: <svg data-testid="user-icon" />},
        48,
      );
      expect(screen.getByTestId('user-icon')).toBeInTheDocument();
      expect(dot.querySelector(GLYPH_SELECTOR)).toBeNull();
    });

    it('keeps the glyph at the smallest tier where icons never render', () => {
      const dot = renderDot(
        {variant: 'error', icon: <svg data-testid="user-icon" />},
        36,
      );
      expect(screen.queryByTestId('user-icon')).not.toBeInTheDocument();
      expect(dot.querySelector(GLYPH_SELECTOR)).not.toBeNull();
    });

    it('keeps the glyph for non-renderable icons: booleans from `cond && <Icon />` render nothing', () => {
      for (const nonRenderable of [true, false, ''] as const) {
        const dot = renderDot({variant: 'error', icon: nonRenderable}, 48);
        expect(
          dot.querySelector(GLYPH_SELECTOR),
          `icon={${JSON.stringify(nonRenderable)}}`,
        ).not.toBeNull();
      }
    });
  });

  describe('existing contract', () => {
    it('exposes role="img" with the label as accessible name when label is provided', () => {
      const dot = renderDot({variant: 'success', label: 'Online'});
      expect(dot).toHaveAttribute('role', 'img');
      expect(dot).toHaveAttribute('aria-label', 'Online');
    });

    it('has no img role without a label', () => {
      const dot = renderDot({variant: 'success'});
      expect(dot).not.toHaveAttribute('role');
    });

    it('reflects the variant as a data attribute for theming', () => {
      const dot = renderDot({variant: 'neutral'});
      expect(dot).toHaveAttribute('data-variant', 'neutral');
    });

    it('renders the user icon at tiers with room for it, hidden from assistive tech', () => {
      renderDot(
        {variant: 'success', icon: <svg data-testid="user-icon" />},
        128,
      );
      const icon = screen.getByTestId('user-icon');
      expect(icon).toBeInTheDocument();
      expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
