// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Topic and tree docs authored as `.doc.ts`: they load through the same
 *   jiti TypeScript path as component docs, wherever the integration lives.
 *
 * Node cannot strip types from a file under node_modules, on any version, and
 * below 22.18 it does not strip types at all. An installed integration's
 * `.doc.ts` topic therefore fails a plain `import()` on every Node, and a
 * linked one fails it below 22.18. These cases run on whatever Node runs the
 * suite; the linked case is the one that fails on Node 22.13 to 22.17.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./read.mjs')} */
const {loadTopicFile, readDocView} = require('./read.mjs');
/** @type {typeof import('./import.mjs')} */
const {importNativeModule} = require('./import.mjs');

const TOPIC = (/** @type {string} */ name) => `
type Doc = {name: string; title: string; category: string; description: string; sections: unknown[]};
export const docs: Doc = {
  name: '${name}',
  title: 'Deploying',
  category: 'guide',
  description: 'How to deploy the integration.',
  sections: [{title: 'Deploy', content: [{type: 'prose', text: 'Run the deploy command.'}]}],
};
`;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-topic-ts-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {string} relative
 * @param {string} text
 */
function write(relative, text) {
  const file = path.join(tmpDir, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  return file;
}

describe('a .doc.ts topic', () => {
  it('loads from an installed integration under node_modules', async () => {
    const file = write(
      'node_modules/@acme/integration/docs/deploying.doc.ts',
      TOPIC('deploying'),
    );
    const result = await loadTopicFile(file, null);
    expect(result.error).toBeUndefined();
    expect(result.doc?.name).toBe('deploying');
  });

  it('loads from a linked integration outside node_modules', async () => {
    const file = write('linked/docs/deploying.doc.ts', TOPIC('deploying'));
    const result = await loadTopicFile(file, null);
    expect(result.error).toBeUndefined();
    expect(result.doc?.name).toBe('deploying');
  });

  it('loads a tree doc read through the native loader', async () => {
    const file = write(
      'node_modules/@acme/integration/docs/guides.doc.ts',
      TOPIC('guides'),
    );
    const view = await readDocView(file, {root: 'tree', loader: 'native'});
    expect(view?.name).toBe('guides');
  });
});

describe('a .doc.mjs topic', () => {
  it('still loads natively, installed or linked', async () => {
    const text = `export const docs = ${JSON.stringify({
      name: 'deploying',
      title: 'Deploying',
      category: 'guide',
      description: 'How to deploy the integration.',
      sections: [
        {
          title: 'Deploy',
          content: [{type: 'prose', text: 'Run the deploy command.'}],
        },
      ],
    })};\n`;
    for (const relative of [
      'node_modules/@acme/integration/docs/deploying.doc.mjs',
      'linked/docs/deploying.doc.mjs',
    ]) {
      const file = write(relative, text);
      const result = await loadTopicFile(file, null);
      expect(result.error).toBeUndefined();
      expect(result.doc?.name).toBe('deploying');
      const mod = await importNativeModule(file);
      expect(Object.keys(mod)).toEqual(['docs']);
    }
  });
});
