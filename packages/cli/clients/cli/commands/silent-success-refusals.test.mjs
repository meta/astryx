// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs'; import * as os from 'node:os'; import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(),'astryx-ss-')); fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'s',version:'1.0.0',dependencies:{'@astryxdesign/core':'0.6.3'}})); const c=path.join(dir,'node_modules','@astryxdesign','core'); fs.mkdirSync(c,{recursive:true}); fs.writeFileSync(path.join(c,'package.json'),JSON.stringify({name:'@astryxdesign/core',version:'0.6.3'})); });
afterEach(() => fs.rmSync(dir, {recursive:true,force:true}));
const json = async a => { const {status,stdout}=await runCli(['--json',...a],{cwd:dir}); return {status,body:JSON.parse(stdout)}; };
describe('refuse invalid input (IFIX-0007)', () => {
  it('template --type bogus', async () => { const {status,body}=await json(['template','--list','--type','bogus']); expect(status).toBe(1); expect(body.code).toBe('ERR_INVALID_ARGUMENT'); });
  it('template --package @nope/x', async () => { const {status,body}=await json(['template','--list','--package','@nope/x']); expect(status).toBe(1); expect(body.code).toBe('ERR_INVALID_ARGUMENT'); });
  it('template valid type+package filter keeps the matching templates', async () => { const {status,body}=await json(['template','--list','--type','block','--package','@astryxdesign/core']); expect(status).toBe(0); expect(body.type).toBe('template.list'); expect(body.data.length).toBeGreaterThan(0); expect(body.data.every(t => t.type === 'block')).toBe(true); });
  it('build --limit 2.5', async () => { const {status,body}=await json(['build','pricing','--limit','2.5']); expect(status).toBe(1); expect(body.code).toBe('ERR_INVALID_ARGUMENT'); });
  it('integration add excess args', async () => { fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'@t/p',version:'1.0.0'})); const {status}=await json(['integration','add','agent-doc','Run','acme','verify']); expect(status).toBe(1); });
});
