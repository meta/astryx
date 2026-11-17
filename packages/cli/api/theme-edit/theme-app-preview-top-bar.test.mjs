// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The in-app preview's top bar draws its title with Core's own
 * TopNavHeading, as an app's top bar does, so a setting on the header (its
 * text color) shows in the preview as it does in the app; no raw element
 * stands in for it.
 */

import {describe, expect, it} from 'vitest';
import {parse} from '@babel/parser';
import {previewRouteSource} from './_preview.mjs';

/** The route for a theme with both modes. */
const route = previewRouteSource({
  pages: [{id: 'overview', label: 'Overview', file: '_pages/overview'}],
  theme: {
    name: 't',
    module: '../../themes/t/t.js',
    css: ['../../themes/t/t.css'],
    mode: 'system',
  },
});

describe("the preview route's top bar", () => {
  it("draws the title with Core's TopNavHeading", () => {
    expect(route).toMatch(
      /import \{TopNav, TopNavHeading\} from '@astryxdesign\/core\/TopNav';/,
    );
    expect(route).toMatch(/heading=\{<TopNavHeading heading=\{"t"\} \/>\}/);
  });

  it('puts no raw element in the top bar', () => {
    const ast = parse(route, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
    /** @type {string[]} */
    const lower = [];
    /** @param {any} node */
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (
        node.type === 'JSXAttribute' &&
        node.name?.name === 'heading' &&
        node.value?.type === 'JSXExpressionContainer'
      ) {
        /** @param {any} n */
        const tags = n => {
          if (!n || typeof n !== 'object') return;
          if (Array.isArray(n)) return n.forEach(tags);
          if (
            n.type === 'JSXOpeningElement' &&
            /^[a-z]/.test(n.name?.name ?? '')
          )
            lower.push(n.name.name);
          for (const k of Object.keys(n)) if (k !== 'loc') tags(n[k]);
        };
        tags(node.value);
      }
      for (const k of Object.keys(node)) if (k !== 'loc') walk(node[k]);
    };
    walk(ast.program);
    expect(lower).toEqual([]);
  });

  it('the mode labels are Core components', () => {
    expect(route).toMatch(
      /<SegmentedControlItem value="light" label="Light" \/>/,
    );
    expect(route).not.toMatch(
      /<(span|label|strong|b)\b[^>]*>(Light|Dark|System)</,
    );
  });
});
