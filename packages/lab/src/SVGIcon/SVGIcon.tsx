// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SVGIcon.tsx
 * @input SVG path data with per-element roles, variation preset, size, color
 * @output CSS-variable-driven SVG icon with role-aware rendering and mask-based gaps
 * @position Core implementation for the lab SVG icon system
 *
 * Two key concepts beyond basic CSS-var-driven icons:
 *
 * 1. Path roles — each element is either "fill" (closed shapes that switch between
 *    stroke and fill across variations) or "stroke" (lines that always stay stroked).
 *
 * 2. Mask-based gaps — in bold/filled mode, overlapping fill-role shapes get
 *    auto-generated SVG masks. Secondary fill shapes are knocked out of primary
 *    shapes with a configurable gap and corner rounding, producing clean negative
 *    space on any background.
 */

import {type CSSProperties, type SVGProps, useId} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import {iconVars} from './tokens.stylex';
import {variations, opticalSize} from './variations.stylex';
import {themeProps} from '@astryxdesign/core/utils';

// =============================================================================
// Types
// =============================================================================

export type SVGIconVariation =
  'linear' | 'bold' | 'twotone' | 'bulk' | 'broken';
export type SVGIconSize = 'xsm' | 'sm' | 'md' | 'lg';
export type SVGIconColor =
  | 'primary'
  | 'secondary'
  | 'disabled'
  | 'accent'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'inherit';

/**
 * Role determines how an element behaves across variations.
 * - "fill": closed shapes — stroked in linear, filled in bold
 * - "stroke": lines/detail strokes — always rendered as strokes
 */
export type IconShapeRole = 'fill' | 'stroke';

/** Shape element within an icon layer */
export interface IconShape {
  /** SVG element type */
  type: 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon';
  /** SVG attributes for this shape (d, cx, cy, r, points, x1, y1, etc.) */
  attrs: Record<string, string>;
  /**
   * How this element behaves across variations.
   * @default 'fill'
   */
  role?: IconShapeRole;
}

/** Definition of an SVG icon's geometry */
export interface SVGIconDef {
  /** Display name */
  name: string;
  /** ViewBox dimensions (default: "0 0 24 24") */
  viewBox?: string;
  /** Primary layer shapes (main outlines) */
  primary: IconShape[];
  /** Secondary layer shapes (detail elements) */
  secondary?: IconShape[];
}

export interface SVGIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** The icon definition containing path data */
  icon: SVGIconDef;
  /**
   * Visual variation preset.
   * @default 'linear'
   */
  variation?: SVGIconVariation;
  /**
   * Icon size with optical stroke compensation.
   * @default 'md'
   */
  size?: SVGIconSize;
  /**
   * Semantic color.
   * @default 'primary'
   */
  color?: SVGIconColor;
  /** Override stroke width (bypasses optical compensation). */
  strokeWidth?: number;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    flexShrink: 0,
    width: iconVars['--icon-size'],
    height: iconVars['--icon-size'],
    paddingInlineStart: iconVars['--icon-inline-offset'],
    paddingBlockStart: iconVars['--icon-block-offset'],
  },
});

const colorStyles = stylex.create({
  primary: {color: colorVars['--color-icon-primary']},
  secondary: {color: colorVars['--color-icon-secondary']},
  disabled: {color: colorVars['--color-icon-disabled']},
  accent: {color: colorVars['--color-accent']},
  positive: {color: colorVars['--color-icon-success']},
  negative: {color: colorVars['--color-icon-error']},
  warning: {color: colorVars['--color-icon-warning']},
  inherit: {color: 'inherit'},
});

// =============================================================================
// Shape Renderer
// =============================================================================

function renderShapeElement(
  attrs: Record<string, string>,
  type: IconShape['type'],
  key: number | string,
) {
  const props = {...attrs, key};
  switch (type) {
    case 'path':
      return <path {...props} />;
    case 'circle':
      return <circle {...props} />;
    case 'rect':
      return <rect {...props} />;
    case 'line':
      return <line {...props} />;
    case 'polyline':
      return <polyline {...props} />;
    case 'polygon':
      return <polygon {...props} />;
    default:
      return null;
  }
}

