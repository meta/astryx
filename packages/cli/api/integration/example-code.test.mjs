// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateIntegration} from './validate-integration.mjs';
import {integrationCheck} from './check/check.mjs';
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

/**
 * A component doc with these examples.
 * @param {string} name
 * @param {Array<{label: string, code: string, kind?: string}>} examples
 */
const componentDoc = (name, examples) =>
  `export default ${JSON.stringify({
    type: 'component',
    name,
    displayName: name,
    description: 'A part.',
    props: [],
    examples,
  })};\n`;

/** The example notes validate lists. */
async function exampleNotes() {
  const {data} = await validateIntegration(undefined, {cwd: dir});
  return {
    notes: (data.notes ?? []).filter(note =>
      [
        'example_does_not_compile',
        'example_renders_nothing',
        'example_undefined_name',
        'example_server_only',
        'example_import_unresolvable',
      ].includes(note.code),
    ),
    data,
  };
}

/** @param {Record<string, unknown>} [extra] */
const manifest = (extra = {}) =>
  JSON.stringify({
    name: '@acme/kit',
    version: '1.0.0',
    peerDependencies: {'@astryxdesign/core': '*', react: '*'},
    ...extra,
  });

beforeEach(() => {
  dir = makeLinkedFixture('astryx-example-code-', [
    '@astryxdesign/core',
    'react',
  ]);
  write({
    'package.json': manifest(),
    'astryx.integration.mjs': "export default {components: './components'};\n",
    'components/AcmeCard.tsx': 'export function AcmeCard() { return null; }\n',
  });
});

afterEach(() => {
  removeLinkedFixture(dir);
});

describe('component examples that cannot run on their own', () => {
  it('lists each problem as a next note with the doc, the example and the fix', async () => {
    write({
      'components/AcmeCard.doc.mjs': componentDoc('AcmeCard', [
        {
          label: 'Runs on its own',
          code: [
            'const [open, setOpen] = useState(false);',
            '<Button label="Open" onClick={() => setOpen(true)} />',
            '<AcmeCard open={open} />',
          ].join('\n'),
        },
        {label: 'Needs a viewer', code: '<AcmeCard title={viewer.name} />'},
        {label: 'A fragment', code: 'return <AcmeCard />;'},
        {
          label: 'A root layout',
          code: "import './globals.css';\nexport default function Layout() { return <AcmeCard />; }",
        },
        {
          label: 'Server code, marked setup',
          kind: 'setup',
          code: "import {headers} from 'next/headers';\nexport async function GET() { return headers(); }",
        },
      ]),
    });

    const {notes} = await exampleNotes();
    expect(notes.map(note => note.code)).toEqual([
      'example_undefined_name',
      'example_does_not_compile',
      'example_import_unresolvable',
    ]);
    expect(notes.every(note => note.next === true)).toBe(true);
    expect(notes[0].message).toBe(
      "Component doc \"components/AcmeCard.doc.mjs\" example \"Needs a viewer\" uses `viewer` but never defines or imports it, so a live preview throws a ReferenceError when that code runs. Fix: Define each one in the example (a sample value is enough) or import it; only the package's documented components, Core's documented components and hooks, React's exports and browser globals need no import. If the code needs values from an app, set `kind: 'setup'` to show it as code only.",
    );
    expect(notes[1].message).toContain(
      'example "A fragment" does not compile: \'return\' outside of function (line 1). Fix:',
    );
    expect(notes[2].message).toContain(
      'example "A root layout" imports \'./globals.css\'',
    );
  });

  it('reports an import of an own module that imports server-only', async () => {
    write({
      'package.json': manifest({
        exports: {'.': './index.mjs', './server': './server.mjs'},
      }),
      'index.mjs': "export {AcmeCard} from './components/AcmeCard.tsx';\n",
      'server.mjs':
        "import 'server-only';\nexport async function loadTheme() {}\n",
      'components/AcmeCard.doc.mjs': componentDoc('AcmeCard', [
        {
          label: 'Theme from the server',
          code: "import {loadTheme} from '@acme/kit/server';\nconst theme = loadTheme();\n<AcmeCard theme={theme} />",
        },
      ]),
    });

    const {notes} = await exampleNotes();
    expect(notes.map(note => note.code)).toEqual(['example_server_only']);
    expect(notes[0].message).toContain(
      "imports '@acme/kit/server', which runs only on a server",
    );
  });

  it('reads a Node built-in that only devDependencies install as server-only, as the showcase check does', async () => {
    write({
      'package.json': manifest({
        dependencies: {buffer: '^6.0.0'},
        devDependencies: {events: '^3.3.0'},
      }),
      'components/AcmeCard.doc.mjs': componentDoc('AcmeCard', [
        {
          label: 'Bytes',
          code: "import {Buffer} from 'buffer';\n<AcmeCard title={Buffer.from('hi').toString()} />",
        },
        {
          label: 'Events',
          code: "import {EventEmitter} from 'events';\nconst bus = new EventEmitter();\n<AcmeCard onSave={() => bus.emit('save')} />",
        },
      ]),
    });

    const {notes} = await exampleNotes();
    expect(notes.map(note => note.code)).toEqual(['example_server_only']);
    expect(notes[0].message).toContain(
      'example "Events" imports \'events\', which runs only on a server',
    );
  });

  it('reports an example that renders an async server component of the package', async () => {
    write({
      'components/AcmeTheme.tsx':
        'export async function AcmeTheme({children}) { return children; }\n',
      'components/AcmeTheme.doc.mjs': componentDoc('AcmeTheme', [
        {label: 'Wrap a card', code: '<AcmeTheme><AcmeCard /></AcmeTheme>'},
      ]),
      'components/AcmeCard.doc.mjs': componentDoc('AcmeCard', [
        {label: 'Plain', code: '<AcmeCard />'},
      ]),
    });

    const {notes} = await exampleNotes();
    expect(notes.map(note => note.code)).toEqual(['example_server_only']);
    expect(notes[0].message).toContain(
      'Component doc "components/AcmeTheme.doc.mjs" example "Wrap a card" renders `AcmeTheme`, an async component that only a server can render',
    );
  });

  it('lists names as not checked, never as notes, when Core is not installed', async () => {
    removeLinkedFixture(dir);
    dir = makeLinkedFixture('astryx-example-code-', ['react']);
    write({
      'package.json': manifest(),
      'astryx.integration.mjs':
        "export default {components: './components'};\n",
      'components/AcmeCard.tsx':
        'export function AcmeCard() { return null; }\n',
      'components/AcmeCard.doc.mjs': componentDoc('AcmeCard', [
        {label: 'Uses Core', code: '<Button label="Go" />'},
      ]),
    });

    const {notes, data} = await exampleNotes();
    expect(notes).toEqual([]);
    expect(data.exampleCode).toEqual({
      status: 'checked',
      findings: [],
      unchecked: [
        {
          file: 'components/AcmeCard.doc.mjs',
          example: '"Uses Core"',
          reason:
            "Core's docs cannot be read beside the package, so its names Button cannot be judged",
        },
      ],
    });
  });

  it('fails --strict --next on the notes, never plain --strict', async () => {
    write({
      'components/AcmeCard.doc.mjs': componentDoc('AcmeCard', [
        {label: 'Needs a viewer', code: '<AcmeCard title={viewer.name} />'},
      ]),
    });
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(strict.data.failures.map(failure => failure.code)).not.toContain(
      'example_undefined_name',
    );
    const next = await integrationCheck({cwd: dir, strict: true, next: true});
    expect(next.data.failures.map(failure => failure.code)).toContain(
      'example_undefined_name',
    );
  });
});
