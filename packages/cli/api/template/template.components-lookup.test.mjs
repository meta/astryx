// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The components a template's line names are worked out in one pass:
 * a name the component list holds under the package its import names needs
 * no lookup, a package that cannot own a component (a chart library) needs
 * none, and the names that are looked up share one listing of each folder,
 * so the reads do not grow with the number of names. The answer is the one a
 * lookup of every owner gives (copy.components.test.mjs).
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import * as path from 'node:path';
import {requireNatively} from '../../test-utils/native-require.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const require = requireNatively(import.meta.url);

/** @type {typeof import('./_adapter.mjs')} */
const {loadComponentLookup} = require('./_adapter.mjs');
/** @type {typeof import('../../foundation/discovery/template-adapter.mjs')} */
const {
  answeredComponentsInSource,
} = require('../../foundation/discovery/template-adapter.mjs');

/** The integration's components, each a doc and a source. */
const ACME = ['AcmeBadge', 'AcmeChip', 'AcmeMeter', 'AcmeRail', 'AcmeTile'];

const SOURCE = `import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {AcmeChip} from '@acme/widgets/AcmeChip';
import {LineChart, Line, Tooltip} from 'recharts';
export default function Page() {
  return (
    <Card>
      <Text>Revenue</Text>
      <AcmeChip />
      <LineChart><Line /><Tooltip /></LineChart>
      <Badge />
    </Card>
  );
}
`;

/**
 * A source that renders a component an installed package with component docs
 * of the older kind (`astryx.docs`) documents under a name Core documents too.
 */
const LEGACY_SOURCE = `import {Card} from '@legacy/kit/Card';
export default function Page() {
  return <Card />;
}
`;

/** @type {string} */
let dir;
/** @type {string} */
let componentsDir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-template-lookup-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const pkgDir = path.join(dir, 'node_modules', '@acme', 'widgets');
  componentsDir = path.join(pkgDir, 'src');
  fs.mkdirSync(componentsDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      exports: Object.fromEntries(
        ACME.map(name => [`./${name}`, `./src/${name}.tsx`]),
      ),
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './src'};\n",
  );
  const legacyDir = path.join(dir, 'node_modules', '@legacy', 'kit');
  fs.mkdirSync(path.join(legacyDir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(legacyDir, 'package.json'),
    JSON.stringify({
      name: '@legacy/kit',
      version: '1.0.0',
      astryx: {docs: 'docs'},
    }),
  );
  fs.writeFileSync(
    path.join(legacyDir, 'docs', 'Card.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'Card',
      displayName: 'Legacy Card',
      import: '@legacy/kit/Card',
      usage: {description: 'A card of the older kit.'},
      props: [],
    })};\n`,
  );
  for (const name of ACME) {
    fs.writeFileSync(
      path.join(componentsDir, `${name}.tsx`),
      `export function ${name}() { return null; }\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, `${name}.doc.mjs`),
      `export default ${JSON.stringify({
        type: 'component',
        name,
        displayName: name,
        import: `@acme/widgets/${name}`,
        usage: {description: `The ${name}.`},
        props: [],
      })};\n`,
    );
  }
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * What `work` gives, with each listing of the integration's components folder
 * and each read of a file in it while it runs.
 * @template T
 * @param {() => T} work
 */
function watchingComponents(work) {
  const nodeFs = createRequire(import.meta.url)('node:fs');
  const {readdirSync, readFileSync} = nodeFs;
  /** @type {string[]} */
  const listed = [];
  /** @type {string[]} */
  const read = [];
  nodeFs.readdirSync = (/** @type {any} */ p, /** @type {any} */ ...rest) => {
    if (String(p).startsWith(componentsDir)) listed.push(String(p));
    return readdirSync.call(nodeFs, p, ...rest);
  };
  nodeFs.readFileSync = (/** @type {any} */ p, /** @type {any} */ ...rest) => {
    if (String(p).startsWith(componentsDir)) read.push(String(p));
    return readFileSync.call(nodeFs, p, ...rest);
  };
  syncBuiltinESMExports();
  try {
    return {value: work(), listed, read};
  } finally {
    nodeFs.readdirSync = readdirSync;
    nodeFs.readFileSync = readFileSync;
    syncBuiltinESMExports();
  }
}

describe("a template's component line", () => {
  it('names the components a lookup of every owner names, in first-use order', async () => {
    const lookup = await loadComponentLookup(dir);
    const everyOwner = {ownersOf: lookup.ownersOf, qualified: lookup.qualified};
    expect(answeredComponentsInSource(SOURCE, lookup)).toEqual(
      answeredComponentsInSource(SOURCE, everyOwner),
    );
    expect(answeredComponentsInSource(SOURCE, lookup)).toEqual([
      '@astryxdesign/core/Card',
      '@astryxdesign/core/Text',
      '@acme/widgets/AcmeChip',
      '@astryxdesign/core/Badge',
    ]);
  }, 60_000);

  it('names no component of a package with docs of the older kind under a name Core documents, as a lookup of every owner does', async () => {
    const lookup = await loadComponentLookup(dir);
    const everyOwner = {ownersOf: lookup.ownersOf, qualified: lookup.qualified};
    expect(answeredComponentsInSource(LEGACY_SOURCE, lookup)).toEqual(
      answeredComponentsInSource(LEGACY_SOURCE, everyOwner),
    );
    expect(answeredComponentsInSource(LEGACY_SOURCE, lookup)).toEqual([]);
  }, 60_000);

  it("reads none of an integration's docs for names the component list holds or a chart library imports", async () => {
    const lookup = await loadComponentLookup(dir);
    const {value, listed, read} = watchingComponents(() =>
      answeredComponentsInSource(SOURCE, lookup),
    );
    expect(value).toHaveLength(4);
    expect(listed).toEqual([]);
    expect(read).toEqual([]);
  }, 60_000);

  it('lists each folder and reads each doc once for the names it looks up', async () => {
    const lookup = await loadComponentLookup(dir);
    // Every name looked up in full, as for names the list does not hold.
    const everyOwner = {ownersOf: lookup.ownersOf, qualified: lookup.qualified};
    const {listed, read} = watchingComponents(() =>
      answeredComponentsInSource(SOURCE, everyOwner),
    );
    expect(new Set(listed).size).toBe(listed.length);
    // Each doc is read once by the walk for names it records under another
    // name, and once more by a lookup of its own name: the reads do not grow
    // with the number of names.
    expect(read.length).toBeLessThanOrEqual(2 * ACME.length);
  }, 60_000);
});
