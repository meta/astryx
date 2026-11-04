// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What every command does outside a project (spec AST-081 FR3, FR4).
 *
 * 1. Declarations: every command and subcommand doc declares `outsideProject`
 *    (`same`, `refuse`, or `own`), a group that only holds subcommands
 *    declares nothing, and `astryx manifest` publishes each value.
 * 2. Behavior: each command's examples run in an empty folder, outside any
 *    project, where the repository's Core is the Core this release carries.
 *    - `same`: the run matches the same example in a new project that
 *      installs only this release's Core: exit status, envelope type or error
 *      code, and the files written.
 *    - `refuse`: the run writes nothing and fails with ERR_PROJECT_REQUIRED, or
 *      with the code its released versions refuse with (listed below).
 *    - `own`: each has a test of its own in this file.
 * 3. Advice: outside a project, no output names a step that only works inside
 *    one.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {program, JSON_SUPPORTED} from '../index.mjs';
import {buildManifest} from '../lib/manifest.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  checkAnsweringRelease,
  checkComputerAgentText,
  checkNewestRelease,
} from '../../../api/doctor/doctor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '../../..');
const CORE_ROOT = path.resolve(CLI_ROOT, '../core');
const VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
).version;
const SLOW = 60_000;

/**
 * The code each `refuse` command's released versions refuse with outside a
 * project. Every other `refuse` command fails with ERR_PROJECT_REQUIRED.
 * @type {Record<string, string>}
 */
const RELEASED_REFUSAL_CODES = {
  swizzle: 'ERR_CORE_NOT_FOUND',
  'integration add': 'ERR_FILE_NOT_FOUND',
  'theme use': 'ERR_THEME_INVALID',
  'theme remove': 'ERR_THEME_INVALID',
};

/** Every `own` command; each has a describe block below. */
const OWN_TESTED = new Set([
  'doctor',
  'doctor integration validate',
  'init',
  'integration check',
  'integration verify',
  'integration pack',
  'theme add',
  'upgrade',
]);

/** @returns {Promise<any[]>} every command doc the CLI ships */
async function loadCommandDocs() {
  const docs = [];
  for (const name of fs.readdirSync(HERE)) {
    if (!name.endsWith('.doc.mjs')) continue;
    const {doc} = await import(pathToFileURL(path.join(HERE, name)).href);
    if (doc?.type === 'command') docs.push(doc);
  }
  return docs.sort((a, b) => a.name.localeCompare(b.name));
}

const commandDocs = await loadCommandDocs();
const byName = new Map(commandDocs.map(doc => [doc.name, doc]));

/** A doc that only groups subcommands: it has subcommands and wraps no function. */
function isGroup(doc) {
  return (doc.subcommands?.length ?? 0) > 0 && doc.fn == null;
}

/** Split an example's command line the way a shell would, quotes included. */
function splitArgs(line) {
  const out = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (current || started) out.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
    }
  }
  if (current || started) out.push(current);
  return out;
}

/** The command an argument list runs: its longest name prefix with a doc. */
function invokedCommand(args) {
  const words = args.filter(arg => !arg.startsWith('-'));
  for (let n = words.length; n > 0; n--) {
    const name = words.slice(0, n).join(' ');
    if (byName.has(name) && args.join(' ').includes(name))
      return byName.get(name);
  }
  return byName.get('manifest');
}

/** Every example in every doc, keyed by the command it runs. */
const examples = commandDocs.flatMap(doc =>
  (doc.examples ?? []).map(example => {
    const args = splitArgs(example.cli).slice(1);
    return {
      cli: example.cli,
      args: args.includes('--json') ? args : ['--json', ...args],
      command: invokedCommand(args),
    };
  }),
);

/** @type {string[]} */
const tmpDirs = [];
function tmpDir(label) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `astryx-outside-${label}-`),
  );
  tmpDirs.push(dir);
  return dir;
}

/** A new project that installs only this release's Core. */
function newProject() {
  const dir = tmpDir('project');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'new-app',
      private: true,
      dependencies: {'@astryxdesign/core': VERSION},
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

/** Files under `dir`, relative, skipping node_modules. */
function filesIn(dir, root = dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      out.push(...filesIn(file, root));
    } else if (entry.isFile()) {
      out.push(path.relative(root, file));
    }
  }
  return out.sort();
}

