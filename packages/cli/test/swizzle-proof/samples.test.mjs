// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file samples.test.mjs
 * @input Every component doc of the packages swizzle copies from, and
 *   samples.mjs
 * @output A component with a required prop that neither a sample nor its
 *   doc's playground defaults give fails here, by name, on its own pull
 *   request, instead of as a render error in the next release check
 *   (spec:AST-110 FR7)
 * @position A Node test; it reads the same docs the proof reads and needs no
 *   build
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {listComponents} from '../../foundation/fs/paths.mjs';
import {docOf, missingSample, workspacePackages} from './proof.mjs';
import {needsNoSample, notRendered, samples} from './samples.mjs';
import {COMPONENT_PACKAGES, REPO} from './scope.mjs';

/**
 * The swizzle targets, with their docs read as the proof reads them: Core's
 * components as swizzle offers them (its capitalized folders), and each
 * integration package's documented components.
 */
async function targetsWithDocs() {
  const packages = workspacePackages();
  const targets = listComponents(path.join(REPO, 'packages/core')).map(
    name => ({name, pkg: '@astryxdesign/core', key: `core__${name}`}),
  );
  for (const pkg of COMPONENT_PACKAGES.filter(p => p !== 'core')) {
    const src = path.join(REPO, 'packages', pkg, 'src');
    for (const file of fs
      .readdirSync(src, {recursive: true})
      .map(String)
      .filter(f => f.endsWith('.doc.mjs'))) {
      const name = path.basename(file, '.doc.mjs');
      targets.push({name, pkg: `@astryxdesign/${pkg}`, key: `${pkg}__${name}`});
    }
  }
  return Promise.all(
    targets.map(async t => ({...t, doc: await docOf(packages, t)})),
  );
}

describe('swizzle proof samples', () => {
  it('give every target with a required prop a sample, a default or a mark', async () => {
    const unsampled = (await targetsWithDocs())
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

  it('read a multi-component doc by the entry named for the target', () => {
    const doc = {
      name: 'Tabs',
      components: [
        {name: 'Tabs', props: [{name: 'label'}]},
        {name: 'TabBar', props: [{name: 'value', required: true}]},
      ],
    };
    expect(
      missingSample({key: 'lab__TabBar', name: 'TabBar'}, doc, {samples: {}}),
    ).toContain('required prop(s) value');
    expect(
      missingSample({key: 'lab__Tabs', name: 'Tabs'}, doc, {samples: {}}),
    ).toBeNull();
  });

  it('render lab__ChatVirtualizer with rows', () => {
    expect(samples.lab__ChatVirtualizer).toBeTypeOf('function');
    expect(needsNoSample.lab__ChatVirtualizer).toBeUndefined();
  });

  it('keep a mark only for a target that has no sample', () => {
    expect(Object.keys(needsNoSample).filter(key => samples[key])).toEqual([]);
    // Every target with a required prop renders with it, but one whose
    // sample cannot reach its copy's own subcomponent.
    expect(Object.keys(needsNoSample)).toEqual(['lab__TabBarMoreList']);
  });
});
