// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A deprecated component's search result carries its doc's `deprecated`
 * (the replacement and modernization route), for Core and for an
 * integration, so a reader such as the docsite search can label it. Other
 * component results carry no such field.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {search} from './search.mjs';
import {findCoreDir} from '../../foundation/fs/paths.mjs';
import {findComponentReadme} from '../../foundation/discovery/component-discovery.mjs';
import {loadModuleDoc} from './_module-doc.mjs';

const SLOW = 60_000;

describe('deprecated component results', () => {
  it(
    "each Core component result carries its doc's deprecation, and only a deprecated one",
    async () => {
      const coreDir = findCoreDir();
      const {results} = (await search('bottom sheet', {type: 'component'}))
        .data;
      const docs = await Promise.all(
        results.map(r =>
          loadModuleDoc(
            /** @type {string} */ (findComponentReadme(coreDir, r.name)),
          ),
        ),
      );
      results.forEach((r, i) => {
        if (docs[i]?.deprecated) {
          expect(r.deprecated, r.name).toEqual(docs[i].deprecated);
        } else {
          expect(r, r.name).not.toHaveProperty('deprecated');
        }
      });
      // The query reaches a deprecated Core component and its replacement.
      const deprecated = results.find(r => r.deprecated);
      expect(deprecated).toBeDefined();
      expect(results.map(r => r.name)).toContain(
        deprecated?.deprecated?.replacement,
      );
    },
    SLOW,
  );

  describe('an integration component (cold start)', () => {
    /** @type {string} */
    let dir;
    const deprecation = {
      replacement: 'TileGrid',
      description: 'Render a TileGrid with columns instead.',
    };
    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-deprecated-'));
      const pkg = path.join(dir, 'node_modules', '@acme', 'tiles');
      fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
      fs.mkdirSync(
        path.join(dir, 'node_modules', '@astryxdesign', 'core', 'src'),
        {recursive: true},
      );
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"consumer"}');
      fs.writeFileSync(
        path.join(dir, 'astryx.config.mjs'),
        "export default { integrations: ['@acme/tiles'] };\n",
      );
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        '{"name":"@acme/tiles","version":"1.0.0"}',
      );
      fs.writeFileSync(
        path.join(pkg, 'astryx.integration.mjs'),
        "export default { components: './components' };\n",
      );
      for (const [name, extra] of [
        ['TileColumns', {deprecated: deprecation}],
        ['TileGrid', {}],
      ]) {
        fs.writeFileSync(
          path.join(pkg, 'components', `${name}.doc.mjs`),
          `export default ${JSON.stringify({
            type: 'component',
            name,
            usage: {description: `${name} arranges tiles.`},
            props: [],
            ...extra,
          })};\n`,
        );
        fs.writeFileSync(
          path.join(pkg, 'components', `${name}.tsx`),
          `export function ${name}() { return null; }\n`,
        );
      }
    });
    afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

    it(
      'carries the deprecation on the deprecated component only',
      async () => {
        const {results} = (await search('tiles', {cwd: dir, type: 'component'}))
          .data;
        expect(results.find(r => r.name === 'TileColumns')).toMatchObject({
          package: '@acme/tiles',
          deprecated: deprecation,
        });
        expect(results.find(r => r.name === 'TileGrid')).not.toHaveProperty(
          'deprecated',
        );
      },
      SLOW,
    );
  });
});
