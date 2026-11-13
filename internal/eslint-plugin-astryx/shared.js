// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file shared.js
 * @description Shared utilities for Astryx ESLint rules that target component
 * props interfaces (require-base-props, require-ref-prop).
 */

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

/**
 * Component props interfaces exempt from structural rules.
 * These either don't render a DOM element or have a fundamentally
 * different type shape (SVG, provider, overlay).
 */
export const COMPONENT_RULE_ALLOWED = new Set([
  // BaseProps is the base type itself
  'BaseProps',
  // SVG components extend SVGProps, not HTMLAttributes
  'IconProps',
  'SVGIconProps',
  // Overlay/layer components — no meaningful root DOM element
  'TooltipProps',
  'PopoverProps',
  'HoverCardProps',
  'OverlayProps',
  // System-managed, not directly rendered by consumers
  'ToastProps',
  'ToastViewportProps',
  // Provider components — render no DOM element
  'LayerProviderProps',
  'LinkProviderProps',
  'MediaThemeProps',
  'InternationalizationProviderProps',
  // Renders one Markdown plugin node with no element of its own (spec:AST-064)
  'MarkdownPluginNodeRendererProps',
  // Hook return-value / editor-config prop bags — not DOM-component props
  'OverlayContainerProps',
  'PowerSearchEditorProps',
  'ResizableProps',
]);

const barrelCache = new Map();

function getBarrelExports(filePath) {
  const dir = dirname(filePath);
  const barrelPath = join(dir, 'index.ts');

  if (barrelCache.has(barrelPath)) {
    return barrelCache.get(barrelPath);
  }

  let exported = new Set();
  try {
    const content = readFileSync(barrelPath, 'utf-8');
    const typeExportRe = /export\s+(?:type\s+)?{([^}]+)}/g;
    let match;
    while ((match = typeExportRe.exec(content)) !== null) {
      for (const name of match[1].split(',')) {
        const trimmed = name.replace(/\s+as\s+\w+/, '').trim();
        if (trimmed) exported.add(trimmed);
      }
    }
    const reExportRe = /export\s+\*\s+from/g;
    if (reExportRe.test(content)) {
      exported = null;
    }
  } catch {
    exported = new Set();
  }

  barrelCache.set(barrelPath, exported);
  return exported;
}

/**
 * Check if a type name is re-exported from the component's barrel index.ts.
 */
export function isPubliclyExported(name, filePath) {
  const exports = getBarrelExports(filePath);
  if (exports === null) return true;
  return exports.has(name);
}
