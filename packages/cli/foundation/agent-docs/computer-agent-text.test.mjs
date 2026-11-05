// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The computer-level agent text (spec AST-081 FR7, FR8): its two
 * renderings, version-free and naming only stable commands; the one file it
 * writes and the links it makes from the one table; what it keeps; exact
 * removal; the search-path check behind its warning; and the rule that only
 * `init --user` and the background step write it. Every test uses a temporary
 * home folder.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  SKILL_LINKS,
  STABLE_COMMANDS,
  astryxOnSearchPath,
  computerSkillFile,
  computerSkillLinks,
  inspectComputerAgentText,
  removeComputerAgentText,
  computerInstallStep,
  renderComputerAgentText,
  skillInstallStepOf,
  writeComputerAgentText,
} from './computer-agent-text.mjs';
import {
  MARKER_END,
  MARKER_START,
  SELF_CHECK_CSS,
  WORKFLOW_STEPS,
  WORKFLOW_TITLE,
} from './agent-doc-state.mjs';
import {runWithCliDoor} from '../env/cli-command.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {parse as parseYaml} from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '../..');
const CORE_ROOT = path.resolve(CLI_ROOT, '../core');

/**
 * An Astryx file as some other release would write it: the given text with
 * its hash line recorded.
 * @param {string} text
 * @returns {string}
 */
