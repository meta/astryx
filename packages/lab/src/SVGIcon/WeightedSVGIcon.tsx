// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file WeightedSVGIcon.tsx
 * @input A WeightedIconDef (one drawing per weight range), size, color
 * @output An SVG icon whose drawing follows the surrounding font-weight, inline or from a sprite
 * @position Weight-responsive variant of the lab SVG icon system
 *
 * All drawings of an icon live in one SVG; CSS shows the one whose weight
 * range contains the current font weight. The weight comes from the text
 * around the icon, read by a 1ch-wide probe container (see weightProbe.ts
 * and weighted.stylex.ts), so an icon inside bold text draws its bold
 * drawing with no prop. `weight` pins it, and an ancestor can set
 * `--astryx-icon-weight` to pin a subtree.
 *
 * DOM: a fixed-size box > the probe container (1ch wide, overflowing) > svg.
 *
 * Sprite mode: render `WeightedIconSprite` once with the icons a page uses,
 * then pass `sprite` to each icon. Each instance is then a `<use>`
 * reference, so a repeated icon's drawings are on the page once.
 */

import type {CSSProperties, SVGProps} from 'react';
import * as stylex from '@stylexjs/stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {iconVars} from './tokens.stylex';
import {iconColorStyles} from './colors.stylex';
import {iconA11yProps} from './iconA11y';
import {opticalSize} from './variations.stylex';
import {weightProbeStyles, weightRanges} from './weighted.stylex';
import {registerWeightProbe} from './weightProbe';
import type {
  IconWeight,
  WeightedIconDef,
  WeightedIconLayer,
} from './buildWeightedIcon';
import type {SVGIconColor, SVGIconSize} from './SVGIcon';

export interface WeightedSVGIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'color'
> {
  /** The icon: one drawing per weight range. */
  icon: WeightedIconDef;
  /**
   * Icon size.
   * @default 'md'
   */
  size?: SVGIconSize;
  /**
   * Semantic color.
   * @default 'primary'
   */
  color?: SVGIconColor;
  /**
   * Pin the drawing to one weight instead of following the surrounding
   * font-weight.
   */
  weight?: IconWeight;
  /**
   * Reference the icon's symbol from a `WeightedIconSprite` on the page
   * instead of drawing it inline.
   * @default false
   */
  sprite?: boolean;
}

export interface WeightedIconSpriteProps {
  /** Every icon the page references with `sprite`. */
  icons: readonly WeightedIconDef[];
}

const styles = stylex.create({
  // The fixed-size box. The probe must be the first font so `1ch` reflects
  // the font weight; icons draw no text, so this changes nothing visible.
  root: {
    display: 'inline-flex',
    flexShrink: 0,
    width: iconVars['--icon-size'],
    height: iconVars['--icon-size'],
    // The probe's text sets this box's baseline. Centering it keeps the icon
    // where SVGIcon sits in running text and leaves the line where it was.
    verticalAlign: 'middle',
    fontFamily: 'AstryxWeightProbe',
    fontSynthesis: 'none',
    // The probe can be wider than the box; it must not add scrollable
    // overflow to the page.
    overflow: 'clip',
  },
  svg: {
    display: 'block',
    flexShrink: 0,
    width: iconVars['--icon-size'],
    height: iconVars['--icon-size'],
    fill: 'currentColor',
  },
  sprite: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
});

type RangeKey = keyof typeof weightRanges;

function Layer({layer}: {layer: WeightedIconLayer}) {
  const key = `r${layer.from}_${layer.to}` as RangeKey;
  return (
    <g {...stylex.props(weightRanges[key])}>
      {layer.paths.map((path, i) => (
        <path
          key={i}
          d={path.d}
          fillRule={path.evenOdd === true ? 'evenodd' : undefined}
        />
      ))}
    </g>
  );
}

/** The id of an icon's sprite symbol. */
export function weightedIconSymbolId(icon: WeightedIconDef): string {
  return `astryx-weighted-icon-${icon.name}`;
}

/**
 * Renders each icon's drawings once as hidden `<symbol>`s for icons that
 * pass `sprite`. Render it once per page, before or after the icons.
 */
export function WeightedIconSprite({icons}: WeightedIconSpriteProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
      {...stylex.props(styles.sprite)}>
      {icons.map(icon => (
        <symbol
          key={icon.name}
          id={weightedIconSymbolId(icon)}
          viewBox={icon.viewBox ?? '0 0 24 24'}>
          {icon.layers.map(layer => (
            <Layer key={`${layer.from}-${layer.to}`} layer={layer} />
          ))}
        </symbol>
      ))}
    </svg>
  );
}

/** Adds the probe font to the document the icon renders into. */
function installWeightProbe(node: HTMLSpanElement | null): void {
  if (node != null) {
    registerWeightProbe(node.ownerDocument);
  }
}

/**
 * SVG icon whose drawing follows the surrounding font-weight.
 *
 * @example
 * ```
 * <Text weight="bold"><WeightedSVGIcon icon={bellWeighted} color="inherit" /> Alerts</Text>
 * ```
 */
export function WeightedSVGIcon({
  icon,
  size = 'md',
  color = 'primary',
  weight,
  sprite = false,
  className,
  style,
  ...props
}: WeightedSVGIconProps) {
  const a11yProps = iconA11yProps(props);

  const pinnedStyle: Record<string, string> | undefined =
    weight != null ? {'--astryx-icon-weight': String(weight)} : undefined;

  return (
    <span
      ref={installWeightProbe}
      {...mergeProps(
        themeProps('weighted-svg-icon', {size, color}),
        stylex.props(styles.root, iconColorStyles[color], opticalSize[size]),
      )}>
      <span {...stylex.props(weightProbeStyles.probe)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox={icon.viewBox ?? '0 0 24 24'}
          {...a11yProps}
          {...props}
          {...mergeProps(
            stylex.props(styles.svg, weightProbeStyles.svg),
            className,
            {...pinnedStyle, ...(style as CSSProperties)},
          )}>
          {sprite ? (
            <use href={`#${weightedIconSymbolId(icon)}`} />
          ) : (
            icon.layers.map(layer => (
              <Layer key={`${layer.from}-${layer.to}`} layer={layer} />
            ))
          )}
        </svg>
      </span>
    </span>
  );
}
