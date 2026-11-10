// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `integration check` warns about each icon a template imports but
 * does not declare in its `icons` (`template_icon_undeclared`), in a package
 * whose templates declare `icons`. The warning fails `--strict`. A package
 * that never declares `icons` sees no change.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateIntegration} from './validate-integration.mjs';
import {integrationCheck} from './check/check.mjs';
import {undeclaredTemplateIcons} from '../../foundation/discovery/template-icons.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-undeclared-'));
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
function write(rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
}

/**
 * A package with one block template.
 * @param {string} icons the doc's `icons` field, or '' for none
 * @param {string} source the template source
 */
function writePackage(icons, source) {
  write(
    'package.json',
    JSON.stringify({
      name: '@acme/blocks',
      version: '1.0.0',
      peerDependencies: {'@astryxdesign/cli': '>=0.7.4'},
    }),
  );
  write(
    'astryx.integration.mjs',
    "export default {templates: './templates'};\n",
  );
  write('templates/acme-bar.tsx', source);
  write(
    'templates/acme-bar.doc.mjs',
    `export default {type: 'block', name: 'Acme bar', description: 'A bar.', aspectRatio: 2, componentsUsed: []${icons}};\n`,
  );
}

const SOURCE = [
  "import {TrashIcon, ScissorsIcon} from '@acme/glyphs';",
  "import {Button} from '@astryxdesign/core/Button';",
  'export default function AcmeBar() { return <Button icon={<TrashIcon />} label={<ScissorsIcon />} />; }',
  '',
].join('\n');

/** @returns {Promise<any>} */
async function validated() {
  return (await validateIntegration(undefined, {cwd: dir})).data;
}

describe('template_icon_undeclared', () => {
  it('warns about an imported icon the template does not declare, and fails --strict', async () => {
    writePackage(", icons: {TrashIcon: 'delete'}", SOURCE);
    const data = await validated();
    const found = data.issues.filter(
      (/** @type {any} */ issue) => issue.code === 'template_icon_undeclared',
    );
    expect(found).toEqual([
      {
        code: 'template_icon_undeclared',
        severity: 'warning',
        message: expect.stringContaining(
          'templates/acme-bar.tsx imports icon "ScissorsIcon" from @acme/glyphs, but templates/acme-bar.doc.mjs does not declare it',
        ),
      },
    ]);
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(JSON.stringify(strict.data.failures)).toContain(
      'template_icon_undeclared',
    );
  }, 60_000);

  it('says nothing in a package whose templates declare no icons', async () => {
    writePackage('', SOURCE);
    const data = await validated();
    expect(JSON.stringify(data.issues)).not.toContain(
      'template_icon_undeclared',
    );
  }, 60_000);

  it('says nothing when every icon is declared', async () => {
    writePackage(", icons: {TrashIcon: 'delete', ScissorsIcon: 'cut'}", SOURCE);
    const data = await validated();
    expect(JSON.stringify(data.issues)).not.toContain(
      'template_icon_undeclared',
    );
  }, 60_000);
});

describe('undeclaredTemplateIcons', () => {
  it('counts a name ending in Icon, and any import from a module another template declares an icon from', () => {
    expect(
      undeclaredTemplateIcons([
        {
          id: 'a',
          source:
            "import {Trash, Cut} from 'glyphs';\nimport {format} from 'date-fns';\nimport {useState} from 'react';\nimport {HomeIcon} from 'other';\n",
          declared: {Trash: 'delete'},
        },
        {
          id: 'b',
          source:
            "import {Scan} from 'glyphs';\nimport type {LinkIcon} from 'other';\nimport {Local} from './LocalIcon';\n",
          declared: {},
        },
      ]),
    ).toEqual([
      {id: 'a', key: 'Cut', module: 'glyphs'},
      {id: 'a', key: 'HomeIcon', module: 'other'},
      {id: 'b', key: 'Scan', module: 'glyphs'},
    ]);
  });

  it('never counts an import from an Astryx package', () => {
    expect(
      undeclaredTemplateIcons([
        {
          id: 'a',
          source:
            "import {Icon, Table as TableIcon} from '@astryxdesign/core/Icon';\n",
          declared: {},
        },
      ]),
    ).toEqual([]);
  });
});