// =============================================================================
// Mask Generation
// =============================================================================

/** Check whether bold mode needs a mask for this layer */
function needsMask(
  variation: SVGIconVariation,
  primaryFillShapes: IconShape[],
  secondaryShapes: IconShape[],
): boolean {
  if (variation !== 'bold') {
    return false;
  }
  return primaryFillShapes.length > 0 && secondaryShapes.length > 0;
}

/**
 * Render mask knockout shapes — secondary elements become holes
 * in the primary layer, with gap and corner rounding from CSS vars.
 */
function renderMaskKnockouts(shapes: IconShape[]) {
  return shapes.map((shape, i) => {
    const role = shape.role ?? 'fill';
    // Stroke-role knockouts need wider stroke to fully cover the visible stroke + gap
    // Fill-role knockouts just need the gap width for the border around the hole
    const knockoutWidth =
      role === 'stroke'
        ? `calc(${iconVars['--icon-stroke-width'] as string} + ${iconVars['--icon-gap'] as string} * 2)`
        : (iconVars['--icon-gap'] as string);

    return renderShapeElement(
      {
        ...shape.attrs,
        fill: role === 'fill' ? 'black' : 'none',
        stroke: 'black',
        strokeWidth: knockoutWidth,
        strokeLinecap: 'round',
        strokeLinejoin: iconVars['--icon-gap-linejoin'] as string,
      },
      shape.type,
      `knockout-${i}`,
    );
  });
}

// =============================================================================
// Layer Renderers
// =============================================================================

type LayerPrefix = 'primary' | 'secondary';

function renderFillRoleShapes(
  shapes: IconShape[],
  layer: LayerPrefix,
  maskId?: string,
) {
  const fillVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-fill']
      : iconVars['--icon-layer-secondary-fill'];
  const strokeVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-stroke']
      : iconVars['--icon-layer-secondary-stroke'];
  const opacityVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-opacity']
      : iconVars['--icon-layer-secondary-opacity'];

  if (shapes.length === 0) {
    return null;
  }

  return (
    <g
      style={{
        fill: fillVar as string,
        stroke: strokeVar as string,
        opacity: opacityVar as string,
        strokeWidth: iconVars['--icon-stroke-width'] as string,
        strokeLinecap: iconVars['--icon-stroke-linecap'] as unknown as 'round',
        strokeLinejoin: iconVars[
          '--icon-stroke-linejoin'
        ] as unknown as 'round',
      }}
      mask={maskId ? `url(#${maskId})` : undefined}>
      {shapes.map((shape, i) =>
        renderShapeElement(shape.attrs, shape.type, `${layer}-fill-${i}`),
      )}
    </g>
  );
}

function renderStrokeRoleShapes(shapes: IconShape[], layer: LayerPrefix) {
  const fillVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-stroke-role-fill']
      : iconVars['--icon-layer-secondary-stroke-role-fill'];
  const strokeVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-stroke-role-stroke']
      : iconVars['--icon-layer-secondary-stroke-role-stroke'];
  const opacityVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-stroke-role-opacity']
      : iconVars['--icon-layer-secondary-stroke-role-opacity'];
  const widthVar =
    layer === 'primary'
      ? iconVars['--icon-layer-primary-stroke-role-width']
      : iconVars['--icon-layer-secondary-stroke-role-width'];

  if (shapes.length === 0) {
    return null;
  }

  return (
    <g
      style={{
        fill: fillVar as string,
        stroke: strokeVar as string,
        opacity: opacityVar as string,
        strokeWidth: widthVar as string,
        strokeLinecap: iconVars['--icon-stroke-linecap'] as unknown as 'round',
        strokeLinejoin: iconVars[
          '--icon-stroke-linejoin'
        ] as unknown as 'round',
      }}>
      {shapes.map((shape, i) =>
        renderShapeElement(shape.attrs, shape.type, `${layer}-stroke-${i}`),
      )}
    </g>
  );
}