/** What a run answered: exit status, envelope type or error code, files written. */
async function answer(args, dir) {
  const before = new Set(filesIn(dir));
  const r = await runCli(args, dir);
  let envelope = null;
  try {
    envelope = JSON.parse(r.stdout);
  } catch {
    // Compared as unparsed below.
  }
  return {
    status: r.status,
    kind: envelope ? (envelope.code ?? envelope.type ?? null) : 'not json',
    written: filesIn(dir).filter(file => !before.has(file)),
    envelope,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

// No run reaches the network: a fetch fails the same way in both folders.
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(/** @type {string} */ (tmpDirs.pop()), {
      recursive: true,
      force: true,
    });
  }
});

describe('outsideProject declarations', () => {
  it.each(commandDocs.map(doc => [doc.name, doc]))(
    '%s declares a value, unless it only groups subcommands',
    (_name, doc) => {
      if (isGroup(doc)) expect(doc.outsideProject).toBeUndefined();
      else expect(['same', 'refuse', 'own']).toContain(doc.outsideProject);
    },
  );

  it('astryx manifest publishes each command doc value', () => {
    const manifest = buildManifest(program, {jsonSupported: JSON_SUPPORTED});
    const flat = [];
    const walk = cmds => {
      for (const cmd of cmds) {
        flat.push(cmd);
        walk(cmd.subcommands ?? []);
      }
    };
    walk(manifest.commands);
    expect(flat.length).toBeGreaterThan(0);
    for (const cmd of flat) {
      const doc = byName.get(cmd.name);
      expect(doc, `${cmd.name} has a command doc`).toBeDefined();
      expect(cmd.outsideProject, cmd.name).toBe(doc.outsideProject);
    }
  });

  it('names every refusal code a released version uses only for a refuse command', () => {
    for (const name of Object.keys(RELEASED_REFUSAL_CODES)) {
      expect(byName.get(name)?.outsideProject, name).toBe('refuse');
    }
  });

  it('gives every own command a test of its own', () => {
    const own = commandDocs
      .filter(doc => doc.outsideProject === 'own')
      .map(doc => doc.name);
    expect(new Set(own)).toEqual(OWN_TESTED);
  });
});

describe('every example in an empty folder matches its declaration', () => {
  const cases = examples.filter(e => e.command.outsideProject !== 'own');

  it.each(cases.map(e => [e.cli, e]))(
    '%s',
    async (_cli, example) => {
      const {command, args} = example;
      const empty = await answer(args, tmpDir('empty'));
      if (command.outsideProject === 'refuse') {
        expect(empty.status).not.toBe(0);
        expect(empty.written).toEqual([]);
        expect(empty.kind).toBe(
          RELEASED_REFUSAL_CODES[command.name] ?? 'ERR_PROJECT_REQUIRED',
        );
        return;
      }
      const project = await answer(args, newProject());
      expect(
        {status: empty.status, kind: empty.kind, written: empty.written},
        `${example.cli}\n${empty.stdout}`,
      ).toEqual({
        status: project.status,
        kind: project.kind,
        written: project.written,
      });
    },
    SLOW,
  );
});

