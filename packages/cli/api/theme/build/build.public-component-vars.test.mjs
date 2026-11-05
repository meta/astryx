// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A component's *documented* theming vars must survive `astryx theme build`.
 *
 * `validatePrivateVars` rejects a theme that sets a `--_*` var, on the rule
 * that private vars are reached through the derived-var pipeline rather than
 * written directly. That makes "which prefix a themeable var carries" a
 * build-time contract rather than a naming preference — and nothing checked
 * the two against each other, so a component could document a var, and ship a
 * changeset telling theme authors to set it, that the build then complains
 * about (#5214).
 *
 * The theme this builds is generated FROM each component's own
 * `theming.vars[]`, not from a snippet copied into this file. A hand-copied
 * snippet only ever proves the builder accepts the string it was handed; a
 * doc-driven one fails the moment a component documents a var a theme author
 * cannot actually set. It covers every component with public vars, so the
 * next one is covered without touching this file.
 *
 * Asserted on the receipt's `warnings` rather than on a rejection: a private
 * var is reported (logged `[error]`, collected into the receipt) and the build then
 * emits its CSS and resolves anyway. Asserting a throw would pass for the
 * wrong reason — it never throws, which is why a throwaway build read as a
 * pass on the first version of #5214.
 *
 * `themeBuild` compiles via @astryxdesign/core's generator, so it needs a built
 * core — the `node` project's globalSetup builds it once before workers fork.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {themeBuild} from './build.mjs';
import {loadComponentDoc} from '../../../foundation/discovery/component-loader.mjs';

vi.setConfig({testTimeout: 60000});

/** Every documented public var, as `{component, key, vars: [{name, value}]}`. */
const documented = [];

beforeAll(async () => {
  // Core and the CLI ship as siblings, the same resolution build.mjs uses.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const coreSrc = path.resolve(here, '../../../../core/src');
  const docs = [];
  (function scan(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__')
          scan(full);
      } else if (entry.name.endsWith('.doc.mjs')) {
        docs.push(full);
      }
    }
  })(coreSrc);

  for (const docPath of docs) {
    let doc;
    try {
      doc = await loadComponentDoc(docPath);
    } catch {
      continue;
    }
    const theming = doc?.theming;
    // The `defineTheme` key is the first target's class minus the namespace —
    // the same derivation `theme targets` and the builder's own validation use.
    const key = theming?.targets?.[0]?.className?.replace(/^astryx-/, '');
    // Every var the docs PRESENT as settable — `private: true` is what hides
    // one from `astryx component <Name>`, so anything without it is something
    // a theme author is being told they may write. Deliberately not filtered
    // by the `--_` prefix: a var carrying the private prefix while missing the
    // private flag is advertised by the CLI and rejected by the builder, and
    // that disagreement is the whole thing this test exists to catch.
    const publicVars = (theming?.vars || []).filter(
      v => typeof v?.name === 'string' && !v.private && !v.derived,
    );
    if (!key || publicVars.length === 0) continue;
    documented.push({
      component: path.basename(docPath, '.doc.mjs'),
      key,
      // A length or a color would each need a plausible value; `unset` is
      // valid for any custom property and is not what is under test — that a
      // theme may NAME the var at all is.
      vars: publicVars.map(v => v.name),
    });
  }
});

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-public-vars-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

async function buildTheme(name, components) {
  const themeFile = path.join(tmpDir, `${name}.mjs`);
  fs.writeFileSync(
    themeFile,
    `export default ${JSON.stringify({name, tokens: {}, components}, null, 2)};\n`,
  );
  return themeBuild(`${name}.mjs`, {}, {cwd: tmpDir});
}

const privateVarWarnings = result =>
  (result?.data.warnings ?? []).filter(w => /private var/i.test(w));

describe('documented component vars build cleanly', () => {
  it('finds components with public theming vars to check', () => {
    // A rename that broke the doc scan would otherwise silently empty this
    // file out, the way a var-count bail once did in derivedVarRegistry.test.
    expect(documented.length).toBeGreaterThan(0);
  });

  it('accepts every var the component docs tell a theme author to set', async () => {
    const components = Object.fromEntries(
      documented.map(({key, vars}) => [
        key,
        {base: Object.fromEntries(vars.map(name => [name, 'unset']))},
      ]),
    );

    const result = await buildTheme('documentedvars', components);

    expect(result).not.toBeNull();
    expect(privateVarWarnings(result)).toEqual([]);
  });

  it('still reports a private var, so the rule this relies on is real', async () => {
    // The negative control: if the builder stopped reporting `--_*`, the test
    // above would pass for the wrong reason.
    const result = await buildTheme('privatevar', {
      spinner: {'size:xl': {'--_spinner-diameter': '40px'}},
    });

    expect(privateVarWarnings(result)).toHaveLength(1);
  });
});
