// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  Children,
  isValidElement,
} from 'react';
import {
  SVGIcon,
  type SVGIconVariation,
  type SVGIconDef,
  type IconShape,
  type IconShapeRole,
} from '@astryxdesign/lab';
import {Stack, Text} from '@astryxdesign/core';
import {defaultIcons} from '../../../packages/core/src/Icon/defaultIcons';
import {rtlAuditParameters} from '../rtl-audit/story-parameters';

// =============================================================================
// Bounding box utilities
// =============================================================================

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rough bounding box from path d attribute (looks at M/L/C coordinate values) */
function estimateBBox(attrs: Record<string, string>, type: string): BBox {
  if (type === 'circle') {
    const cx = Number(attrs.cx || 0),
      cy = Number(attrs.cy || 0),
      r = Number(attrs.r || 0);
    return {x: cx - r, y: cy - r, width: r * 2, height: r * 2};
  }
  if (type === 'rect') {
    return {
      x: Number(attrs.x || 0),
      y: Number(attrs.y || 0),
      width: Number(attrs.width || 0),
      height: Number(attrs.height || 0),
    };
  }
  // For paths/lines, extract all numbers and find bounds
  const d =
    attrs.d ||
    `${attrs.x1 || 0} ${attrs.y1 || 0} ${attrs.x2 || 0} ${attrs.y2 || 0}`;
  const nums = d.match(/-?[\d.]+/g)?.map(Number) || [];
  if (nums.length < 2) {
    return {x: 0, y: 0, width: 24, height: 24};
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i],
      y = nums[i + 1];
    if (x < 100 && y < 100) {
      // filter out large numbers that aren't coords
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!isFinite(minX)) {
    return {x: 0, y: 0, width: 24, height: 24};
  }
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
}

/** Check if box A fully contains box B */
function contains(a: BBox, b: BBox): boolean {
  return (
    a.x <= b.x &&
    a.y <= b.y &&
    a.x + a.width >= b.x + b.width &&
    a.y + a.height >= b.y + b.height
  );
}

function bboxArea(b: BBox): number {
  return b.width * b.height;
}

// =============================================================================
// Auto-converter: JSX SVG → SVGIconDef
// =============================================================================

function jsxSvgToIconDef(
  name: string,
  element: ReactElement,
): SVGIconDef | null {
  if (!element?.props) {
    return null;
  }

  const elementProps = element.props as Record<string, unknown>;
  const children = Children.toArray(elementProps.children as ReactNode).filter(
    isValidElement,
  );
  const isSolid = elementProps.fill === 'currentColor' && !elementProps.stroke;

  const shapes: Array<IconShape & {bbox: BBox}> = [];

  for (const child of children) {
    if (!isValidElement(child)) {
      continue;
    }
    const type = child.type as string;
    if (
      !['path', 'circle', 'rect', 'line', 'polyline', 'polygon'].includes(type)
    ) {
      continue;
    }

    const childProps = child.props as Record<string, unknown>;
    const {key: _key, children: _, ...rawAttrs} = childProps;

    // Clean attrs
    const attrs: Record<string, string> = {};
    const geoAttrs = [
      'd',
      'cx',
      'cy',
      'r',
      'x',
      'y',
      'width',
      'height',
      'rx',
      'ry',
      'x1',
      'y1',
      'x2',
      'y2',
      'points',
      'fillRule',
      'clipRule',
    ];
    for (const [k, v] of Object.entries(rawAttrs)) {
      if (geoAttrs.includes(k) && v != null) {
        const attrName =
          k === 'fillRule' ? 'fill-rule' : k === 'clipRule' ? 'clip-rule' : k;
        attrs[attrName] = String(v);
      }
    }

    // Role heuristic
    let role: IconShapeRole = 'stroke';
    if (isSolid) {
      role = 'fill';
    } else if (type === 'circle' && rawAttrs.fill === 'currentColor') {
      role = 'fill';
    } else if (type === 'rect' && Number(attrs.width || 0) > 6) {
      // Large rects are fill-role containers; small rects are decorative
      role = 'fill';
    } else if (type === 'path') {
      const d = attrs.d || '';
      if (/[Zz]\s*$/.test(d) && d.length > 30) {
        role = 'fill';
      }
    }

    const bbox = estimateBBox(attrs, type);
    shapes.push({type: type as IconShape['type'], attrs, role, bbox});
  }

  if (shapes.length === 0) {
    return null;
  }

  // Layer classification: CONTAINMENT-BASED
  // Only classify as secondary if geometrically contained within a larger shape
  const primary: IconShape[] = [];
  const secondary: IconShape[] = [];

  if (shapes.length === 1) {
    primary.push(shapes[0]);
  } else {
    // Find the largest shape by bbox area
    let largestIdx = 0;
    let largestArea = 0;
    shapes.forEach((s, i) => {
      const area = bboxArea(s.bbox);
      if (area > largestArea) {
        largestArea = area;
        largestIdx = i;
      }
    });

    const largestBBox = shapes[largestIdx].bbox;

    shapes.forEach((s, i) => {
      if (i === largestIdx) {
        // Largest is always primary
        primary.push({type: s.type, attrs: s.attrs, role: s.role});
      } else if (
        contains(largestBBox, s.bbox) &&
        bboxArea(s.bbox) < largestArea * 0.5
      ) {
        // Contained within the largest AND significantly smaller → secondary
        secondary.push({type: s.type, attrs: s.attrs, role: s.role});
      } else {
        // Not contained or similar size → primary (peer element)
        primary.push({type: s.type, attrs: s.attrs, role: s.role});
      }
    });
  }

  return {
    name,
    primary,
    secondary: secondary.length > 0 ? secondary : undefined,
  };
}

// =============================================================================
// Story
// =============================================================================

const meta: Meta = {
  title: 'Lab/SVGIcon',
  component: SVGIcon,
};
export default meta;

const VARIATIONS: SVGIconVariation[] = [
  'linear',
  'bold',
  'twotone',
  'bulk',
  'broken',
];

export const DefaultRegistryIcons: StoryObj = {
  parameters: rtlAuditParameters({
    D1: {
      applicable: false,
      reason:
        'This reference fixture preserves caller-supplied left and right glyph geometry; the samples are data, not directional controls.',
    },
  }),
  render: () => {
    const converted: Array<{name: string; def: SVGIconDef}> = [];
    for (const [name, jsx] of Object.entries(defaultIcons)) {
      const def = jsxSvgToIconDef(name, jsx as ReactElement);
      if (def) {
        converted.push({name, def});
      }
    }

    return (
      <Stack direction="vertical" gap={3}>
        <Text type="large">Default Registry Icons \u2192 SVGIcon System</Text>
        <Text type="supporting">
          {converted.length} icons auto-converted. Heuristic: containment-based
          layer classification (only elements fully contained within a larger
          shape become secondary). Peer elements (same size, not contained) stay
          primary.
        </Text>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `130px repeat(${VARIATIONS.length}, 1fr)`,
            gap: '8px 4px',
            alignItems: 'center',
          }}>
          <div />
          {VARIATIONS.map(v => (
            <Text
              key={v}
              type="label"
              style={{textAlign: 'center', fontSize: 10}}>
              {v}
            </Text>
          ))}

          {converted.map(({name, def}) => (
            <Fragment key={name}>
              <Text type="label" style={{fontSize: 11}}>
                {name}
              </Text>
              {VARIATIONS.map(v => (
                <div
                  key={`${name}-${v}`}
                  style={{display: 'flex', justifyContent: 'center'}}>
                  <SVGIcon icon={def} variation={v} size="lg" />
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </Stack>
    );
  },
};
