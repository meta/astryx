// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file samples.test.mjs
 * @input Every component doc of the packages swizzle copies from, and
 *   samples.mjs
 * @output A component with a required prop that neither a sample nor its
 *   doc's playground defaults give fails here, by name, on its own pull
 *   request, instead of as a render error in the next release check
 *   (spec:AST-110 FR7)
 * @position A Node test; it reads docs and needs no build
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {missingSample} from './proof.mjs';
import {needsNoSample, notRendered, samples} from './samples.mjs';
import {COMPONENT_PACKAGES, REPO} from './scope.mjs';

/**
 * The swizzle targets that have a doc: Core's components (a doc named for its
 * folder) and every component of each integration package.
 */
async function documentedTargets() {
  const targets = [];
  for (const pkg of COMPONENT_PACKAGES) {
    const src = path.join(REPO, 'packages', pkg, 'src');
    for (const file of fs
      .readdirSync(src, {recursive: true})
      .map(String)
      .filter(f => f.endsWith('.doc.mjs'))) {
      const name = path.basename(file, '.doc.mjs');
      if (pkg === 'core' && path.basename(path.dirname(file)) !== name)
        continue;
      const m = await import(pathToFileURL(path.join(src, file)).href);
      const doc =
        m.doc ??
        m.default ??
        Object.values(m).find(v => v && typeof v === 'object' && v.name);
      targets.push({key: `${pkg}__${name}`, doc});
    }
  }
  return targets;
}

describe('swizzle proof samples', () => {
  it('give every target with a required prop a sample, a default or a mark', async () => {
    const unsampled = (await documentedTargets())
      .map(t => missingSample(t, t.doc, {samples, needsNoSample, notRendered}))
      .filter(Boolean);
    expect(unsampled).toEqual([]);
  });

  it('name a target with a required prop and no sample, as the proof does before it renders', () => {
    const doc = {
      props: [{name: 'data', required: true}, {name: 'label'}],
      playground: {defaults: {}},
    };
    expect(
      missingSample({key: 'lab__Example'}, doc, {
        samples: {},
        needsNoSample: {},
      }),
    ).toBe(
      'swizzle target lab__Example has no sample in samples.mjs, and its doc gives no default for its required prop(s) data: add a sample, or mark it in needsNoSample',
    );
    expect(
      missingSample({key: 'lab__Example'}, doc, {
        samples: {lab__Example: () => null},
      }),
    ).toBeNull();
  });

  it('render lab__ChatVirtualizer with rows', () => {
    expect(samples.lab__ChatVirtualizer).toBeTypeOf('function');
    expect(needsNoSample.lab__ChatVirtualizer).toBeUndefined();
  });

  it('keep a mark only for a target that has no sample', () => {
    expect(Object.keys(needsNoSample).filter(key => samples[key])).toEqual([]);
  });
});
