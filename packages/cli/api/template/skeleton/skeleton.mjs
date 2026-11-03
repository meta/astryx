// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `template.skeleton` leaf — a layout skeleton (structural tags with
 * spatial annotations) plus the components a resolved template composes.
 *
 * @position api/template/skeleton — derives a compact layout reference from the
 *   resolved match's source, with demo content replaced as a copy replaces it;
 *   the template dispatcher routes `--skeleton` here.
 */

import * as fs from 'node:fs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  componentsInSource,
  pkgOf,
  replaceTemplateDemos,
} from '../../../foundation/discovery/template-adapter.mjs';

const STRUCTURAL = new Set([
  'AppShell',
  'Layout',
  'LayoutHeader',
  'LayoutContent',
  'LayoutPanel',
  'LayoutFooter',
  'Card',
  'Section',
  'Grid',
  'GridSpan',
  'List',
  'Table',
  'TabList',
  'Toolbar',
  'SideNav',
  'TopNav',
  'Dialog',
  'FormLayout',
  'Center',
]);

const SPATIAL_PROPS = [
  'padding',
  'contentPadding',
  'gap',
  'rowGap',
  'columnGap',
  'columns',
  'hasDivider',
  'defaultHasDividers',
  'variant',
  'density',
  'role',
  'height',
  'width',
  'maxWidth',
];

/**
 * Copy allowlisted layout props verbatim from a JSX opening-tag fragment.
 * Uses quote/brace matching so object literals and spaced strings stay intact.
 *
 * @param {string} tagText
 * @returns {string[]}
 */
function extractSpatialAttrs(tagText) {
  /** @type {string[]} */
  const attrs = [];
  for (const name of SPATIAL_PROPS) {
    const eqMatch = tagText.match(new RegExp(`\\b${name}\\s*=\\s*`));
    if (eqMatch && eqMatch.index != null) {
      const start = eqMatch.index;
      let i = eqMatch.index + eqMatch[0].length;
      const rest = tagText.slice(i);

      if (rest[0] === '"' || rest[0] === "'") {
        const q = rest[0];
        i += 1;
        while (i < tagText.length && tagText[i] !== q) {
          if (tagText[i] === '\\') i += 1;
          i += 1;
        }
        if (i < tagText.length) i += 1;
      } else if (rest[0] === '{') {
        let depth = 0;
        while (i < tagText.length) {
          if (tagText[i] === '{') depth += 1;
          else if (tagText[i] === '}') {
            depth -= 1;
            if (depth === 0) {
              i += 1;
              break;
            }
          }
          i += 1;
        }
      } else {
        const bare = rest.match(/^[^\s/>]+/);
        i += bare ? bare[0].length : 0;
      }

      attrs.push(tagText.slice(start, i).trim());
      continue;
    }

    if (new RegExp(`\\b${name}(?=[\\s/>])`).test(tagText)) {
      attrs.push(name);
    }
  }
  return attrs;
}

/**
 * @param {string} source
 * @returns {string}
 */
