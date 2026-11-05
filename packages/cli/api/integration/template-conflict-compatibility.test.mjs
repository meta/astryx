// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Final-0.6.x compatibility coverage for integration-template conflicts.
 * @input A future replacement declaration plus an ordinary released conflict.
 * @output Proof that 0.6.x omits replacement-specific public fields.
 * @position Regression fixture for the stable conflict response boundary.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {discoverCoreTemplates} from '../../foundation/discovery/template-adapter.mjs';
import {integrationTemplateConflicts} from './authoring-checks.mjs';

let tmpDir;

function writeTemplate(pkgDir, id, type, replaces) {
  const stem = path.join(pkgDir, 'templates', id);
  fs.mkdirSync(path.dirname(stem), {recursive: true});
  fs.writeFileSync(
    `${stem}.doc.mjs`,
    `export default {type: ${JSON.stringify(type)}, name: ${JSON.stringify(id)}, description: 'fixture'${replaces == null ? '' : `, replaces: ${JSON.stringify(replaces)}`}};\n`,
  );
  fs.writeFileSync(
    `${stem}.tsx`,
    `export default function Fixture() { return ${JSON.stringify(id)}; }\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-template-conflict-compat-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration-template conflict compatibility on 0.6.x', () => {
  it('preserves the released warning-only conflict shape', async () => {
    const corePages = (await discoverCoreTemplates()).filter(
      candidate => candidate.type === 'page',
    );
    const target = corePages[0];
    const accidental = corePages[1];
    expect(target).toBeDefined();
    expect(accidental).toBeDefined();

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {templates: './templates'};\n`,
    );
    writeTemplate(tmpDir, 'acme-future-shell', target.type, target.dirName);
    writeTemplate(tmpDir, accidental.dirName, accidental.type);

    const report = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(report.data.issues).toEqual([]);
    expect(report.data.conflicts).toHaveLength(1);
    expect(report.data.conflicts[0]).toMatchObject({
      id: accidental.dirName,
      severity: 'warning',
    });
    expect(report.data.conflicts[0]).not.toHaveProperty('relationship');
    expect(report.data.conflicts[0]).not.toHaveProperty('replaces');
  });
});
