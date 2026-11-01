// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the discover.detail.doc leaf. Doc resolution loads
 * a real `.doc.mjs` from disk, so these drive a small temp docs directory.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {doc, docFromResult} from './doc.mjs';
import {AstryxError} from '../../../error.mjs';

let docsDir;
let pkg;

beforeAll(() => {
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-doc-'));
  fs.writeFileSync(
    path.join(docsDir, 'Alpha.doc.mjs'),
    `export const docs = {name: 'Alpha', usage: {description: 'Alpha component'}, props: []};\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, 'AlphaCard.doc.mjs'),
    `export const docs = {name: 'AlphaCard', usage: {description: 'Alpha card'}, props: []};\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, 'Beta.doc.mjs'),
    `export const docs = {name: 'Beta', usage: {description: 'Beta component'}, props: []};\n`,
  );
  pkg = {
    name: '@acme/widgets',
    category: '@acme/widgets',
    version: '1.0.0',
    dir: docsDir,
    astryx: {},
    docsDir,
    components: ['Alpha', 'AlphaCard', 'Beta'],
  };
});

afterAll(() => {
  fs.rmSync(docsDir, {recursive: true, force: true});
});

describe('discover.detail.doc leaf', () => {
  it('resolves @scope/name/Component to its validated docs', async () => {
    const res = await doc([pkg], '@acme/widgets', 'Alpha', {});
    expect(res.type).toBe('discover.detail.doc');
    expect(res.data.name).toBe('Alpha');
    expect(res.data.usage.description).toBe('Alpha component');
  });

  it('resolves case-insensitively', async () => {
    const res = await doc([pkg], '@acme/widgets', 'alpha', {});
    expect(res.data.name).toBe('Alpha');
  });

  it('throws ERR_UNKNOWN_PACKAGE for an unknown scope', async () => {
    await expect(doc([pkg], '@acme/nope', 'Alpha', {})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_PACKAGE',
    });
  });

  it('throws ERR_UNKNOWN_COMPONENT with substring suggestions', async () => {
    let err;
    try {
      await doc([pkg], '@acme/widgets', 'card', {});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AstryxError);
    expect(err.code).toBe('ERR_UNKNOWN_COMPONENT');
    expect(err.suggestions).toEqual([{name: 'AlphaCard', reason: 'similar name'}]);
  });

  it('docFromResult wraps an already-resolved component', async () => {
    const res = await docFromResult(
      {
        pkg,
        docPath: path.join(docsDir, 'Beta.doc.mjs'),
        componentName: 'Beta',
      },
      {},
    );
    expect(res).toEqual({
      type: 'discover.detail.doc',
      package: '@acme/widgets',
      data: {name: 'Beta', usage: {description: 'Beta component'}, props: []},
    });
  });
});
