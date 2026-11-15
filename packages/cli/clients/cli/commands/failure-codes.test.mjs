// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A run that prints its answer and then exits 1 records the code its
 * answer carries.
 *
 * A batch with a selector that did not resolve, a theme check that found
 * stale outputs, an upgrade that reports an error or stops incomplete, and an
 * init that refuses its agent-docs path all exit 1 after their output. Each
 * run's debug event names that failure with the code the output carries
 * (the code `--json` reports for the same run), never an exit that bypassed
 * the error path. The code is recorded once the answer is printed, so an
 * error that stops the answer first keeps its own code.
 *
 * @input real command runs: in this repo, and in temporary projects
 * @output the outcome, exit code and error code each run records
 * @position packages/cli/clients/cli/commands — debug failure codes
 */

import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {renderThemeModule} from '../../../foundation/config/theme-state.mjs';
import {
  begin,
  finish,
  resetRecorder,
  setEventHandler,
} from '../../../foundation/debug/recorder.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);
const SLOW = 60_000;

/** @type {string[]} */
let dirs = [];

afterEach(() => {
  resetRecorder();
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
  dirs = [];
});

/**
 * Run the CLI in this process and return its result and the one debug event
 * the run recorded.
 * @param {string[]} args
 * @param {string} cwd
 */
async function runWithDebug(args, cwd) {
  resetRecorder();
  begin({argv: args, cliVersion: 'test'});
  const run = await runCli(args, cwd);
  /** @type {any[]} */
  const events = [];
  setEventHandler(event => events.push(event));
  finish({exitCode: run.status});
  expect(events).toHaveLength(1);
  return {run, event: events[0]};
}

/**
 * The failure a run recorded: its outcome, exit code and error code.
 * @param {any} event
 */
const failure = event => ({
  outcome: event.outcome,
  exitCode: event.exitCode,
  code: event.error?.code,
});

/**
 * A new folder holding `files`.
 * @param {Record<string, string>} files
 */
function folderWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-failure-codes-'));
  dirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, contents);
  }
  return dir;
}

/**
 * A project with Core at this CLI's version and the given extra files.
 * @param {Record<string, string>} [files]
 */
const project = (files = {}) =>
  folderWith({
    'package.json': JSON.stringify({
      name: 'consumer',
      private: true,
      dependencies: {'@astryxdesign/core': CLI_VERSION},
    }),
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({
      name: '@astryxdesign/core',
      version: CLI_VERSION,
    }),
    'astryx.config.mjs': 'export default {};\n',
    ...files,
  });