function unedited(text) {
  const hash = createHash('sha256').update(text).digest('hex');
  return text.replace(
    `${MARKER_START}\n`,
    `${MARKER_START}\n<!-- astryx-managed sha256:${hash} -->\n`,
  );
}

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
function tmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-user-${label}-`));
  dirs.push(dir);
  return dir;
}

let home = '';
beforeEach(() => {
  home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
});
afterEach(() => {
  vi.unstubAllEnvs();
  while (dirs.length) {
    fs.rmSync(/** @type {string} */ (dirs.pop()), {
      recursive: true,
      force: true,
    });
  }
});

const FILE = () => computerSkillFile(home);
const FOLDER = () => path.dirname(FILE());
const CLAUDE = () => path.join(home, '.claude', 'skills', 'astryx');

/** @param {string} at */
const isLinkToFolder = at =>
  fs.lstatSync(at).isSymbolicLink() &&
  fs.realpathSync(at) === fs.realpathSync(FOLDER());

describe('renderComputerAgentText', () => {
  it('a skill named astryx with a one-sentence when-to-use description, in strict YAML', () => {
    {
      const text = renderComputerAgentText({command: 'astryx'});
      const [, front] = text.split('---\n');
      const meta = parseYaml(front);
      expect(meta.name).toBe('astryx');
      expect(meta.description).toMatch(/design system and UI library/);
      expect(meta.description).toMatch(/building or changing UI/);
      expect(meta.description).toMatch(/@astryxdesign/);
      expect(
        meta.description.split(/[.!?](\s|$)/u).filter(Boolean),
      ).toHaveLength(1);
      expect(text).toContain(MARKER_START);
      expect(text).toContain(MARKER_END);
      expect(text).toContain(
        'Astryx, a design system and UI library, is available on this computer.',
      );
      expect(text).toContain(
        'Use it when you build or change UI, pick components, or style or theme an app.',
      );
      expect(text).toContain("Start with `astryx search '<what you need>'`.");
    }
  });

  it('is version-free and names only stable commands', () => {
    {
      const text = renderComputerAgentText({command: 'astryx'});
      // No version string anywhere: not a release, a Node range, or a tag.
      expect(text).not.toMatch(/\bv?\d+\.\d+(\.\d+)?\b/u);
      expect(text).not.toMatch(/@(latest|next|canary)\b/u);
      const commands = [...text.matchAll(/`astryx ([a-z-]+)/gu)].map(m => m[1]);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.filter(c => !STABLE_COMMANDS.includes(c))).toEqual([]);
    }
  });

  it('stays short, and tells agents to read docs through the CLI', () => {
    const text = renderComputerAgentText({command: 'astryx'});
    expect(text.split('\n').length).toBeLessThanOrEqual(22);
    expect(text).toContain(
      "Then read `astryx component <Name>` or `astryx docs <topic>`, not the package's files.",
    );
  });

  // Discovery alone leaves the build to the agent's own page route, which
  // may not install packages; the skill names the route and the project
  // agent docs' own workflow lines.
  it('gives the build workflow: a project with Astryx installed and init run, the shared template steps, then check and deliver the build', () => {
    const text = renderComputerAgentText({command: 'astryx'});
    expect(text).toContain(
      'To build UI, work in a project folder (create one if there is none). Add `@astryxdesign/core` and `@astryxdesign/cli` to a new project or one without `@astryxdesign/core`; to a project that already has `@astryxdesign/core`, add `@astryxdesign/cli` at the same version. Run `astryx init` there and follow the agent docs it writes.',
    );
    for (const line of [WORKFLOW_TITLE, ...WORKFLOW_STEPS]) {
      expect(text).toContain(line);
    }
    expect(text).toContain(`re-read each file; ${SELF_CHECK_CSS}.`);
    expect(text).toContain('deliver that build');
  });

  it("uses the host's door when one is set", () => {
    const text = runWithCliDoor('acme astryx', () => renderComputerAgentText());
    expect(text).toContain("`acme astryx search '<what you need>'`");
    expect(text).not.toMatch(/`astryx /u);
  });

  // A machine can keep the home folder and lose the CLI installed for the
  // computer, so the skill says how to get it back, with no version.
  it('names the install step for when `astryx` is not found, and only for the global command', () => {
    expect(
      renderComputerAgentText({
        command: 'astryx',
        install: 'npm i -g @astryxdesign/cli',
      }),
    ).toContain(
      'If `astryx` is not found, run `npm i -g @astryxdesign/cli` first.',
    );
    // It repeats the step that installed the copy writing it, which doctor
    // reads back.
    const bun = renderComputerAgentText({
      command: 'astryx',
      install: 'bun add -g @astryxdesign/cli',
    });
    expect(bun).toContain(
      'If `astryx` is not found, run `bun add -g @astryxdesign/cli` first.',
    );
    expect(skillInstallStepOf(bun)).toBe('bun add -g @astryxdesign/cli');
  });

  // Rendering is pure: its default step never depends on the skill in the
  // home folder of the computer the test runs on.
  it("renders npm's step by default, whatever skill the caller's home folder holds", () => {
    const home = tmp('caller-home');
    const file = computerSkillFile(home);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(
      file,
      renderComputerAgentText({
        command: 'astryx',
        install: 'pnpm add -g @astryxdesign/cli',
      }),
    );
    const saved = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(renderComputerAgentText({command: 'astryx'})).toContain(
        'run `npm i -g @astryxdesign/cli` first.',
      );
    } finally {
      process.env.HOME = saved;
    }
  });

  // Only the CLI installed for the computer chooses the step; every other
  // copy of the release, such as a project's own CLI, keeps the one the file
  // records, so it neither reports the file as different nor rewrites it.
  it('keeps the step the file records for a copy that is not installed for the computer', () => {
    const home = tmp('home');
    const file = computerSkillFile(home);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const pnpm = renderComputerAgentText({
      command: 'astryx',
      install: 'pnpm add -g @astryxdesign/cli',
    });
    fs.writeFileSync(file, pnpm);
    expect(computerInstallStep({home})).toBe('pnpm add -g @astryxdesign/cli');
    expect(inspectComputerAgentText({home, command: 'astryx'})[0].state).toBe(
      'current',
    );
    writeComputerAgentText({home, command: 'astryx'});
    expect(fs.readFileSync(file, 'utf8')).toBe(pnpm);
    // No file yet: npm's step.
    expect(computerInstallStep({home: tmp('empty-home')})).toBe(
      'npm i -g @astryxdesign/cli',
    );
    expect(renderComputerAgentText({command: 'acme astryx'})).not.toContain(
      'npm i -g',
    );
  });
});

describe('the link table', () => {
  it('is data: each entry names a skills folder, the folder it needs, and link or copy; Claude Code always', () => {
    expect(SKILL_LINKS[0]).toEqual({
      skills: path.join('.claude', 'skills'),
      when: null,
      mode: 'link',
    });
    for (const place of SKILL_LINKS) {
      expect(path.isAbsolute(place.skills)).toBe(false);
      expect(place.skills.endsWith('skills')).toBe(true);
      expect(['link', 'copy']).toContain(place.mode);
    }
    // Continue's scanner skips links, so it is the one copy.
    expect(
      SKILL_LINKS.filter(p => p.mode === 'copy').map(p => p.skills),
    ).toEqual([path.join('.continue', 'skills')]);
    // Never a store another tool manages.
    for (const place of SKILL_LINKS) {
      expect(place.skills).not.toBe(path.join('.codex', 'skills'));
      expect(place.skills).not.toBe(path.join('.config', 'muse', 'skills'));
    }
    expect(computerSkillLinks(home).map(l => l.wanted)).toEqual(
      SKILL_LINKS.map(l => l.when == null),
    );
  });
});

describe('links and the copy', () => {
  it.skipIf(process.platform === 'win32')(
    'links with a relative target',
    () => {
      writeComputerAgentText({home, command: 'astryx'});
      expect(fs.readlinkSync(CLAUDE())).toBe(
        path.join('..', '..', '.agents', 'skills', 'astryx'),
      );
    },
  );

  it('links ~/.config/agents/skills only when that folder already exists', () => {
    const kimi = path.join(home, '.config', 'agents', 'skills');
    expect(writeComputerAgentText({home, command: 'astryx'}).links).toEqual([
      CLAUDE(),
    ]);
    fs.mkdirSync(kimi, {recursive: true});
    expect(writeComputerAgentText({home, command: 'astryx'}).links).toEqual([
      CLAUDE(),
      path.join(kimi, 'astryx'),
    ]);
  });

  it('writes, refreshes, and removes a managed copy for Continue, whose scanner skips links', () => {
    fs.mkdirSync(path.join(home, '.continue'));
    const copy = path.join(home, '.continue', 'skills', 'astryx');
    const {rows, links} = writeComputerAgentText({home, command: 'astryx'});
    expect(rows).toContainEqual({path: copy, action: 'written'});
    expect(links).not.toContain(copy);
    expect(fs.lstatSync(copy).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(copy, 'SKILL.md'), 'utf8')).toBe(
      fs.readFileSync(FILE(), 'utf8'),
    );
    expect(
      writeComputerAgentText({home, command: 'astryx'}).rows,
    ).toContainEqual({
      path: copy,
      action: 'unchanged',
    });
    expect(removeComputerAgentText({home, links})).toContainEqual({
      path: copy,
      action: 'removed',
    });
    expect(fs.existsSync(copy)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'links from a ~/.claude that is itself a link to a dotfiles folder, with a target that resolves',
    () => {
      const dotfiles = path.join(home, 'dotfiles', '.claude');
      fs.mkdirSync(dotfiles, {recursive: true});
      fs.symlinkSync(dotfiles, path.join(home, '.claude'), 'dir');

      const {rows, links} = writeComputerAgentText({home, command: 'astryx'});

      expect(rows).toContainEqual({path: CLAUDE(), action: 'linked'});
      // The system resolves the link from the dotfiles folder, and it reaches
      // the skill folder.
      expect(isLinkToFolder(CLAUDE())).toBe(true);
      expect(fs.readFileSync(path.join(CLAUDE(), 'SKILL.md'), 'utf8')).toBe(
        fs.readFileSync(FILE(), 'utf8'),
      );
      expect(
        inspectComputerAgentText({home, command: 'astryx', links}),
      ).toContainEqual({
        path: CLAUDE(),
        state: 'linked',
        link: true,
      });
    },
  );

  it.skipIf(process.platform === 'win32')(
    'reports a link the system cannot follow as dangling, even when its text names the folder from the path',
    () => {
      const dotfiles = path.join(home, 'dotfiles', '.claude');
      fs.mkdirSync(path.join(dotfiles, 'skills'), {recursive: true});
      fs.symlinkSync(dotfiles, path.join(home, '.claude'), 'dir');
      writeComputerAgentText({home, command: 'astryx'});
      // A link as 0.7.x wrote it: relative to ~/.claude/skills, which the
      // system reads from ~/dotfiles/.claude/skills, so it dangles.
      fs.rmSync(CLAUDE());
      fs.symlinkSync(
        path.relative(path.dirname(CLAUDE()), FOLDER()),
        CLAUDE(),
        'dir',
      );
      expect(fs.existsSync(path.join(CLAUDE(), 'SKILL.md'))).toBe(false);

      const rows = inspectComputerAgentText({
        home,
        command: 'astryx',
        links: [CLAUDE()],
      });
      expect(rows.find(row => row.path === CLAUDE())?.state).toBe('dangling');
      // init --user remakes it so that it resolves.
      expect(
        writeComputerAgentText({home, command: 'astryx'}).rows,
      ).toContainEqual({
        path: CLAUDE(),
        action: 'linked',
      });
      expect(isLinkToFolder(CLAUDE())).toBe(true);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'writes the managed copy into a ~/.continue that is itself a link',
    () => {
      const real = path.join(home, 'dotfiles', '.continue');
      fs.mkdirSync(real, {recursive: true});
      fs.symlinkSync(real, path.join(home, '.continue'), 'dir');
      const copy = path.join(home, '.continue', 'skills', 'astryx');

      const {rows} = writeComputerAgentText({home, command: 'astryx'});

      expect(rows).toContainEqual({path: copy, action: 'written'});
      expect(
        fs.readFileSync(
          path.join(real, 'skills', 'astryx', 'SKILL.md'),
          'utf8',
        ),
      ).toBe(fs.readFileSync(FILE(), 'utf8'));
    },
  );

  it('reports a link whose folder is missing as dangling', () => {
    const {links} = writeComputerAgentText({home, command: 'astryx'});
    fs.rmSync(FOLDER(), {recursive: true});
    expect(inspectComputerAgentText({home, command: 'astryx', links})).toEqual([
      {path: FILE(), state: 'absent'},
      {path: CLAUDE(), state: 'dangling', link: true},
    ]);
  });
});

describe('write, refresh, keep, remove', () => {
  it('writes one file, links Claude Code to its folder, then reports both unchanged', () => {
    const first = writeComputerAgentText({home, command: 'astryx'});
    expect(first.rows).toEqual([
      {path: FILE(), action: 'written'},
      {path: CLAUDE(), action: 'linked'},
    ]);
    expect(first.links).toEqual([CLAUDE()]);
    expect(isLinkToFolder(CLAUDE())).toBe(true);
    // An agent reading the linked folder reads the one file.
    expect(fs.readFileSync(path.join(CLAUDE(), 'SKILL.md'), 'utf8')).toBe(
      fs.readFileSync(FILE(), 'utf8'),
    );
    expect(writeComputerAgentText({home, command: 'astryx'}).rows).toEqual([
      {path: FILE(), action: 'unchanged'},
      {path: CLAUDE(), action: 'unchanged'},
    ]);
  });

  it("links another agent's folder only when that agent's folder exists", () => {
    fs.mkdirSync(path.join(home, '.kiro'));
    const {links} = writeComputerAgentText({home, command: 'astryx'});
    expect(links).toEqual([
      CLAUDE(),
      path.join(home, '.kiro', 'skills', 'astryx'),
    ]);
    expect(fs.existsSync(path.join(home, '.continue'))).toBe(false);
  });

  it('refreshes only the file; the links follow', () => {
    writeComputerAgentText({home, command: 'astryx'});
    fs.writeFileSync(
      FILE(),
      unedited(
        `---\nname: astryx\n---\n\n${MARKER_START}\nold\n${MARKER_END}\n`,
      ),
    );
    expect(inspectComputerAgentText({home, command: 'astryx'})[0].state).toBe(
      'differs',
    );
    expect(writeComputerAgentText({home, command: 'astryx'}).rows).toEqual([
      {path: FILE(), action: 'written'},
      {path: CLAUDE(), action: 'unchanged'},
    ]);
    expect(fs.readFileSync(path.join(CLAUDE(), 'SKILL.md'), 'utf8')).toBe(
      renderComputerAgentText({command: 'astryx'}),
    );
  });

  it('keeps an edited file, a file without the markers, and anything at a link target Astryx did not create', () => {
    fs.mkdirSync(FOLDER(), {recursive: true});
    fs.writeFileSync(FILE(), 'my own notes\n');
    fs.mkdirSync(CLAUDE(), {recursive: true});
    fs.writeFileSync(path.join(CLAUDE(), 'SKILL.md'), 'my own skill\n');
    const {rows, links} = writeComputerAgentText({home, command: 'astryx'});
    expect(rows).toEqual([
      {path: FILE(), action: 'kept', reason: 'not-astryx'},
      {path: CLAUDE(), action: 'kept', reason: 'not-astryx'},
    ]);
    expect(links).toEqual([]);
    expect(fs.readFileSync(FILE(), 'utf8')).toBe('my own notes\n');
    expect(
      inspectComputerAgentText({home, command: 'astryx'}).map(e => e.state),
    ).toEqual(['foreign', 'foreign']);

    fs.writeFileSync(
      FILE(),
      `${renderComputerAgentText({command: 'astryx'})}edit\n`,
    );
    expect(writeComputerAgentText({home, command: 'astryx'}).rows[0]).toEqual({
      path: FILE(),
      action: 'kept',
      reason: 'edited',
    });
  });

  it('keeps a link that points somewhere else', () => {
    const elsewhere = tmp('elsewhere');
    fs.mkdirSync(path.dirname(CLAUDE()), {recursive: true});
    fs.symlinkSync(elsewhere, CLAUDE(), 'dir');
    const {rows} = writeComputerAgentText({home, command: 'astryx'});
    expect(rows[1]).toEqual({
      path: CLAUDE(),
      action: 'kept',
      reason: 'not-astryx',
    });
    expect(fs.realpathSync(CLAUDE())).toBe(fs.realpathSync(elsewhere));
  });

  it('replaces an unedited copy an earlier release left at a link target with the link', () => {
    fs.mkdirSync(CLAUDE(), {recursive: true});
    fs.writeFileSync(
      path.join(CLAUDE(), 'SKILL.md'),
      unedited(
        `---\nname: astryx\n---\n\n${MARKER_START}\nold\n${MARKER_END}\n`,
      ),
    );
    expect(writeComputerAgentText({home, command: 'astryx'}).rows[1]).toEqual({
      path: CLAUDE(),
      action: 'linked',
    });
    expect(isLinkToFolder(CLAUDE())).toBe(true);
  });

  it('removes the file and exactly the links it made, then reports the file absent', () => {
    const {links} = writeComputerAgentText({home, command: 'astryx'});
    // A link someone else made to the same folder is not Astryx's to remove.
    const theirs = path.join(home, 'mine', 'astryx');
    fs.mkdirSync(path.dirname(theirs), {recursive: true});
    fs.symlinkSync(FOLDER(), theirs, 'dir');
    expect(removeComputerAgentText({home, links})).toEqual([
      {path: FILE(), action: 'removed'},
      {path: CLAUDE(), action: 'removed'},
    ]);
    expect(fs.existsSync(CLAUDE())).toBe(false);
    expect(fs.existsSync(FOLDER())).toBe(false);
    expect(fs.lstatSync(theirs).isSymbolicLink()).toBe(true);
    expect(removeComputerAgentText({home, links: []})).toEqual([
      {path: FILE(), action: 'absent'},
    ]);
  });

  it('keeps an edited file on remove, and a recorded link someone repointed', () => {
    const {links} = writeComputerAgentText({home, command: 'astryx'});
    fs.unlinkSync(CLAUDE());
    fs.symlinkSync(tmp('other'), CLAUDE(), 'dir');
    fs.appendFileSync(FILE(), 'edit\n');
    expect(removeComputerAgentText({home, links})).toEqual([
      {path: FILE(), action: 'kept', reason: 'edited'},
    ]);
    expect(fs.existsSync(FILE())).toBe(true);
    expect(fs.lstatSync(CLAUDE()).isSymbolicLink()).toBe(true);
  });
});

describe.skipIf(process.platform === 'win32')('astryxOnSearchPath', () => {
  /** @param {string} file @param {string} content */
  function executable(file, content) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
    fs.chmodSync(file, 0o755);
  }

  /** A global prefix with the CLI package linked into its bin folder. */
  function linkedCli() {
    const prefix = tmp('prefix');
    const pkg = path.join(
      prefix,
      'lib',
      'node_modules',
      '@astryxdesign',
      'cli',
    );
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      '{"name":"@astryxdesign/cli","version":"0.0.0"}',
    );
    executable(path.join(pkg, 'bin.mjs'), '#!/usr/bin/env node\n');
    fs.mkdirSync(path.join(prefix, 'bin'));
    fs.symlinkSync(
      path.join(pkg, 'bin.mjs'),
      path.join(prefix, 'bin', 'astryx'),
    );
    return path.join(prefix, 'bin');
  }

  it('finds a linked CLI', () => {
    expect(
      astryxOnSearchPath({searchPath: linkedCli(), platform: 'linux'}),
    ).toBe(true);
  });

  it("finds a package manager's shim that starts the CLI", () => {
    const bin = tmp('shim');
    executable(
      path.join(bin, 'astryx'),
      '#!/bin/sh\nexec node "$basedir/global/5/node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs" "$@"\n',
    );
    expect(astryxOnSearchPath({searchPath: bin, platform: 'linux'})).toBe(true);
  });

  it('is false with no astryx, or when the first astryx is another program', () => {
    expect(
      astryxOnSearchPath({searchPath: tmp('empty'), platform: 'linux'}),
    ).toBe(false);
    const other = tmp('other');
    executable(path.join(other, 'astryx'), '#!/bin/sh\necho other\n');
    expect(
      astryxOnSearchPath({
        searchPath: [other, linkedCli()].join(path.delimiter),
        platform: 'linux',
      }),
    ).toBe(false);
  });

  it('skips a file that cannot run', () => {
    const bin = tmp('noexec');
    fs.writeFileSync(path.join(bin, 'astryx'), 'not a program');
    expect(
      astryxOnSearchPath({
        searchPath: [bin, linkedCli()].join(path.delimiter),
        platform: 'linux',
      }),
    ).toBe(true);
  });
});

describe('only `init --user` writes the computer-level text (FR7)', () => {
  /** @returns {string[]} the skill paths present in the temp home */
  const present = () =>
    [
      computerSkillFile(home),
      path.join(home, '.claude', 'skills', 'astryx'),
    ].filter(p => fs.existsSync(p));

  /** A project that installs this release's Core. */
  function project() {
    const dir = tmp('project');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        private: true,
        dependencies: {'@astryxdesign/core': '*'},
      }),
    );
    fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
      recursive: true,
    });
    fs.symlinkSync(
      CORE_ROOT,
      path.join(dir, 'node_modules', '@astryxdesign', 'core'),
      'dir',
    );
    return dir;
  }

  it('no source outside init --user (its adapter) and the background step imports the write or remove functions', () => {
    /** @type {string[]} */
    const importers = [];
    /** @param {string} dir */
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.'))
          continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (
          /\.m?[jt]s$/.test(entry.name) &&
          !/\.test\.m?[jt]s$/.test(entry.name) &&
          // Generated declarations (sync:api-types) import nothing.
          !/\.d\.m?ts$/.test(entry.name)
        ) {
          const text = fs.readFileSync(file, 'utf8');
          if (
            /\b(writeComputerAgentText|removeComputerAgentText)\b/.test(text)
          ) {
            importers.push(path.relative(CLI_ROOT, file));
          }
        }
      }
    };
    for (const top of [
      'api',
      'clients',
      'foundation',
      'scripts',
      'authoring',
    ]) {
      walk(path.join(CLI_ROOT, top));
    }
    expect(importers.sort()).toEqual(
      [
        path.join('api', 'init', '_adapter.mjs'),
        path.join('foundation', 'agent-docs', 'computer-agent-text.mjs'),
        path.join('foundation', 'release', 'agent-text-worker.mjs'),
      ].sort(),
    );
  });

  it('install (postinstall), project init, and upgrade write none of it', async () => {
    const dir = project();
    const postinstall = spawnSync(
      process.execPath,
      [path.join(CLI_ROOT, 'scripts', 'postinstall.mjs')],
      {
        env: {...process.env, HOME: home, USERPROFILE: home, INIT_CWD: dir},
        encoding: 'utf8',
      },
    );
    expect(postinstall.status).toBe(0);
    expect((await runCli(['--json', 'init'], dir)).status).toBe(0);
    expect((await runCli(['--json', 'init', '--all'], dir)).status).toBe(0);
    await runCli(['--json', 'upgrade'], dir);
    await runCli(['--json', 'init'], tmp('outside'));
    expect(present()).toEqual([]);
    expect(fs.existsSync(path.join(home, '.agents'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
  }, 60_000);
});
