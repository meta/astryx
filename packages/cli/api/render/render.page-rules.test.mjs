// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page's own compiled styles never share a class with Core's sheet.
 * The page compiles with its own class-name prefix, so its rules apply to its
 * own elements only, unlayered, while Core's rules keep Core's layer. The
 * table-comparison template's own styles hold a declaration one of Core's
 * Table cell rules holds too; the cell's first-child edge padding still
 * applies over the plain inline padding, as in the app. A page override of a
 * Core component's padding still wins over Core's rule, as in the app.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import postcss from 'postcss';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {template} from '../template/template.mjs';
import {requiredClasses} from '../../foundation/render/css-cut.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

const OVERRIDE = `import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';

const styles = stylex.create({flush: {padding: 0}});

export default function Page() {
  return <Button label="Flush" xstyle={styles.flush} />;
}
`;

/** @type {string} */
let home;

/**
 * The file's stylesheet: each class, and whether a rule in a layer or a rule
 * outside every layer names it.
 * @param {string} html
 */
function classesByLayer(html) {
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map(m => m[1])
    .join('\n');
  /** @type {Set<string>} */
  const layered = new Set();
  /** @type {Map<string, string[]>} */
  const plain = new Map();
  postcss.parse(css).walkRules(rule => {
    let inLayer = false;
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent)
      if (p.type === 'atrule' && /** @type {any} */ (p).name === 'layer')
        inLayer = true;
    for (const c of requiredClasses(rule.selector)) {
      if (inLayer) layered.add(c);
      else plain.set(c, [...(plain.get(c) ?? []), rule.toString()]);
    }
  });
  return {css, layered, plain};
}

/** @param {string} page @param {string} out */
async function renderedHtml(page, out) {
  await render(page, {cwd: home, out});
  return fs.readFileSync(path.join(home, out), 'utf8');
}

beforeAll(async () => {
  home = makeLinkedFixture('astryx-render-page-rules-', [
    '@astryxdesign',
    '@stylexjs',
    '@heroicons',
    'lucide-react',
    'react',
    'react-dom',
    'recharts',
  ]);
  await template('table-comparison', {
    targetPath: 'page',
    type: 'page',
    cwd: home,
  });
  fs.writeFileSync(path.join(home, 'override.tsx'), OVERRIDE);
}, 300_000);

afterAll(() => {
  if (home) removeLinkedFixture(home);
});

describe('a page whose own styles hold a declaration Core holds', () => {
  it('shares no class with Core’s sheet, and Core’s edge rule stays', async () => {
    const html = await renderedHtml('page/page.tsx', 'page.html');
    const {css, layered, plain} = classesByLayer(html);
    expect(plain.size).toBeGreaterThan(0);
    expect([...plain.keys()].filter(c => layered.has(c))).toEqual([]);
    expect(css).toMatch(
      /:first-child[^{]*\{\s*padding-inline-start:\s*max\(var\(--container-padding-inline-start/,
    );
  }, 300_000);

  it('keeps a page override of a Core component above Core’s rule', async () => {
    const html = await renderedHtml('override.tsx', 'override.html');
    const {layered, plain} = classesByLayer(html);
    const button = /<button\b[^>]*\sclass="([^"]*)"/.exec(html);
    expect(button).not.toBeNull();
    const own = (button?.[1] ?? '')
      .split(/\s+/)
      .filter(c => (plain.get(c) ?? []).some(r => /padding:\s*0/.test(r)));
    // The override's class is the page's own, outside every layer, so it
    // beats Button's layered padding as the product layer does in the app.
    expect(own.length).toBe(1);
    expect(layered.has(own[0])).toBe(false);
  }, 300_000);
});
