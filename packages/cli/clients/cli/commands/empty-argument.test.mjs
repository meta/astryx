// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs'; import * as os from 'node:os'; import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-ea-')); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name:'s',version:'1.0.0',dependencies:{'@astryxdesign/core':'0.6.3'}})); fs.mkdirSync(path.join(dir,'src'),{recursive:true}); const c=path.join(dir,'node_modules','@astryxdesign','core'); fs.mkdirSync(c,{recursive:true}); fs.writeFileSync(path.join(c,'package.json'),JSON.stringify({name:'@astryxdesign/core',version:'0.6.3'})); });
afterEach(() => fs.rmSync(dir, {recursive:true,force:true}));
const json = async a => { const {status,stdout}=await runCli(['--json',...a],{cwd:dir}); return {status,body:JSON.parse(stdout)}; };
describe('an empty-string argument is rejected, not ignored', () => {
  it.each([['template',['template','','src/z.tsx'],'name'],['template path',['template','ai-chat',''],'path'],['swizzle',['swizzle',''],'component'],['discover',['discover',''],'query']])('%s', async (_,args,an) => { const {status,body}=await json(args); expect(status).toBe(1); expect(body.code).toBe('ERR_INVALID_ARGUMENT'); expect(body.error).toContain(`<${an}>`); });
  it('writes nothing', async () => { const b=fs.readdirSync(path.join(dir,'src')); await json(['template','ai-chat','']); expect(fs.readdirSync(path.join(dir,'src'))).toEqual(b); });
  it('exits same without --json', async () => { const {status,stderr}=await runCli(['template','','src/z.tsx'],{cwd:dir}); expect(status).toBe(1); expect(stderr).toContain('<name>'); });
  it('ignoring modes pass', async () => { for (const [a,t] of [[['template','','--list'],'template.list'],[['template','','--cdn'],'template.cdn'],[['template','ai-chat','','--skeleton'],'template.skeleton'],[['swizzle','','--list'],'swizzle.list']]) { const {status,body}=await json(a); expect(status).toBe(0); expect(body.type).toBe(t); } });
  it('bare --cdn empty path rejected', async () => { const {status,body}=await json(['template','ai-chat','','--cdn']); expect(status).toBe(1); expect(body.code).toBe('ERR_INVALID_ARGUMENT'); });
  it('omitted lists', async () => { for (const [a,t] of [[['template','--list'],'template.list'],[['discover'],'discover.list'],[['swizzle','--list'],'swizzle.list']]) { const {status,body}=await json(a); expect(status).toBe(0); expect(body.type).toBe(t); } });
});
