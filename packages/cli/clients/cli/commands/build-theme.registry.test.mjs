// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for theme-build component-override keys.
 *
 * `astryx theme build` emits a component override as a `.astryx-<key>` rule,
 * where `<key>` is the theme's `components` key passed through verbatim
 * (generateThemeRules re-adds the `astryx-` prefix). The validator reads the
 * same documented theming targets that component docs expose, so the docs must
 * stay aligned with the classes components actually render.
 */

import {describe, it, expect, beforeAll} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_SRC = path.resolve(HERE, '../../../../core/src');
/**
 * The set of real override keys: every `theming.targets[].className` across the
 * component docs, with the `astryx-` prefix stripped. This is the canonical
 * source of truth for what selectors the theme build should emit.
 */
function realOverrideKeys() {
  const keys = new Set();
  for (const dir of fs.readdirSync(CORE_SRC, {withFileTypes: true})) {
    if (!dir.isDirectory()) continue;
    const docFile = path.join(CORE_SRC, dir.name, `${dir.name}.doc.mjs`);
    if (!fs.existsSync(docFile)) continue;
    const text = fs.readFileSync(docFile, 'utf8');
    const themingIdx = text.indexOf('theming');
    if (themingIdx === -1) continue;
    const scoped = text.slice(themingIdx);
    const re = /className:\s*'astryx-([a-z0-9-]+)'/g;
    let m;
    while ((m = re.exec(scoped)) !== null) {
      keys.add(m[1]);
    }
  }
  return keys;
}

/**
 * The stable classes components ACTUALLY render: the literal first argument of
 * every `themeProps('<class>', …)` and `stableClassName('<class>')` call across
 * the core `.tsx` source (excluding tests). This is the truest source of truth
 * — the doc `theming.targets` are hand-authored metadata that can drift from
 * it, so both the registry and the targets are validated against these
 * literals. Every call site uses a plain string literal (no dynamic/
 * interpolated names), so this is fully static.
 */
function renderedClassLiterals() {
  const classes = new Set();
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
        !entry.name.includes('.test.')
      ) {
        const text = fs.readFileSync(full, 'utf8');
        for (const re of [
          /themeProps\(\s*'([^']+)'/g,
          /stableClassName\(\s*'([^']+)'/g,
        ]) {
          let m;
          while ((m = re.exec(text)) !== null) {
            classes.add(m[1]);
          }
        }
        // A component can also name its popup SURFACE — an element usePopover
        // owns, so the class cannot be rendered from the component itself.
        // `surfaceTarget: 'x'` puts `astryx-x` on that surface, which makes it
        // just as rendered as a direct themeProps() call.
        const surfaceRe = /surfaceTarget:\s*'([^']+)'/g;
        let sm;
        while ((sm = surfaceRe.exec(text)) !== null) {
          classes.add(sm[1]);
        }
      }
    }
  };
  walk(CORE_SRC);
  return classes;
}

describe('theme-build documented target validation', () => {
  it('every documented theming target is backed by a real themeProps literal', () => {
    // Guards against a component whose doc target className and rendered
    // themeProps()/stableClassName() literal disagree. The docs are what theme
    // build validates against; the literals are what actually matches the DOM.
    const targets = realOverrideKeys();
    const rendered = renderedClassLiterals();

    const orphanTargets = [...targets].filter(k => !rendered.has(k));
    expect(orphanTargets).toEqual([]);
  });
});

describe('theme build emits a live TextInput selector (#4109)', () => {
  let tmpDir;
  beforeAll(() => {
    ensureCoreBuilt();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-4109-'));
  }, 200_000);

  it('accepts documented subtargets from component docs', async () => {
    const themeFile = path.join(tmpDir, 'subtargets.mjs');
    const outFile = path.join(tmpDir, 'subtargets.css');
    fs.writeFileSync(
      themeFile,
      `export default {\n` +
        `  name: 'subtargets-4109',\n` +
        `  tokens: {},\n` +
        `  components: {\n` +
        `    'side-nav-item': { base: { borderRadius: '12px' } },\n` +
        `    'chat-composer': { base: { padding: '10px' } },\n` +
        `    'chat-message-bubble': { 'variant:ghost': { borderRadius: '18px' } },\n` +
        `  },\n` +
        `};\n`,
    );

    const result = await runCli(
      ['theme', 'build', themeFile, '-o', outFile],
      tmpDir,
    );
    const css = fs.readFileSync(outFile, 'utf8');

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Unknown component');
    expect(css).toContain('.astryx-side-nav-item');
    expect(css).toContain('.astryx-chat-composer');
    expect(css).toContain('.astryx-chat-message-bubble[data-variant="ghost"]');
  });

  it('emits .astryx-text-input (the rendered class), not the dead .astryx-textinput', async () => {
    const themeFile = path.join(tmpDir, 'theme.mjs');
    const outFile = path.join(tmpDir, 'theme.css');
    fs.writeFileSync(
      themeFile,
      `export default {\n` +
        `  name: 'input-4109',\n` +
        `  tokens: {},\n` +
        `  components: { 'text-input': { base: { borderRadius: '16px' } } },\n` +
        `};\n`,
    );

    await runCli(['theme', 'build', themeFile, '-o', outFile], tmpDir);
    const css = fs.readFileSync(outFile, 'utf8');

    expect(css).toContain('.astryx-text-input');
    expect(css).not.toContain('.astryx-textinput');
  });
});
