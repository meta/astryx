// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  createRuntimeCatalog,
  createRuntimeCatalogs,
  createSpawnInvocation,
  getGeneratedModuleName,
  isSourceLocaleFile,
  renderRuntimeCatalogModule,
  watchRuntimeCatalogs,
} from './generate-i18n-runtime.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GENERATOR = fileURLToPath(
  new URL('./generate-i18n-runtime.mjs', import.meta.url),
);
// Windows runs a watch command through cmd.exe, which takes only shell-safe
// tokens: a bare `node` and no spaces or parentheses.
const EXIT_3_COMMAND = ['node', '-e', 'process.exitCode=3'];

function waitForMatch(stream, pattern, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${pattern} in:\n${output}`));
    }, timeoutMs);
    const onData = chunk => {
      output += chunk;
      const match = output.match(pattern);
      if (match) {
        cleanup();
        resolve(match);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off('data', onData);
    };
    stream.on('data', onData);
  });
}

describe('generator CLI', () => {
  it('runs when invoked through a symlinked repository path', () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'astryx-i18n-cli-'));
    const linkedRepo = path.join(temp, 'repo');
    symlinkSync(REPO_ROOT, linkedRepo, 'dir');
    try {
      const result = spawnSync(
        process.execPath,
        [path.join(linkedRepo, 'scripts/generate-i18n-runtime.mjs'), '--check'],
        {cwd: linkedRepo, encoding: 'utf8'},
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('authored locale catalogs produce');
    } finally {
      rmSync(temp, {recursive: true, force: true});
    }
  });

  it('--watch runs the command after generation and returns its exit code', async ({
    signal,
  }) => {
    // An asynchronous spawn leaves the test timeout free to fire, and the
    // test's signal then stops a `--watch` that never exits.
    const cli = spawn(
      process.execPath,
      [GENERATOR, '--watch', '--', ...EXIT_3_COMMAND],
      {cwd: REPO_ROOT, signal, stdio: ['ignore', 'pipe', 'pipe']},
    );
    let stdout = '';
    let stderr = '';
    cli.stdout.on('data', chunk => {
      stdout += chunk;
    });
    cli.stderr.on('data', chunk => {
      stderr += chunk;
    });
    const [code] = await once(cli, 'exit');

    expect(code, stderr).toBe(3);
    expect(stdout).toMatch(/Generated \d+ runtime locale modules/);
  });
});

describe('createRuntimeCatalog', () => {
  it('keeps runtime messages and drops translator metadata', () => {
    const runtimeCatalog = createRuntimeCatalog({
      '@astryx.button.submit': {
        defaultMessage: 'Submit',
        description: 'Visible label for the primary submit button.',
      },
      '@astryx.pagination.page': {
        defaultMessage: 'Page {page, number}',
        description: 'Accessible page label.',
        screenshot: 'translator-only-context.png',
      },
    });

    expect(runtimeCatalog).toEqual({
      '@astryx.button.submit': 'Submit',
      '@astryx.pagination.page': 'Page {page, number}',
    });
    expect(JSON.stringify(runtimeCatalog)).not.toContain('description');
    expect(JSON.stringify(runtimeCatalog)).not.toContain('translator-only');
  });

  it('rejects entries without a runtime message', () => {
    expect(() =>
      createRuntimeCatalog({
        '@astryx.button.submit': {description: 'Translator context only.'},
      }),
    ).toThrow('missing string "defaultMessage"');
  });
});

describe('createRuntimeCatalogs', () => {
  it('uses the string-map shape for real and pseudo locales', () => {
    const catalogs = createRuntimeCatalogs({
      'en.json': {
        '@astryx.button.submit': {
          defaultMessage: 'Submit',
          description: 'Visible submit label.',
        },
      },
      'fr-FR.json': {
        '@astryx.button.submit': {
          defaultMessage: 'Envoyer',
          description: 'Visible submit label.',
        },
      },
    });

    expect(Object.keys(catalogs)).toEqual([
      'en.json',
      'fr-FR.json',
      'pseudo.json',
    ]);
    expect(catalogs['fr-FR.json']['@astryx.button.submit']).toBe('Envoyer');
    expect(catalogs['pseudo.json']['@astryx.button.submit']).toBe('⟦Šúƀɱíţ⟧');
    expect(JSON.stringify(catalogs)).not.toContain('description');
  });
});

describe('generated module names', () => {
  it('places generated modules beside the i18n runtime with an explicit suffix', () => {
    expect(getGeneratedModuleName('fr-FR.json')).toBe('fr-FR.generated.ts');
    expect(getGeneratedModuleName('pseudo.json')).toBe('pseudo.generated.ts');
  });

  it('rejects non-JSON source filenames', () => {
    expect(() => getGeneratedModuleName('fr-FR.ts')).toThrow(
      'Expected a JSON locale filename',
    );
  });
});

describe('locale source watcher', () => {
  it('regenerates for authored locale JSON but ignores generated pseudo output', () => {
    expect(isSourceLocaleFile('en.json')).toBe(true);
    expect(isSourceLocaleFile('fr-FR.json')).toBe(true);
    expect(isSourceLocaleFile('pseudo.json')).toBe(false);
    expect(isSourceLocaleFile('README.md')).toBe(false);
    expect(isSourceLocaleFile(Buffer.from('en.json'))).toBe(false);
  });

  it('constructs Windows commands only from shell-safe tokens', () => {
    expect(
      createSpawnInvocation(
        ['pnpm', '--parallel', '--filter', '@astryxdesign/core', 'dev:i18n'],
        'win32',
        'cmd.exe',
      ),
    ).toEqual({
      file: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'pnpm --parallel --filter @astryxdesign/core dev:i18n',
      ],
    });
    expect(() =>
      createSpawnInvocation(['tool', 'argument with spaces'], 'win32'),
    ).toThrow('cannot contain spaces or shell metacharacters');
    expect(() =>
      createSpawnInvocation(['tool', 'value&next'], 'win32'),
    ).toThrow('cannot contain spaces or shell metacharacters');
  });

  it('runs the command only once its catalogs are current, then closes both watchers', async () => {
    const events = [];
    const watch = () => ({close: () => events.push('close watcher')});
    const code = await watchRuntimeCatalogs(['tool', 'argument'], {
      generate: async () => {
        events.push('generation starts');
        await Promise.resolve();
        events.push('generation ends');
      },
      run: async command => {
        events.push(`run ${command.join(' ')}`);
        return 7;
      },
      watch,
    });

    expect(code).toBe(7);
    expect(events).toEqual([
      'generation starts',
      'generation ends',
      'run tool argument',
      'close watcher',
      'close watcher',
    ]);
  });

  it('runs the command through the forwarding runner by default and returns its exit code', async () => {
    const code = await watchRuntimeCatalogs(EXIT_3_COMMAND, {
      generate: async () => {},
      watch: () => ({close: () => {}}),
    });

    expect(code).toBe(3);
  });

  it.skipIf(process.platform === 'win32')(
    'forwards repeated termination signals until the child exits',
    async () => {
      const childCode = `
        let exitTimer;
        process.on('SIGINT', () => {
          clearTimeout(exitTimer);
          exitTimer = setTimeout(() => process.exit(0), 250);
        });
        console.log('child-ready:' + process.pid);
        setInterval(() => {}, 1_000);
      `;
      // The runner that `--watch` starts once its catalogs are current. Run
      // alone, the wait for the child's ready line covers the child's start,
      // not a full catalog generation.
      const runnerCode = `
        import {runForwardingSignals} from ${JSON.stringify(pathToFileURL(GENERATOR).href)};
        process.exitCode = await runForwardingSignals(${JSON.stringify([process.execPath, '-e', childCode])});
      `;
      const wrapper = spawn(
        process.execPath,
        ['--input-type=module', '-e', runnerCode],
        {
          cwd: REPO_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let childPid;

      try {
        const match = await waitForMatch(wrapper.stdout, /child-ready:(\d+)/);
        childPid = Number(match[1]);
        wrapper.kill('SIGINT');
        await new Promise(resolve => setTimeout(resolve, 50));
        wrapper.kill('SIGINT');
        const [code, signal] = await Promise.race([
          once(wrapper, 'exit'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('wrapper did not exit')), 5_000),
          ),
        ]);

        expect(signal).toBeNull();
        expect(code).toBe(0);
        expect(() => process.kill(childPid, 0)).toThrow();
      } finally {
        if (wrapper.exitCode === null) wrapper.kill('SIGKILL');
        if (childPid !== undefined) {
          try {
            process.kill(childPid, 'SIGKILL');
          } catch {
            // The expected path: the wrapper already reaped its child.
          }
        }
      }
    },
    10_000,
  );
});

describe('renderRuntimeCatalogModule', () => {
  it('emits a default-exported string map tied to its rich source', async () => {
    const output = await renderRuntimeCatalogModule(
      {'@astryx.button.submit': 'Submit'},
      'fr-FR.json',
    );

    expect(output).toContain('const runtimeCatalog');
    expect(output).toContain('export default runtimeCatalog');
    expect(output).toContain('packages/core/locales/fr-FR.json');
    expect(output).toContain("'@astryx.button.submit': 'Submit'");
    expect(output).not.toContain('defaultMessage');
  });
});