describe('doctor outside a project (own)', () => {
  it(
    'checks the computer and never fails because the folder has no project',
    async () => {
      const dir = tmpDir('doctor');
      const r = await answer(['--json', 'doctor'], dir);
      expect(r.status).toBe(0);
      expect(r.written).toEqual([]);
      const checks = r.envelope.data.checks;
      expect(checks.map(c => c.id)).toEqual([
        'node-version',
        'answering-release',
        'newest-release',
        'cli-on-path',
        'computer-integrations',
        'computer-agent-text',
      ]);
      expect(checks.every(c => c.status !== 'fail')).toBe(true);
      expect(checks[1].message).toContain(`CLI ${VERSION}`);
    },
    SLOW,
  );

  it(
    'treats a package.json that declares no Astryx package as outside a project',
    async () => {
      const dir = tmpDir('doctor-pkg');
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}');
      const r = await answer(['--json', 'doctor'], dir);
      expect(r.status).toBe(0);
      expect(r.envelope.data.checks.map(c => c.id)).not.toContain(
        'core-installed',
      );
    },
    SLOW,
  );

  it(
    'runs the project checks inside a project, unchanged',
    async () => {
      const r = await answer(['--json', 'doctor'], newProject());
      const ids = r.envelope.data.checks.map(c => c.id);
      expect(ids).toContain('core-installed');
      expect(ids).not.toContain('answering-release');
      expect(ids).not.toContain('computer-agent-text');
      const newest = r.envelope.data.checks.find(
        c => c.id === 'newest-release',
      );
      expect(newest.status).toBe('info');
    },
    SLOW,
  );

  it('names the release that answered and the Core it reads', () => {
    expect(
      checkAnsweringRelease({
        nodeVersion: '22.13.0',
        answeredBy: {cli: '1.2.0', core: '1.2.0', copy: 'carried'},
        latest: null,
      }),
    ).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('CLI 1.2.0 with Core 1.2.0'),
    });
    expect(
      checkAnsweringRelease({
        nodeVersion: '22.13.0',
        answeredBy: {cli: '1.2.0', core: null, copy: 'carried'},
        latest: null,
      }),
    ).toMatchObject({status: 'info'});
  });

  it('reports the newest release it knows of, as info only', () => {
    const at = latest =>
      checkNewestRelease({
        nodeVersion: '22.13.0',
        answeredBy: {cli: '1.2.0', core: '1.2.0', copy: 'carried'},
        latest,
      });
    expect(at(null).message).toBe(
      'Update check: not run yet, so the newest release is not known here; it runs in the background once a day, after a command.',
    );
    expect(at('1.3.0').message).toContain('1.3.0 is newer than 1.2.0');
    expect(at('1.2.0').message).toContain('No newer release is known');
    for (const latest of [null, '1.3.0', '1.2.0', '1.1.0']) {
      expect(at(latest).status).toBe('info');
      expect(at(latest).fix).toBeUndefined();
    }
  });
});

