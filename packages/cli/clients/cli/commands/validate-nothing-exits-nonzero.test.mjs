// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs'; import * as os from 'node:os'; import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {validateIntegration} from '../../../api/integration/validate-integration.mjs';
import {integrationTemplateConflicts, integrationComponentConflicts, integrationDocConflicts} from '../../../api/integration/authoring-checks.mjs';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(),'astryx-val-')); });
afterEach(() => fs.rmSync(dir, {recursive:true,force:true}));
const json = async a => { const {status,stdout}=await runCli(['--json',...a],{cwd:dir}); return {status,body:JSON.parse(stdout)}; };
const text = async a => runCli(a, {cwd: dir});

describe('doctor integration validate exit codes (IFIX-0008)', () => {
  it('exits 1 with no package.json (JSON has no_package issue)', async () => {
    const {status, body} = await json(['doctor','integration','validate']);
    expect(status).toBe(1);
    expect(body.data.validated).toBe(false);
    expect(body.data.issues).toEqual([
      expect.objectContaining({code: 'no_package', severity: 'error'}),
    ]);
  });

  it('text mode says no package.json when there is none', async () => {
    const {status, stdout} = await text(['doctor','integration','validate']);
    expect(status).toBe(1);
    expect(stdout).toContain('no package.json found');
  });

  it('exits 0 with package.json but no manifest (byte-identical to published)', async () => {
    fs.writeFileSync(path.join(dir,'package.json'), JSON.stringify({name:'myapp',version:'1.0.0'}));
    const {status, body} = await json(['doctor','integration','validate']);
    expect(status).toBe(0);
    expect(body.data).toEqual({validated: false, name: null, version: null, issues: []});
  });

  it('text mode says no manifest when package.json exists', async () => {
    fs.writeFileSync(path.join(dir,'package.json'), JSON.stringify({name:'myapp',version:'1.0.0'}));
    const {status, stdout} = await text(['doctor','integration','validate']);
    expect(status).toBe(0);
    expect(stdout).toContain('no astryx.integration');
  });

  it('exported API returns the no_package issue', async () => {
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(result.type).toBe('integration.validate');
    expect(result.data.validated).toBe(false);
    expect(result.data.issues).toEqual([
      expect.objectContaining({code: 'no_package', severity: 'error'}),
    ]);
  });

  it('integration verify exits 1 with a data envelope', async () => {
    const {status, body} = await json(['integration','verify']);
    expect(status).toBe(1);
    expect(body.type).toBe('integration.pack-check');
    expect(body.data.issues.some(i => i.code === 'no_package')).toBe(true);
  });

  it('sibling commands stay unchanged with no package.json', async () => {
    for (const sub of ['templates', 'components', 'docs']) {
      const {status, body} = await json(['doctor','integration', sub]);
      expect(status, `doctor integration ${sub}`).toBe(0);
      expect(body.data.validated).toBe(false);
      expect(body.data.issues).toEqual([]);
    }
  });
});