describe('a run that exits 1 after its output records the code it carries', () => {
  it(
    'component: a batch with a selector that does not resolve',
    async () => {
      const {run, event} = await runWithDebug(
        ['component', 'Button', 'NoSuchWidgetAnywhere'],
        REPO,
      );
      expect(run.status).toBe(1);
      // The answer is unchanged: the found row, then the unresolved one.
      expect(run.stdout).toContain('NoSuchWidgetAnywhere');
      expect(run.stdout).toContain('ERR_UNKNOWN_COMPONENT');
      expect(failure(event)).toEqual({
        outcome: 'error',
        exitCode: 1,
        code: 'ERR_UNKNOWN_COMPONENT',
      });
    },
    SLOW,
  );

  describe('component: a batch beside a recorded theme that does not load', () => {
    /**
     * A project with Core and one recorded theme, from an integration, whose
     * built module throws when it loads.
     */
    function projectWithBrokenTheme() {
      const dir = folderWith({
        'package.json': JSON.stringify({
          name: 'app',
          type: 'module',
          dependencies: {'@acme/themes': '1.0.0', '@astryxdesign/core': '*'},
        }),
        'astryx.config.mjs':
          "export default {integrations: ['@acme/themes']};\n",
        'node_modules/@acme/themes/package.json': JSON.stringify({
          name: '@acme/themes',
          version: '1.0.0',
          type: 'module',
          exports: {'./themes/ocean': './dist/ocean.js'},
        }),
        'node_modules/@acme/themes/astryx.integration.mjs':
          "export default {themes: './themes'};\n",
        'node_modules/@acme/themes/themes/ocean/oceanTheme.ts':
          "export const oceanTheme = {name: 'ocean', tokens: {}};\n",
        'node_modules/@acme/themes/themes/ocean/oceanTheme.doc.mjs':
          "export default {type: 'theme', name: 'ocean', displayName: 'ocean', description: 'ocean theme', maintained: true};\n",
        'node_modules/@acme/themes/dist/ocean.js':
          "throw new Error('ocean does not load');\n",
        'src/astryx-themes.ts': renderThemeModule(
          [
            {
              slug: 'ocean',
              owner: '@acme/themes',
              exportName: 'oceanTheme',
              module: '@acme/themes/themes/ocean',
              stylesheet: '@acme/themes/themes/ocean.css',
              source: 'package',
            },
          ],
          'ocean',
          true,
        ),
      });
      const scope = path.join(dir, 'node_modules', '@astryxdesign');
      fs.mkdirSync(scope, {recursive: true});
      fs.symlinkSync(
        path.join(REPO, 'packages', 'core'),
        path.join(scope, 'core'),
      );
      return dir;
    }

    const BATCH = ['component', 'Button', 'NoSuchWidgetAnywhere'];

    it(
      'records the theme failure that stopped the text answer',
      async () => {
        const {run, event} = await runWithDebug(
          BATCH,
          projectWithBrokenTheme(),
        );
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('Could not load the recorded theme');
        expect(run.stdout).not.toContain('NoSuchWidgetAnywhere');
        expect(failure(event)).toEqual({
          outcome: 'error',
          exitCode: 1,
          code: 'ERR_THEME_LOAD',
        });
      },
      SLOW,
    );

    it(
      'records the unresolved row of the JSON receipt, which needs no theme',
      async () => {
        const {run, event} = await runWithDebug(
          ['--json', ...BATCH],
          projectWithBrokenTheme(),
        );
        expect(run.status).toBe(1);
        expect(JSON.parse(run.stdout).type).toBe('component.batch');
        expect(failure(event)).toEqual({
          outcome: 'error',
          exitCode: 1,
          code: 'ERR_UNKNOWN_COMPONENT',
        });
      },
      SLOW,
    );
  });

  describe('theme build --check', () => {
    beforeAll(() => {
      ensureCoreBuilt();
    }, 200_000);

    const THEMES = {
      'alpha.mjs': `export default { name: 'alpha', tokens: { '--color-bg': '#ffffff' } };\n`,
      'beta.mjs': `export default { name: 'beta', tokens: { '--color-bg': '#010203' } };\n`,
    };

    /**
     * A folder whose themes are built, then whose first theme changes.
     * @param {string[]} files
     */
    async function staleThemes(files) {
      const dir = folderWith(THEMES);
      const built = await runCli(['theme', 'build', ...files], dir);
      expect(built.status).toBe(0);
      fs.writeFileSync(
        path.join(dir, 'alpha.mjs'),
        THEMES['alpha.mjs'].replace('#ffffff', '#fefefe'),
      );
      return dir;
    }

    it(
      'one theme whose outputs are stale',
      async () => {
        const dir = await staleThemes(['alpha.mjs']);
        const {run, event} = await runWithDebug(
          ['theme', 'build', 'alpha.mjs', '--check'],
          dir,
        );
        expect(run.status).toBe(1);
        expect(failure(event)).toEqual({
          outcome: 'error',
          exitCode: 1,
          code: 'ERR_THEME_STALE',
        });
      },
      SLOW,
    );

    it(
      'several themes, one of them stale',
      async () => {
        const dir = await staleThemes(['alpha.mjs', 'beta.mjs']);
        const {run, event} = await runWithDebug(
          ['theme', 'build', 'alpha.mjs', 'beta.mjs', '--check'],
          dir,
        );
        expect(run.status).toBe(1);
        expect(failure(event)).toEqual({
          outcome: 'error',
          exitCode: 1,
          code: 'ERR_THEME_STALE',
        });
      },
      SLOW,
    );

    it(
      'records nothing when the outputs are current',
      async () => {
        const dir = folderWith(THEMES);
        expect(
          (await runCli(['theme', 'build', 'alpha.mjs'], dir)).status,
        ).toBe(0);
        const {run, event} = await runWithDebug(
          ['theme', 'build', 'alpha.mjs', '--check'],
          dir,
        );
        expect(run.status).toBe(0);
        expect(failure(event)).toEqual({
          outcome: 'ok',
          exitCode: 0,
          code: undefined,
        });
      },
      SLOW,
    );
  });

  describe('upgrade: the code --json reports for the same run', () => {
    const STALE_THEME =
      '/* @generated by `astryx theme build` */\n' +
      '@layer astryx-base {\n  :root { --color-data-categorical-green: #008000; }\n}\n';

    /**
     * The code a --json run reports: the error envelope's, or an incomplete
     * result's.
     * @param {string} stdout
     */
    const jsonCode = stdout => {
      const envelope = JSON.parse(stdout);
      return envelope.code ?? envelope.data?.errorCode;
    };

    /** @type {Array<[string, () => string, string[]]>} */
    const cases = [
      [
        '--list beside --from',
        () => project(),
        ['upgrade', '--from', '0.6.8', '--list'],
      ],
      ['no --from', () => project(), ['upgrade', '--apply']],
      [
        'a --path outside the project',
        () => project(),
        ['upgrade', '--from', '0.6.0', '--path', '../outside'],
      ],
      [
        'a protected file that still needs a change',
        () => project({'app/theme.css': STALE_THEME}),
        [
          'upgrade',
          '--from',
          '0.6.0',
          '--codemod',
          'validate-data-token-ownership',
          '--path',
          '.',
          '--apply',
        ],
      ],
      [
        'a codemod that fails',
        () =>
          project({
            'astryx.config.mjs':
              "export default {integrations: ['@acme/widgets']};\n",
            'node_modules/@acme/widgets/package.json': JSON.stringify({
              name: '@acme/widgets',
              version: '1.0.0',
            }),
            'node_modules/@acme/widgets/astryx.integration.mjs':
              "export default {codemods: './codemods'};\n",
            'node_modules/@acme/widgets/codemods/0.7.0/fail.mjs':
              "export default {type: 'code', title: 'Fail on boom', transform: file => { if (file.source.includes('boom')) throw new Error('codemod boom'); return undefined; }};\n",
            'src/broken.ts': 'export const boom = 1;\n',
          }),
        ['upgrade', '--from', '0.6.0', '--path', 'src', '--apply'],
      ],
    ];

    it.each(cases)(
      '%s',
      async (_name, makeProject, args) => {
        const json = await runWithDebug(['--json', ...args], makeProject());
        expect(json.run.status).toBe(1);
        const code = jsonCode(json.run.stdout);
        expect(code).toMatch(/^ERR_/);
        expect(failure(json.event)).toEqual({
          outcome: 'error',
          exitCode: 1,
          code,
        });

        const {run, event} = await runWithDebug(args, makeProject());
        expect(run.status).toBe(1);
        expect(failure(event)).toEqual({outcome: 'error', exitCode: 1, code});
      },
      SLOW,
    );
  });

  it(
    'init: an agent-docs path outside the project',
    async () => {
      const dir = project();
      const {run, event} = await runWithDebug(
        ['init', '--features', 'agents', '--agent-docs-path', '../AGENTS.md'],
        dir,
      );
      expect(run.status).toBe(1);
      expect(failure(event)).toEqual({
        outcome: 'error',
        exitCode: 1,
        code: 'ERR_PATH_TRAVERSAL',
      });
    },
    SLOW,
  );
});
