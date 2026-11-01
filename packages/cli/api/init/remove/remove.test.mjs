// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs'; import * as path from 'node:path'; import * as os from 'node:os';
import {init} from '../init.mjs'; import {remove} from './remove.mjs'; import {logger} from '../../logger.mjs';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-rm-')); fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'c',version:'1.0.0'})); });
afterEach(() => { fs.rmSync(dir,{recursive:true,force:true}); logger.setSilent(true); });
describe('init.remove says whether anything was removed', () => {
  it('false on clean', async () => { const r=await remove({cwd:dir}); expect(r.type).toBe('init.remove'); expect(r.data.removed).toBe(false); });
  it('true then false', async () => { await init({features:['agents']},{cwd:dir}); expect(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8')).toContain('<!-- ASTRYX:START -->'); const a=await remove({cwd:dir}); expect(a.data.removed).toBe(true); const b=await remove({cwd:dir}); expect(b.data.removed).toBe(false); });
  it('human line', async () => { const l=[]; const s=vi.spyOn(console,'log').mockImplementation((...a)=>l.push(a.join(' '))); logger.setSilent(false); try{await remove({cwd:dir});}finally{logger.setSilent(true);s.mockRestore();} expect(l.join('\n')).toContain('Nothing to remove'); });
});

describe('init.remove acts where init writes, the project root, and in the folder it runs in', () => {
  /** @type {string} */
  let project;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-rm-root-'));
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '1.0.0'}}),
    );
    fs.mkdirSync(path.join(project, 'src', 'app'), {recursive: true});
  });
  afterEach(() => { fs.rmSync(project, {recursive: true, force: true}); });
  const block = '<!-- ASTRYX:START -->\nAstryx v0.7.0 · old\n<!-- ASTRYX:END -->\n';

  it('removes from a subfolder what init wrote at the project root', async () => {
    const sub = path.join(project, 'src', 'app');
    const written = await init({features: ['agents']}, {cwd: sub});
    expect(written.data.docsWritten).toEqual(['../../AGENTS.md', '../../GEMINI.md']);

    const r = await remove({cwd: sub});
    expect(r).toEqual({type: 'init.remove', data: {removed: true}});
    // Both files held only what init wrote, so they are deleted.
    expect(fs.existsSync(path.join(project, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(project, 'GEMINI.md'))).toBe(false);
    expect((await remove({cwd: sub})).data.removed).toBe(false);
  });

  it('removes a block an earlier version left in the subfolder, and keeps the files\' own text', async () => {
    const sub = path.join(project, 'src', 'app');
    fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Agents\n\nRoot rules.\n\n${block}`);
    fs.writeFileSync(path.join(sub, 'AGENTS.md'), `# App\n\nApp rules.\n\n${block}`);

    expect((await remove({cwd: sub})).data.removed).toBe(true);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8').trimEnd()).toBe('# Agents\n\nRoot rules.');
    expect(fs.readFileSync(path.join(sub, 'AGENTS.md'), 'utf8').trimEnd()).toBe('# App\n\nApp rules.');
  });

  it('run at the project root, leaves a subfolder alone', async () => {
    const sub = path.join(project, 'src', 'app');
    fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Agents\n\n${block}`);
    fs.writeFileSync(path.join(sub, 'AGENTS.md'), `# App\n\n${block}`);

    expect((await remove({cwd: project})).data.removed).toBe(true);
    expect(fs.readFileSync(path.join(sub, 'AGENTS.md'), 'utf8')).toContain('<!-- ASTRYX:START -->');
  });

  it('below the root, leaves a root agent file linked outside the project with a note, and removes the rest (0.7.x exited 0)', async () => {
    // A workspace member whose CLAUDE.md links to the monorepo's.
    const monorepo = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-rm-mono-'));
    try {
      const web = path.join(monorepo, 'apps', 'web');
      const sub = path.join(web, 'src');
      fs.mkdirSync(sub, {recursive: true});
      fs.writeFileSync(
        path.join(web, 'package.json'),
        JSON.stringify({name: 'web', dependencies: {'@astryxdesign/core': '1.0.0'}}),
      );
      fs.writeFileSync(path.join(monorepo, 'CLAUDE.md'), `# Shared\n\n${block}`);
      fs.symlinkSync('../../CLAUDE.md', path.join(web, 'CLAUDE.md'));
      fs.writeFileSync(path.join(web, 'AGENTS.md'), `# Web\n\n${block}`);
      fs.writeFileSync(path.join(sub, 'AGENTS.md'), `# Src\n\n${block}`);
      const warned = [];
      const warn = vi.spyOn(console, 'error').mockImplementation((...a) => warned.push(a.join(' ')));
      logger.setSilent(false);
      let r;
      try {
        r = await remove({cwd: sub});
      } finally {
        logger.setSilent(true);
        warn.mockRestore();
      }
      expect(r).toEqual({type: 'init.remove', data: {removed: true}});
      expect(fs.readFileSync(path.join(web, 'AGENTS.md'), 'utf8').trimEnd()).toBe('# Web');
      expect(fs.readFileSync(path.join(sub, 'AGENTS.md'), 'utf8').trimEnd()).toBe('# Src');
      // The file outside the project keeps its block.
      expect(fs.readFileSync(path.join(monorepo, 'CLAUDE.md'), 'utf8')).toContain('<!-- ASTRYX:START -->');
      expect(warned.join('\n')).toMatch(/Note: Left as it is: \.\.\/CLAUDE\.md \(/u);
    } finally {
      fs.rmSync(monorepo, {recursive: true, force: true});
    }
  });

  it('at the root, a root agent file linked outside the project still refuses the run', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-rm-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'CLAUDE.md'), `# Shared\n\n${block}`);
      fs.symlinkSync(path.join(outside, 'CLAUDE.md'), path.join(project, 'CLAUDE.md'));
      fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Agents\n\n${block}`);
      await expect(remove({cwd: project})).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
      expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8')).toContain('<!-- ASTRYX:START -->');
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });

  it('a link in the subfolder that escapes it refuses the run before anything is written', async () => {
    const sub = path.join(project, 'src', 'app');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-rm-outside-'));
    try {
      fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Agents\n\n${block}`);
      fs.writeFileSync(path.join(outside, 'CLAUDE.md'), `# Shared\n\n${block}`);
      fs.symlinkSync(path.join(outside, 'CLAUDE.md'), path.join(sub, 'CLAUDE.md'));

      await expect(remove({cwd: sub})).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
      expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8')).toContain('<!-- ASTRYX:START -->');
      expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf8')).toContain('<!-- ASTRYX:START -->');
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});