// =============================================================================
// Component
// =============================================================================

function splitByRole(shapes: IconShape[]): {
  fill: IconShape[];
  stroke: IconShape[];
} {
  const fill: IconShape[] = [];
  const stroke: IconShape[] = [];
  for (const shape of shapes) {
    if (shape.role === 'stroke') {
      stroke.push(shape);
    } else {
      fill.push(shape);
    }
  }
  return {fill, stroke};
}

/**
 * CSS-variable-driven SVG icon with role-aware rendering.
 *
 * Each shape element has a role ("fill" or "stroke") that determines how it
 * behaves across variations. In bold mode, overlapping fill-role shapes get
 * auto-generated SVG masks for clean gap subtraction.
 *
 * @example
 * ```
 * <SVGIcon icon={bellIcon} variation="twotone" size="md" color="accent" />
 * ```
 */
export function SVGIcon({
  icon,
  variation = 'linear',
  size = 'md',
  color = 'primary',
  strokeWidth,
  style,
  ...props
}: SVGIconProps) {
  const uid = useId();
  const viewBox = icon.viewBox ?? '0 0 24 24';
  const hasSecondary = icon.secondary && icon.secondary.length > 0;

  const primarySplit = splitByRole(icon.primary);
  const secondarySplit = hasSecondary
    ? splitByRole(icon.secondary ?? [])
    : {fill: [], stroke: []};

  const allSecondary = [...secondarySplit.fill, ...secondarySplit.stroke];
  const useMask = needsMask(variation, primarySplit.fill, allSecondary);
  const maskId = useMask ? `${uid}-mask` : undefined;

  // Extract raw CSS property name from StyleX var reference: "var(--xABC)" -> "--xABC"
  const strokeWidthProp = (iconVars['--icon-stroke-width'] as string).replace(
    /^var\((.+)\)$/,
    '$1',
  );

  const strokeWidthOverride: Record<string, string> = {
    [strokeWidthProp]: String(strokeWidth),
  };

  const overrideStyle: CSSProperties = {
    ...(style as CSSProperties),
    ...(strokeWidth != null ? strokeWidthOverride : undefined),
  };

  // Decorative by default, meaningful when named — mirroring core Icon's
  // `label` logic. When the consumer passes an accessible name
  // (aria-label / aria-labelledby), expose the svg as role="img" instead of
  // hiding it: an aria-hidden element is removed from the accessibility
  // tree, so its accessible name would be ignored. Spread BEFORE {...props}
  // so an explicit aria-hidden/role from the consumer always wins.
  const hasAccessibleName =
    props['aria-label'] != null || props['aria-labelledby'] != null;
  const a11yProps = hasAccessibleName
    ? ({role: 'img'} as const)
    : ({'aria-hidden': true} as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      {...a11yProps}
      {...mergeProps(
        themeProps('svg-icon', {variation, size, color}),
        stylex.props(
          styles.root,
          colorStyles[color],
          variations[variation],
          opticalSize[size],
        ),
      )}
      style={overrideStyle}
      {...props}>
      {/* Mask definition — knocks secondary fill shapes out of primary */}
      {useMask && (
        <defs>
          <mask id={maskId}>
            <rect width="24" height="24" fill="white" />
            {renderMaskKnockouts([
              ...secondarySplit.fill,
              ...secondarySplit.stroke,
            ])}
          </mask>
        </defs>
      )}

      {/* Primary layer */}
      {renderFillRoleShapes(primarySplit.fill, 'primary', maskId)}
      {renderStrokeRoleShapes(primarySplit.stroke, 'primary')}

      {/* Secondary layer — hidden entirely in bold+mask (all secondaries are knockouts) */}
      {hasSecondary && !useMask && (
        <>
          {renderFillRoleShapes(secondarySplit.fill, 'secondary')}
          {renderStrokeRoleShapes(secondarySplit.stroke, 'secondary')}
        </>
      )}
    </svg>
  );
}

SVGIcon.displayName = 'SVGIcon';