describe('doctor: the computer-level agent text', () => {
  const at = agentText =>
    checkComputerAgentText({
      nodeVersion: '22.13.0',
      answeredBy: {cli: '1.2.0', core: '1.2.0', copy: 'carried'},
      latest: null,
      agentText,
      cwd: os.tmpdir(),
    });
  const A = '/home/me/.agents/skills/astryx/SKILL.md';
  const C = '/home/me/.claude/skills/astryx';

  it('a skill naming `astryx` with no Astryx CLI on the search path: says whether it is current, and names the step it records', () => {
    const check = (/** @type {Record<string, any>} */ over) =>
      checkComputerAgentText({
        nodeVersion: '22.13.0',
        answeredBy: {cli: '1.2.0', core: '1.2.0', copy: 'carried'},
        latest: null,
        agentText: [{path: A, state: 'current'}],
        agentTextCommand: 'astryx',
        searchPathCommands: [],
        cwd: os.tmpdir(),
        ...over,
      });
    const recorded = check({agentTextInstall: 'pnpm add -g @astryxdesign/cli'});
    // A package runner's own copy first on the search path does not count.
    expect(
      check({
        agentTextInstall: 'pnpm add -g @astryxdesign/cli',
        searchPathCommands: [
          /** @type {any} */ ({
            file: '/tmp/_npx/r/node_modules/.bin/astryx',
            astryx: true,
            runner: true,
          }),
        ],
      }).fix,
    ).toBe(
      'Run `pnpm add -g @astryxdesign/cli`, the step the skill names for when `astryx` is not found.',
    );
    expect(recorded.status).toBe('info');
    expect(recorded.message).toContain(
      `The computer-level agent text matches this release: ${A}. It tells agents to run \`astryx\`, but no \`astryx\` command is on the search path`,
    );
    expect(recorded.fix).toBe(
      'Run `pnpm add -g @astryxdesign/cli`, the step the skill names for when `astryx` is not found.',
    );
    // A skill from an earlier release records no step: npm's, worded as
    // cli-on-path words it.
    const older = check({
      agentText: [{path: A, state: 'differs'}],
      agentTextInstall: null,
    });
    expect(older.message).toContain(
      "The computer-level agent text differs from this release's",
    );
    expect(older.fix).toBe(
      'Install it for the computer: `npm i -g @astryxdesign/cli`.',
    );
    // With the Astryx CLI anywhere on the search path, even behind another
    // program (cli-on-path's to report), or a skill naming a host's command,
    // there is nothing to restore.
    for (const over of [
      {
        searchPathCommands: [
          /** @type {any} */ ({
            file: '/usr/bin/astryx',
            astryx: true,
            version: '1.2.0',
          }),
        ],
      },
      {
        searchPathCommands: [
          /** @type {any} */ ({file: '/opt/other/astryx', astryx: false}),
          /** @type {any} */ ({
            file: '/usr/bin/astryx',
            astryx: true,
            version: '1.2.0',
          }),
        ],
      },
      {agentTextCommand: 'acme astryx'},
      // An `astryx` the scan cannot trace (a Volta, asdf or mise shim, or
      // another program): it may run the CLI, so no report here.
      {
        searchPathCommands: [
          /** @type {any} */ ({
            file: '/home/me/.volta/bin/astryx',
            astryx: false,
            runner: false,
          }),
        ],
      },
      // Only a package runner's own copy: the CLI is still gone.
    ]) {
      const other = check(over);
      expect(other.message).toBe(
        `The computer-level agent text matches this release: ${A}.`,
      );
    }
  });

  it('present and current, linked: no fix', () => {
    const check = at([
      {path: A, state: 'current'},
      {path: C, state: 'linked', link: true},
    ]);
    expect(check).toMatchObject({id: 'computer-agent-text', status: 'info'});
    expect(check.message).toContain('matches this release');
    expect(check.message).toContain(`Linked into: ${C}`);
    expect(check.fix).toBeUndefined();
  });

  it('a different file, or a link not made yet: fix with init --user', () => {
    for (const [file, link] of [
      ['differs', 'linked'],
      ['current', 'absent'],
    ]) {
      const check = at([
        {path: A, state: file},
        {path: C, state: link, link: true},
      ]);
      expect(check.status).toBe('info');
      expect(check.fix).toMatch(/init --user`\.$/);
    }
  });

  it('names a link target it skipped because Astryx did not create what is there', () => {
    const check = at([
      {path: A, state: 'current'},
      {path: C, state: 'foreign', link: true},
    ]);
    expect(check.message).toContain(
      `Not linked, because something Astryx did not create is there: ${C}`,
    );
  });

  it('flags a link whose skill folder is missing, with the fix', () => {
    const check = at([
      {path: A, state: 'current'},
      {path: C, state: 'dangling', link: true},
    ]);
    expect(check.message).toContain(
      `the skill folder the link points to is not there`,
    );
    expect(check.message).toContain(C);
    expect(check.fix).toMatch(/init --user`\.$/);
  });

  it('absent: fix with init --user; a file Astryx did not write: left as it is', () => {
    const check = at([
      {path: A, state: 'absent'},
      {path: C, state: 'absent', link: true},
    ]);
    expect(check.message).toContain('No computer-level agent text');
    expect(check.fix).toMatch(/init --user`\.$/);
    expect(
      at([
        {path: A, state: 'foreign'},
        {path: C, state: 'absent', link: true},
      ]).message,
    ).toContain(`${A} was not written by Astryx, so it is left as it is`);
  });

  it(
    'reads the home folder: absent, then current after init --user',
    async () => {
      const home = tmpDir('home');
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      // The CLI installed for the computer, first on the search path, as the
      // skill expects.
      const bin = tmpDir('bin');
      fs.symlinkSync(
        path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs'),
        path.join(bin, 'astryx'),
      );
      vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
      try {
        const find = r =>
          r.envelope.data.checks.find(c => c.id === 'computer-agent-text');
        const before = find(await answer(['--json', 'doctor'], tmpDir('doc')));
        expect(before.message).toContain('No computer-level agent text');
        expect(before.status).toBe('info');
        await runCli(['--json', 'init', '--user'], tmpDir('user'));
        const after = find(await answer(['--json', 'doctor'], tmpDir('doc2')));
        expect(after.message).toContain('matches this release');
        expect(after.fix).toBeUndefined();
      } finally {
        vi.unstubAllEnvs();
      }
    },
    SLOW,
  );
});

describe('doctor integration validate outside a package (own)', () => {
  it(
    'writes nothing and reports one no_package issue',
    async () => {
      const r = await answer(
        ['--json', 'doctor', 'integration', 'validate'],
        tmpDir('validate'),
      );
      expect(r.status).toBe(1);
      expect(r.written).toEqual([]);
      expect(r.envelope.data.issues.map(i => i.code)).toEqual(['no_package']);
    },
    SLOW,
  );

  it(
    'looks a package name up as in a project',
    async () => {
      const empty = await answer(
        ['--json', 'doctor', 'integration', 'validate', '@acme/widgets'],
        tmpDir('validate-pkg'),
      );
      const project = await answer(
        ['--json', 'doctor', 'integration', 'validate', '@acme/widgets'],
        newProject(),
      );
      expect(empty.status).toBe(project.status);
      expect(empty.envelope.data.issues.map(i => i.code)).toEqual(
        project.envelope.data.issues.map(i => i.code),
      );
    },
    SLOW,
  );
});

describe('integration check outside a package (own)', () => {
  it(
    'writes nothing, reports one no_package issue from validate, and exits 1',
    async () => {
      const r = await answer(
        ['--json', 'integration', 'check'],
        tmpDir('check'),
      );
      expect(r.status).toBe(1);
      expect(r.written).toEqual([]);
      expect(r.envelope.type).toBe('integration.check');
      expect(r.envelope.data.failed).toBe(true);
      const validate = r.envelope.data.checks.find(c => c.check === 'validate');
      expect(validate.response.data.issues.map(i => i.code)).toEqual([
        'no_package',
      ]);
    },
    SLOW,
  );
});

describe('init outside a project (own)', () => {
  it(
    'writes the agent docs and prints no getting-started steps',
    async () => {
      const dir = tmpDir('init');
      const json = await answer(['--json', 'init'], dir);
      expect(json.status).toBe(0);
      // GEMINI.md gets its one-line import of AGENTS.md (spec cli-surface INV31).
      expect(json.written).toEqual(['AGENTS.md', 'GEMINI.md']);
      expect(json.envelope.data.nextSteps).toBe(false);
      const text = await runCli(['init'], tmpDir('init-text'));
      expect(text.stdout).not.toContain('Next steps');
      expect(text.stdout).not.toContain('npm install');
    },
    SLOW,
  );

  it(
    'names no step that adds a theme to an app',
    async () => {
      const r = await runCli(['init', '--all'], tmpDir('init-all'));
      expect(r.status).toBe(0);
      expect(r.stdout).not.toContain('theme add');
      expect(r.stdout).toContain('theme eject');
    },
    SLOW,
  );

  it(
    '--user writes only the computer-level agent text and its link, in the home folder',
    async () => {
      const home = tmpDir('home');
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      try {
        const r = await answer(
          ['--json', 'init', '--user'],
          tmpDir('init-user'),
        );
        expect(r.status).toBe(0);
        expect(r.written).toEqual([]);
        expect(r.envelope.type).toBe('init.user');
        // The per-user cache and settings may also live under this home
        // folder.
        expect(
          filesIn(home).filter(
            f => !f.startsWith('.cache') && !f.startsWith('.config'),
          ),
        ).toEqual([path.join('.agents', 'skills', 'astryx', 'SKILL.md')]);
        // Claude Code's folder is a link to it.
        expect(
          fs
            .lstatSync(path.join(home, '.claude', 'skills', 'astryx'))
            .isSymbolicLink(),
        ).toBe(true);
      } finally {
        vi.unstubAllEnvs();
      }
    },
    SLOW,
  );

  it(
    'prints the getting-started steps inside a project',
    async () => {
      const r = await answer(['--json', 'init'], newProject());
      expect(r.envelope.data.nextSteps).toBe(true);
    },
    SLOW,
  );
});

describe.each([
  ['integration verify', ['integration', 'verify']],
  ['integration pack', ['integration', 'pack', '--check']],
])('%s outside a package (own)', (_name, args) => {
  it(
    'writes nothing and reports one failed check, no_package',
    async () => {
      const r = await answer(['--json', ...args], tmpDir('verify'));
      expect(r.status).toBe(1);
      expect(r.written).toEqual([]);
      expect(r.envelope.type).toBe('integration.pack-check');
      expect(r.envelope.data.issues.map(i => i.code)).toEqual(['no_package']);
    },
    SLOW,
  );
});

describe('theme add outside a project (own)', () => {
  it(
    'lists the available themes with no slug, as in a new project',
    async () => {
      const empty = await answer(
        ['--json', 'theme', 'add'],
        tmpDir('theme-add'),
      );
      const project = await answer(['--json', 'theme', 'add'], newProject());
      expect(empty.status).toBe(0);
      expect(empty.envelope.type).toBe('theme.list');
      expect(empty.envelope.data.map(t => t.slug)).toEqual(
        project.envelope.data.map(t => t.slug),
      );
    },
    SLOW,
  );

  it(
    'writes nothing and names the app project it needs, given a slug',
    async () => {
      const r = await answer(
        ['--json', 'theme', 'add', 'butter'],
        tmpDir('theme-add-slug'),
      );
      expect(r.status).toBe(1);
      expect(r.written).toEqual([]);
      expect(r.kind).toBe('ERR_THEME_INVALID');
      expect(r.envelope.error).toContain('app project');
    },
    SLOW,
  );
});

describe('upgrade outside a project (own)', () => {
  it(
    'lists the codemods this release ships',
    async () => {
      const r = await answer(
        ['--json', 'upgrade', '--list'],
        tmpDir('upgrade-list'),
      );
      expect(r.status).toBe(0);
      expect(r.envelope.type).toBe('upgrade.list');
    },
    SLOW,
  );

  it(
    'finds no copied compositions to update',
    async () => {
      const r = await answer(
        ['--json', 'upgrade', '--registry', '--apply'],
        tmpDir('upgrade-reg'),
      );
      expect(r.status).toBe(0);
      expect(r.written).toEqual([]);
    },
    SLOW,
  );

  it(
    'writes nothing and fails a migration with ERR_VERSION_DETECT, naming no install step',
    async () => {
      const r = await answer(
        ['--json', 'upgrade', '--from', '0.1.0', '--apply'],
        tmpDir('upgrade-from'),
      );
      expect(r.status).toBe(1);
      expect(r.written).toEqual([]);
      expect(r.kind).toBe('ERR_VERSION_DETECT');
      expect(r.envelope.error).toContain('outside a project');
      expect(r.envelope.error).not.toMatch(/install the target/i);
    },
    SLOW,
  );
});

describe('no advice that works only inside a project', () => {
  it(
    'prints no setup reminder in a package.json that declares no Astryx package',
    async () => {
      const dir = tmpDir('nudge');
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}');
      const r = await runCli(['docs', 'tokens'], dir);
      expect(r.stderr).not.toMatch(/finish setup/);
    },
    SLOW,
  );

  it(
    'theme list names no step that adds a theme to an app',
    async () => {
      const r = await runCli(['theme', 'list'], tmpDir('theme-list'));
      expect(r.status).toBe(0);
      expect(r.stdout).not.toContain('theme add');
      expect(r.stdout).toContain('theme eject');
    },
    SLOW,
  );

  it(
    'a theme search result forks the source instead of adding the theme',
    async () => {
      const r = await answer(
        ['--json', 'search', 'warm', '--type', 'theme'],
        tmpDir('search'),
      );
      const themes = r.envelope.data.results.filter(x => x.domain === 'theme');
      expect(themes.length).toBeGreaterThan(0);
      for (const theme of themes) {
        expect(theme.command).toBe(`astryx theme eject ${theme.name}`);
      }
      const inside = await answer(
        ['--json', 'search', 'warm', '--type', 'theme'],
        newProject(),
      );
      for (const theme of inside.envelope.data.results.filter(
        x => x.domain === 'theme',
      )) {
        expect(theme.command).toBe(`astryx theme add ${theme.name}`);
      }
    },
    SLOW,
  );

  it(
    'discover names no config step',
    async () => {
      const r = await runCli(['discover'], tmpDir('discover'));
      expect(r.stdout).not.toContain('astryx.config');
    },
    SLOW,
  );

  it(
    'the integration checks name no installed-integration step',
    async () => {
      for (const kind of ['templates', 'components', 'docs']) {
        const r = await runCli(
          ['doctor', 'integration', kind],
          tmpDir('authoring'),
        );
        expect(r.stdout).toContain('Nothing was checked');
        expect(r.stdout).not.toContain('To check an installed integration');
      }
    },
    SLOW,
  );
});
