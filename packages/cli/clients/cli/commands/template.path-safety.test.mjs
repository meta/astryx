// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path-traversal regression tests for `astryx template <name> <path>`.
 *
 * Drives the template API directly (it owns destination resolution +
 * path-safety enforcement). Spawning the CLI bin is unnecessary because
 * `template()` resolves and writes to disk itself.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  tempFolderOf,
  tempFolders,
} from '../../../foundation/fs/path-safety.mjs';

// Where the temp folder holds the home folder (some containers), it takes no
// scratch copy; path-safety.test.mjs covers that case.
const tmpTakesScratch = tempFolderOf(os.tmpdir()) !== null;

let tmpDir;
let templateApi;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-paths-'));
  templateApi = (await import('../../../api/template/template.mjs')).template;
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
});

/**
 * An absolute path outside the project and outside the system temp folder,
 * where a scratch copy may go: a folder at the disk's root that is not there.
 * @param {...string} parts
 */
const nowhere = (...parts) =>
  path.join(path.parse(tmpDir).root, 'astryx-no-such-folder', ...parts);

describe('template path safety', () => {
  it('rejects targetPath with ../ traversal and writes no file outside cwd', async () => {
    const cwd = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(cwd, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});

    await expect(
      templateApi('blank', {targetPath: '../outside/leaked', cwd}),
    ).rejects.toThrow(/traversal|outside the project root/i);

    // Nothing escaped.
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('refuses an absolute targetPath outside the project and names commands that work', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});
    const absTarget = nowhere('absolute-out');

    const err = await templateApi('blank', {targetPath: absTarget, cwd}).catch(
      e => e,
    );
    expect(err.code).toBe('ERR_PATH_TRAVERSAL');
    expect(err.message).toMatch(/outside the project root/i);
    const [scratchFolder] = tempFolders();
    expect(err.message).toContain(
      scratchFolder
        ? `as a scratch copy in the system temp folder (${scratchFolder})`
        : 'The template is written only inside the project.',
    );
    expect(err.suggestions).toEqual([
      {
        name: 'astryx template blank src/pages/blank.tsx',
        reason: 'write the page inside the project',
      },
      {
        name: 'astryx template blank',
        reason: 'print the source and write nothing',
      },
    ]);

    expect(fs.existsSync(absTarget)).toBe(false);
    expect(fs.readdirSync(cwd)).toEqual([]);
  });

  it('keeps the flags as typed in the suggested commands', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});

    const err = await templateApi('blank', {
      targetPath: nowhere('scratch'),
      type: 'page',
      package: '@astryxdesign/core',
      cwd,
    }).catch(e => e);
    expect(err.suggestions.map(s => s.name)).toEqual([
      'astryx template blank --type page --package @astryxdesign/core src/pages/blank.tsx',
      'astryx template blank --type page --package @astryxdesign/core',
    ]);
  });

  it('names the App Router folder in a Next app that has one, and the named command writes there', async () => {
    for (const [router, expected] of [
      ['app', 'app/blank'],
      ['src/app', 'src/app/blank'],
    ]) {
      const cwd = path.join(tmpDir, `project-${router.replace('/', '-')}`);
      fs.mkdirSync(path.join(cwd, router), {recursive: true});
      fs.writeFileSync(
        path.join(cwd, 'package.json'),
        JSON.stringify({dependencies: {next: '^16.0.0'}}),
      );

      const err = await templateApi('blank', {
        targetPath: nowhere('scratch'),
        cwd,
      }).catch(e => e);
      expect(err.code).toBe('ERR_PATH_TRAVERSAL');
      expect(err.suggestions[0].name).toBe(`astryx template blank ${expected}`);

      const written = await templateApi('blank', {targetPath: expected, cwd});
      expect(written.data.outputDir).toBe(path.normalize(expected));
      expect(
        fs.existsSync(path.join(cwd, 'src', 'pages')),
        'src/pages beside an app/ folder stops a Next build',
      ).toBe(false);
    }
  });

  it('names the page or block file in a project that is not a Next app, and the named command writes exactly that file', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({dependencies: {vite: '^8.0.0'}}),
    );

    const err = await templateApi('blank', {
      targetPath: nowhere('scratch'),
      cwd,
    }).catch(e => e);
    const named = err.suggestions[0].name.split(' ').at(-1);
    expect(named).toBe('src/pages/blank.tsx');

    await templateApi('blank', {targetPath: named, cwd});
    expect(fs.existsSync(path.join(cwd, named))).toBe(true);
    expect(fs.readdirSync(path.join(cwd, 'src', 'pages'))).toEqual([
      'blank.tsx',
    ]);

    const blockErr = await templateApi('ButtonShowcase', {
      targetPath: nowhere('scratch-block'),
      cwd,
    }).catch(e => e);
    const namedBlock = blockErr.suggestions[0].name.split(' ').at(-1);
    expect(namedBlock).toBe('src/components/ButtonShowcase.tsx');

    await templateApi('ButtonShowcase', {targetPath: namedBlock, cwd});
    expect(fs.readdirSync(path.join(cwd, 'src', 'components'))).toEqual([
      'ButtonShowcase.tsx',
    ]);
  });

  it('names the page file in a Next app with only the Pages Router, and the named command writes it', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(path.join(cwd, 'pages'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({dependencies: {next: '^16.0.0'}}),
    );

    const err = await templateApi('blank', {
      targetPath: nowhere('scratch'),
      cwd,
    }).catch(e => e);
    expect(err.suggestions[0].name).toBe(
      'astryx template blank pages/blank.tsx',
    );

    const written = await templateApi('blank', {
      targetPath: 'pages/blank.tsx',
      cwd,
    });
    expect(written.data.outputDir).toBe('pages');
    expect(written.data.fileName).toBe('blank.tsx');
  });

  it('quotes a folder a shell would read otherwise, and the quoted path writes there', async () => {
    for (const [layouts, expected] of [
      [['(marketing)', '(shop)'], 'app/(marketing)/blank'],
      [['[locale]'], 'app/[locale]/blank'],
    ]) {
      const cwd = path.join(tmpDir, `project-${layouts.length}`);
      for (const folder of layouts) {
        fs.mkdirSync(path.join(cwd, 'app', folder), {recursive: true});
        fs.writeFileSync(
          path.join(cwd, 'app', folder, 'layout.tsx'),
          'export default function Layout() {}\n',
        );
      }
      fs.writeFileSync(
        path.join(cwd, 'package.json'),
        JSON.stringify({dependencies: {next: '^16.0.0'}}),
      );

      const err = await templateApi('blank', {
        targetPath: nowhere('scratch'),
        cwd,
      }).catch(e => e);
      expect(err.suggestions[0].name).toBe(
        `astryx template blank '${expected}'`,
      );

      const written = await templateApi('blank', {targetPath: expected, cwd});
      expect(written.data.outputDir).toBe(path.normalize(expected));
    }
  });

  it('names a fresh folder when the app already has one for that id', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(path.join(cwd, 'app', 'blank'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({dependencies: {next: '^16.0.0'}}),
    );
    fs.writeFileSync(path.join(cwd, 'app', 'blank', 'page.tsx'), 'mine\n');

    const err = await templateApi('blank', {
      targetPath: nowhere('scratch'),
      cwd,
    }).catch(e => e);
    expect(err.suggestions[0].name).toBe('astryx template blank app/blank-2');
    await templateApi('blank', {targetPath: 'app/blank-2', cwd});
    expect(
      fs.readFileSync(path.join(cwd, 'app', 'blank', 'page.tsx'), 'utf8'),
    ).toBe('mine\n');
  });

  it('writes an absolute targetPath inside the project as its relative form', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});
    const relative = await templateApi('blank', {
      targetPath: 'src/pages/rel',
      cwd,
    });
    const absolute = await templateApi('blank', {
      targetPath: path.join(cwd, 'src', 'pages', 'abs'),
      cwd,
    });

    expect(absolute.data.outputDir).toBe(path.join('src', 'pages', 'abs'));
    expect(absolute.data.givenPath).toBe(path.join(cwd, 'src', 'pages', 'abs'));
    expect(relative.data).not.toHaveProperty('givenPath');
    expect(
      fs.readFileSync(path.join(cwd, 'src/pages/abs/page.tsx'), 'utf8'),
    ).toBe(fs.readFileSync(path.join(cwd, 'src/pages/rel/page.tsx'), 'utf8'));
  });

  it('writes an absolute file path inside the project to that file', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});
    const result = await templateApi('blank', {
      targetPath: path.join(cwd, 'app', 'home.tsx'),
      cwd,
    });
    expect(result.data.outputDir).toBe('app');
    expect(result.data.fileName).toBe('home.tsx');
    expect(fs.statSync(path.join(cwd, 'app', 'home.tsx')).isFile()).toBe(true);
  });

  it('accepts the project root itself, given as an absolute path', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});
    const result = await templateApi('blank', {
      targetPath: cwd + path.sep,
      cwd,
    });
    expect(result.data.outputDir).toBe('.');
    expect(fs.existsSync(path.join(cwd, 'page.tsx'))).toBe(true);
  });

  it('reads an absolute path through a symlinked project root as inside the project', async () => {
    const real = path.join(tmpDir, 'real-project');
    const link = path.join(tmpDir, 'linked-project');
    fs.mkdirSync(real, {recursive: true});
    fs.symlinkSync(real, link, 'dir');

    // The shell reports the real folder; the agent types the linked one.
    const viaLink = await templateApi('blank', {
      targetPath: path.join(link, 'src', 'dash'),
      cwd: real,
    });
    expect(viaLink.data.outputDir).toBe(path.join('src', 'dash'));
    expect(fs.existsSync(path.join(real, 'src', 'dash', 'page.tsx'))).toBe(
      true,
    );

    // And the other way round: cwd through the link, the path through the real folder.
    const viaReal = await templateApi('blank', {
      targetPath: path.join(real, 'src', 'other'),
      cwd: link,
    });
    expect(viaReal.data.outputDir).toBe(path.join('src', 'other'));
    expect(fs.existsSync(path.join(real, 'src', 'other', 'page.tsx'))).toBe(
      true,
    );
  });

  it('reads a symlinked project folder the same way in every caller', async () => {
    const {refusedOutput} = await import('../../../api/theme/build/build.mjs');
    const real = path.join(tmpDir, 'real-project');
    const link = path.join(tmpDir, 'linked-project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(real, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});
    fs.symlinkSync(real, link, 'dir');
    fs.symlinkSync(outside, path.join(real, 'escape'), 'dir');

    /** @param {Promise<unknown> | (() => unknown)} run */
    const verdict = async run => {
      try {
        await (typeof run === 'function' ? run() : run);
        return 'written';
      } catch (err) {
        return err.code;
      }
    };
    let n = 0;
    for (const [cwd, other] of [
      [real, link],
      [link, real],
    ]) {
      for (const [sub, expected] of [
        ['src', 'written'],
        ['escape', 'ERR_PATH_TRAVERSAL'],
      ]) {
        n += 1;
        const dir = path.join(other, sub, `t${n}`);
        expect(
          await verdict(templateApi('blank', {targetPath: dir, cwd})),
        ).toBe(expected);
        expect(
          await verdict(
            templateApi(undefined, {cdn: path.join(dir, 'p.html'), cwd}),
          ),
        ).toBe(expected);
        expect(refusedOutput(path.join(dir, 'theme.css'), cwd)).toBe(
          expected !== 'written',
        );
      }
    }
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('refuses an absolute path inside the project that a symlink carries outside', async () => {
    const cwd = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(cwd, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});
    fs.symlinkSync(outside, path.join(cwd, 'escape'), 'dir');

    await expect(
      templateApi('blank', {targetPath: path.join(cwd, 'escape', 'leak'), cwd}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it.skipIf(!tmpTakesScratch)(
    'reads a sibling folder whose name starts with the project name as outside it',
    async () => {
      const cwd = path.join(tmpDir, 'project');
      fs.mkdirSync(cwd, {recursive: true});
      const sibling = path.join(tmpDir, 'project-scratch');

      // The sibling is in the temp folder, so it takes a scratch copy, named
      // by its whole path rather than as a folder of the project.
      const written = await templateApi('blank', {targetPath: sibling, cwd});
      expect(written.data.outputDir).toBe(sibling);
      expect(written.data.givenPath).toBeUndefined();
      expect(fs.readdirSync(cwd)).toEqual([]);
    },
  );

  it.skipIf(!tmpTakesScratch)(
    'writes a scratch copy to a path in the system temp folder, with the checks a project write has',
    async () => {
      const cwd = path.join(tmpDir, 'project');
      fs.mkdirSync(cwd, {recursive: true});
      const scratch = path.join(tmpDir, 'scratch', 'blank');

      const written = await templateApi('blank', {targetPath: scratch, cwd});
      expect(written.data.outputDir).toBe(scratch);
      expect(written.data.fileName).toBe('page.tsx');
      expect(written.data.givenPath).toBeUndefined();
      expect(fs.existsSync(path.join(scratch, 'page.tsx'))).toBe(true);
      expect(fs.readdirSync(cwd)).toEqual([]);

      await expect(
        templateApi('blank', {targetPath: scratch, cwd}),
      ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    },
  );

  it.skipIf(process.platform === 'win32')(
    'takes /tmp as a temp folder on a POSIX system, unless it holds the home folder',
    async () => {
      const cwd = path.join(tmpDir, 'project');
      fs.mkdirSync(cwd, {recursive: true});
      const scratch = fs.mkdtempSync('/tmp/astryx-scratch-');
      try {
        const target = path.join(scratch, 'dash');
        if (tempFolderOf(target) === null) {
          await expect(
            templateApi('blank', {targetPath: target, cwd}),
          ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
          return;
        }
        const written = await templateApi('blank', {targetPath: target, cwd});
        expect(written.data.outputDir).toBe(target);
      } finally {
        fs.rmSync(scratch, {recursive: true, force: true});
      }
    },
  );

  it.skipIf(!tmpTakesScratch)(
    'refuses a scratch copy that a link carries out of the temp folder',
    async () => {
      const cwd = path.join(tmpDir, 'project');
      fs.mkdirSync(cwd, {recursive: true});
      fs.symlinkSync(nowhere(), path.join(tmpDir, 'escape'), 'dir');

      await expect(
        templateApi('blank', {
          targetPath: path.join(tmpDir, 'escape', 'x'),
          cwd,
        }),
      ).rejects.toMatchObject({
        code: 'ERR_PATH_TRAVERSAL',
        message: expect.stringMatching(/out of the temp folder/),
      });
      expect(fs.existsSync(nowhere())).toBe(false);
    },
  );

  it('writes an absolute --cdn path inside the project and refuses one outside', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});

    const inside = await templateApi(undefined, {
      cdn: path.join(cwd, 'public', 'demo.html'),
      cwd,
    });
    expect(inside.data.path).toBe(path.join('public', 'demo.html'));
    expect(fs.existsSync(path.join(cwd, 'public', 'demo.html'))).toBe(true);

    const outsidePath = path.join(tmpDir, 'demo.html');
    const err = await templateApi(undefined, {cdn: outsidePath, cwd}).catch(
      e => e,
    );
    expect(err.code).toBe('ERR_PATH_TRAVERSAL');
    expect(err.suggestions[0].name).toBe(
      'astryx template --cdn cdn.template.html',
    );
    expect(fs.existsSync(outsidePath)).toBe(false);
  });

  it('treats targetPath with .tsx extension as a file, not a directory', async () => {
    const cwd = path.join(tmpDir, 'project');
    fs.mkdirSync(cwd, {recursive: true});

    // Use a real template name from the discovered set.
    const {discoverTemplates} =
      await import('../../../api/template/template.mjs');
    const all = await discoverTemplates();
    const page = all.find(t => t.type === 'page');
    if (!page) {
      // No page templates packaged in this checkout — skip without failing the suite.
      return;
    }

    const result = await templateApi(page.dirName, {
      targetPath: './foo.tsx',
      cwd,
    });

    // The file MUST be at ./foo.tsx, not ./foo.tsx/page.tsx.
    expect(result.type).toBe('template.copy');
    expect(result.data.fileName).toBe('foo.tsx');

    expect(fs.existsSync(path.join(cwd, 'foo.tsx'))).toBe(true);
    expect(fs.statSync(path.join(cwd, 'foo.tsx')).isFile()).toBe(true);
    // The bad-old behavior would have left foo.tsx as a directory.
    expect(fs.statSync(path.join(cwd, 'foo.tsx')).isDirectory()).toBe(false);
  });
});

describe('template path text output', () => {
  it('says an absolute path inside the project was written as its relative path', async () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
    const result = await runCli(
      ['template', 'blank', path.join(cwd, 'src', 'dash')],
      cwd,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `Copied template to ${path.join('src', 'dash')}/page.tsx`,
    );
    expect(result.stdout).toContain(
      `${path.join(cwd, 'src', 'dash')} is inside the project, so it was written as its relative path, ${path.join('src', 'dash')}.`,
    );
  }, 60_000);

  it('says an absolute file path inside the project was written as its relative file path', async () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
    const result = await runCli(
      ['template', 'blank', path.join(cwd, 'app', 'home.tsx')],
      cwd,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Copied template to app/home.tsx');
    expect(result.stdout).toContain(
      `${path.join(cwd, 'app', 'home.tsx')} is inside the project, so it was written as its relative path, ${path.join('app', 'home.tsx')}.`,
    );
  }, 60_000);

  it('names the file when an absolute file path has a ./ segment', async () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
    const given = `${path.join(cwd, 'app', 'app')}${path.sep}.${path.sep}other.tsx`;
    const result = await runCli(['template', 'blank', given], cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `${given} is inside the project, so it was written as its relative path, ${path.join('app', 'app', 'other.tsx')}.`,
    );
  }, 60_000);

  it('names the file when an absolute file path normalises a ../ segment', async () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
    const given = `${path.join(cwd, 'app', 'tmp')}${path.sep}..${path.sep}home.tsx`;
    const result = await runCli(['template', 'blank', given], cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `${given} is inside the project, so it was written as its relative path, ${path.join('app', 'home.tsx')}.`,
    );
  }, 60_000);

  it('names the folder when an absolute folder path has a ./ segment', async () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
    const given = `${path.join(cwd, 'src')}${path.sep}.${path.sep}dash`;
    const result = await runCli(['template', 'blank', given], cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `${given} is inside the project, so it was written as its relative path, ${path.join('src', 'dash')}.`,
    );
  }, 60_000);

  it.skipIf(!tmpTakesScratch)(
    'names the whole path of a scratch copy in the temp folder',
    async () => {
      const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
      const scratch = path.join(tmpDir, 'astryx_ref');
      const result = await runCli(['template', 'blank', scratch], cwd);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Copied template to ${scratch}/page.tsx`);
      expect(result.stdout).not.toContain('is inside the project');
    },
    60_000,
  );

  it('names the commands that work when the path is outside the project', async () => {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpDir, 'cli-')));
    const scratch = nowhere('astryx_dash');
    const result = await runCli(['template', 'blank', scratch], cwd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is outside the project root');
    expect(result.stderr).toMatch(
      /template blank src\/pages\/blank\.tsx\s+\(write the page inside the project\)/,
    );
    expect(result.stderr).toMatch(
      /template blank\s+\(print the source and write nothing\)/,
    );
    expect(fs.existsSync(scratch)).toBe(false);
  }, 60_000);
});