function extractSkeleton(source) {
  const lines = source.split('\n');
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let capturing = false;
  let inDefaultExport = false;
  const MAX_LINES = 35;
  /** @type {string[]} */
  const depthStack = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();

    if (t.match(/^export\s+default\s+function/)) {
      inDefaultExport = true;
      continue;
    }
    if (inDefaultExport && t.match(/^return\s*\(/)) {
      capturing = true;
      continue;
    }
    if (!capturing) continue;
    if (out.length >= MAX_LINES) {
      if (!out[out.length - 1]?.includes('...'))
        out.push('  '.repeat(depth) + '...');
      continue;
    }

    // Match a JSX opening tag, e.g. `<Section` or the legacy `<XDSSection`.
    // The `XDS` prefix is optional (templates author bare names post
    // un-prefix migration P2380608025). `tagName` is the full authored name
    // (used for the self-closing lookahead); `comp` is the bare display name.
    const openMatch = t.match(/^<((XDS)?([A-Z]\w+))/);
    if (openMatch && !t.startsWith('</')) {
      const tagName = openMatch[1];
      const comp = openMatch[3];
      let tagText = '';
      for (let j = i; j < Math.min(i + 12, lines.length); j++) {
        tagText += ' ' + lines[j];
        if (lines[j].includes('>')) break;
      }

      const props = extractSpatialAttrs(tagText);
      const hasSpatialProps = props.length > 0;
      const propStr = hasSpatialProps ? ' ' + props.join(' ') : '';
      const isVStack = comp === 'VStack' || comp === 'HStack';
      const isSelfClosing = tagText.match(
        new RegExp('<' + tagName + '[^>]*/>', 's'),
      );

      if (isVStack && !hasSpatialProps) continue;

      if (isSelfClosing) {
        out.push('  '.repeat(depth) + `<${comp}${propStr} />`);
      } else if (STRUCTURAL.has(comp) || (isVStack && hasSpatialProps)) {
        out.push('  '.repeat(depth) + `<${comp}${propStr}>`);
        depthStack.push(comp);
        depth++;
      } else {
        out.push('  '.repeat(depth) + `<${comp}${propStr} />`);
      }
      continue;
    }

    const closeMatch = t.match(/^<\/(XDS)?([A-Z]\w+)>/);
    if (closeMatch) {
      const comp = closeMatch[2];
      if (depthStack.length > 0 && depthStack[depthStack.length - 1] === comp) {
        depthStack.pop();
        depth = Math.max(0, depth - 1);
        out.push('  '.repeat(depth) + `</${comp}>`);
      }
      continue;
    }

    const slotMatch = t.match(
      /^(header|content|footer|start|end|sideNav|topNav)\s*=\s*\{/,
    );
    if (slotMatch) {
      out.push('  '.repeat(depth) + `/* ${slotMatch[1]}: */`);
      continue;
    }

    if (
      t.startsWith('<div') &&
      (t.includes('padding') || t.includes('maxWidth') || t.includes('gap:'))
    ) {
      const styleProps = [];
      const divText = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
      const pp = divText.match(/padding[^:]*:\s*['"]?([^'"},)]+)/);
      const mw = divText.match(/maxWidth:\s*(\d+)/);
      const gp = divText.match(/gap:\s*(\d+)/);
      const mg = divText.match(/margin:\s*['"]([^'"]+)['"]/);
      const mi = divText.match(/marginInline:\s*['"]([^'"]+)['"]/);
      if (pp) styleProps.push(`padding: ${pp[1].trim()}`);
      if (mw) styleProps.push(`maxWidth: ${mw[1]}`);
      if (gp) styleProps.push(`gap: ${gp[1]}`);
      if (mg) styleProps.push(`margin: ${mg[1]}`);
      if (mi) styleProps.push(`marginInline: ${mi[1]}`);
      if (styleProps.length > 0) {
        out.push('  '.repeat(depth) + `/* div: ${styleProps.join(', ')} */`);
      }
    }
  }

  return out.filter(l => l.trim()).join('\n');
}

/**
 * Build the `template.skeleton` envelope for an already-resolved template.
 * `match` may be undefined when `--skeleton` is run without a name — the same
 * "specify a template name" error the dispatcher's resolution would surface.
 * @param {import('../../../foundation/discovery/template-adapter.mjs').DiscoveredTemplate | undefined} match
 * @param {import('../../../foundation/discovery/template-adapter.mjs').DiscoveredTemplate[]} templates
 * @returns {import('../template.type.mjs').TemplateSkeletonResponse}
 */
export function templateSkeleton(match, templates) {
  if (!match) {
    throw new AstryxError(
      'Specify a template name for --skeleton',
      templates.map(t => ({name: t.dirName, reason: `${t.type} template`})),
      ERROR_CODES.ERR_UNKNOWN_TEMPLATE,
    );
  }
  if (!fs.existsSync(match.filePath)) {
    throw new AstryxError(
      `No source file found for template "${match.dirName}"`,
      undefined,
      ERROR_CODES.ERR_NO_SOURCE,
    );
  }
  // The skeleton outlines the source that template.show returns, so it never
  // names demo content that a copy replaces.
  const {source} = replaceTemplateDemos(
    fs.readFileSync(match.filePath, 'utf-8'),
  );
  return {
    type: 'template.skeleton',
    package: pkgOf(match),
    data: {
      template: match.dirName,
      description: match.description,
      components: componentsInSource(source),
      skeleton: extractSkeleton(source),
    },
  };
}
