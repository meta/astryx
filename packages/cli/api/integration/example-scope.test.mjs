// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {integrationExampleScope} from './example-scope.mjs';
import {validateIntegration} from './validate-integration.mjs';
import {previewableExample} from '../../authoring/example/preview.mjs';
import {loadLocalIntegration} from '../../foundation/integrations/integrations.mjs';
import {exampleScopeFor} from '../../foundation/integrations/example-code.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

/** @type {string} */
let dir;

/** @param {Record<string, string>} files */
function write(files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
}

/** @param {string} name @param {string} [extra] */
const componentDoc = (name, extra = '') =>
  `export default {type: 'component', name: '${name}', displayName: '${name}', description: 'A part.', props: []${extra}};\n`;

beforeEach(() => {
  dir = makeLinkedFixture('astryx-example-scope-', [
    '@astryxdesign/core',
    'react',
  ]);
  write({
    'package.json': JSON.stringify({
      name: '@acme/kit',
      version: '1.2.3',
      exports: {
        '.': './index.mjs',
        './Card': './components/Card/AcmeCard.tsx',
        './server': './server.mjs',
        './themes/*': './themes/*.mjs',
      },
      dependencies: {zod: '*'},
      peerDependencies: {'@astryxdesign/core': '*', react: '*'},
      devDependencies: {vitest: '*'},
    }),
    'astryx.integration.mjs': "export default {components: './components'};\n",
    'index.mjs': "export {AcmeCard} from './components/Card/AcmeCard.tsx';\n",
    'server.mjs': "import 'server-only';\nexport function loadTheme() {}\n",
    'themes/light.mjs': 'export const light = {};\n',
    'themes/dark.mjs': "import 'server-only';\nexport const dark = {};\n",
    'components/Card/AcmeCard.tsx':
      'export function AcmeCard() { return null; }\n',
    'components/Card/AcmeCard.doc.mjs': componentDoc('AcmeCard'),
    'components/AcmeTheme.tsx':
      'export async function AcmeTheme({children}) { return children; }\n',
    'components/AcmeTheme.doc.mjs': componentDoc(
      'AcmeTheme',
      ", import: '@acme/kit'",
    ),
  });
});

afterEach(() => {
  removeLinkedFixture(dir);
});

describe('integrationExampleScope', () => {
  it('builds the scope Doctor uses, as JSON', async () => {
    const result = await integrationExampleScope(undefined, {cwd: dir});
    expect(result.type).toBe('integration.example-scope');
    expect(result.data.found).toBe(true);
    expect(result.data.name).toBe('@acme/kit');
    expect(result.data.version).toBe('1.2.3');
    expect(result.data.incomplete).toBeUndefined();
    const scope = /** @type {any} */ (result.data.scope);
    expect(JSON.parse(JSON.stringify(scope))).toEqual(scope);
    expect(scope.packageName).toBe('@acme/kit');
    expect(
      [...scope.packageNames].sort((a, b) => (a.name < b.name ? -1 : 1)),
    ).toEqual([
      {name: 'AcmeCard', import: '@acme/kit/Card'},
      {name: 'AcmeTheme', import: '@acme/kit'},
    ]);
    expect(scope.coreNames).toContainEqual({
      name: 'Button',
      import: '@astryxdesign/core',
    });
    expect(scope.reactNames).toContain('useState');
    expect(scope.dependencies).toEqual(['zod', '@astryxdesign/core', 'react']);
    expect(scope.serverOnlyModules).toEqual([
      '@acme/kit/server',
      '@acme/kit/themes/dark',
    ]);
    expect(scope.serverComponents).toEqual(['AcmeTheme']);
  });

  it('judges an example with the stored scope as Doctor does', async () => {
    const {data} = await integrationExampleScope(undefined, {cwd: dir});
    const scope = JSON.parse(JSON.stringify(data.scope));
    const read = previewableExample(
      {code: '<Button label="Go" />\n<AcmeCard />'},
      scope,
    );
    expect(read.previewable).toBe(true);
    expect(read.previewable && read.module).toContain(
      "import {AcmeCard} from '@acme/kit/Card';",
    );
    const server = previewableExample(
      {code: "import {dark} from '@acme/kit/themes/dark';\n<AcmeCard />"},
      scope,
    );
    expect(server.previewable || server.setup ? [] : server.problems).toEqual([
      expect.objectContaining({
        code: 'example_server_only',
        specifier: '@acme/kit/themes/dark',
      }),
    ]);
  });

  it('is the scope Doctor reads the examples with, and judges them as Doctor does', async () => {
    const examples = [
      {label: 'Runs', code: '<Button label="Go" />\n<AcmeCard />'},
      {label: 'Needs a viewer', code: '<AcmeCard title={viewer.name} />'},
      {
        label: 'Server theme',
        code: "import {dark} from '@acme/kit/themes/dark';\n<AcmeCard />",
      },
      {label: 'Server component', code: '<AcmeTheme><AcmeCard /></AcmeTheme>'},
      {label: 'A fragment', code: 'return <AcmeCard />;'},
    ];
    write({
      'components/Card/AcmeCard.doc.mjs': componentDoc(
        'AcmeCard',
        `, examples: ${JSON.stringify(examples)}`,
      ),
    });

    const integration = await loadLocalIntegration(dir);
    const doctorScope = (await exampleScopeFor(integration)).scope;
    const {data} = await integrationExampleScope(undefined, {cwd: dir});
    expect(data.scope).toEqual(doctorScope);

    const stored = JSON.parse(JSON.stringify(data.scope));
    const refused = examples.flatMap(example => {
      const read = previewableExample(example, stored);
      return read.previewable || read.setup
        ? []
        : read.problems.map(problem => `"${example.label}" ${problem.code}`);
    });
    const validated = await validateIntegration(undefined, {cwd: dir});
    const noted = (validated.data.notes ?? []).flatMap(note => {
      const label = /example (".*?") /u.exec(note.message)?.[1];
      return note.code.startsWith('example_') && label
        ? [`${label} ${note.code}`]
        : [];
    });
    expect(noted.sort()).toEqual(refused.sort());
    expect(refused).toHaveLength(4);
  });

  it('lists a server-only module under every key that exports it', async () => {
    write({
      'package.json': JSON.stringify({
        name: '@acme/kit',
        version: '1.2.3',
        exports: {
          '.': './index.mjs',
          './server': './src/server.mjs',
          './src/*': './src/*.mjs',
        },
      }),
      'src/server.mjs': "import 'server-only';\nexport const load = 1;\n",
    });
    const {data} = await integrationExampleScope(undefined, {cwd: dir});
    expect(data.scope?.serverOnlyModules).toEqual([
      '@acme/kit/server',
      '@acme/kit/src/server',
    ]);
  });

  it('says why there is no scope when no integration manifest loads', async () => {
    fs.rmSync(path.join(dir, 'astryx.integration.mjs'));
    const {data} = await integrationExampleScope(undefined, {cwd: dir});
    expect(data.found).toBe(false);
    expect(data.scope).toBeNull();
    expect(data.reason).toContain('astryx.integration');
  });

  it('says when the names Core and React give could not be read', async () => {
    removeLinkedFixture(dir);
    dir = makeLinkedFixture('astryx-example-scope-', ['react']);
    write({
      'package.json': JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
      'astryx.integration.mjs':
        "export default {components: './components'};\n",
    });
    const {data} = await integrationExampleScope(undefined, {cwd: dir});
    expect(data.found).toBe(true);
    expect(data.incomplete).toBe(
      "Core's docs cannot be read beside the package",
    );
    expect(data.scope?.coreNames).toEqual([]);
  });
});
