// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  cachedRelease,
  forgetVerifiedReleases,
  ensureRelease,
  isInReleaseCache,
  releasesDir,
  resolvePublishedVersion,
  isVersionRange,
  npmCommand,
  resolveLatestRelease,
  runNpm,
  tryLock,
  endRecordedInstall,
  isReleaseInstall,
  INSTALL_TIMEOUT_MS,
} from './cache.mjs';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  seedRelease,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';
import {LEASE_SILENCE_MS, renewLock} from './lock-lease.mjs';

afterEach(cleanupFixtures);

/**
 * A stand-in for npm: `install` lays down stand-in CLI and Core packages of
 * the requested version (or fails the way `outcome` says), and records each
 * call.
 * @param {{outcome?: 'ok' | 'offline' | 'missing' | 'wrong-version', engines?: string}} [options]
 */
function fakeNpm(options = {}) {
  const {outcome = 'ok', engines} = options;
  /** @type {string[][]} */
  const calls = [];
  /** @type {import('./cache.mjs').runNpm} */
  const run = (args, opts = {}) => {
    calls.push(args);
    if (outcome === 'offline') {
      return {
        status: 1,
        stdout: '',
        stderr: 'npm error code ENOTFOUND\nnpm error network request failed',
      };
    }
    if (outcome === 'missing') {
      return {
        status: 1,
        stdout: '',
        stderr:
          'npm error code ETARGET\nnpm error notarget No matching version',
      };
    }
    const spec = args.find(a => a.startsWith('@astryxdesign/cli@')) ?? '';
    const version = spec.split('@').pop() ?? '';
    const cwd = /** @type {string} */ (opts.cwd);
    const cli = installStandInCli(
      cwd,
      outcome === 'wrong-version' ? '0.0.1' : version,
    );
    if (engines) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(cli, 'package.json'), 'utf-8'),
      );
      writeJson(path.join(cli, 'package.json'), {
        ...pkg,
        engines: {node: engines},
      });
    }
    installCore(cwd, version);
    return {status: 0, stdout: '', stderr: ''};
  };
  return {run, calls};
}

describe('ensureRelease', () => {
  it('verifies a release with update notices off, so the check prints and uses up none (FR10)', () => {
    const cacheDir = tempDir('cache');
    const npm = fakeNpm();
    /** @type {typeof npm.run} */
    const run = (args, opts = {}) => {
      const result = npm.run(args, opts);
      // A release whose --version answers only when notices are off.
      const bin = path.join(
        /** @type {string} */ (opts.cwd),
        'node_modules',
        '@astryxdesign',
        'cli',
        'bin.cjs',
      );
      fs.writeFileSync(
        bin,
        `if (process.env.NO_UPDATE_NOTIFIER === undefined) { console.log('notices-on'); process.exit(0); }\nconsole.log('0.6.8');\n`,
      );
      return result;
    };
    const release = ensureRelease('0.6.8', {cacheDir, run});
    expect('bin' in release && release.version).toBe('0.6.8');
  });

  it('installs, verifies, and keeps a release, then reuses it', () => {
    const cacheDir = tempDir('cache');
    const npm = fakeNpm();
    const release = ensureRelease('0.6.8', {cacheDir, run: npm.run});
    expect('bin' in release && release.version).toBe('0.6.8');
    expect(npm.calls[0]).toEqual(
      expect.arrayContaining([
        'install',
        '--ignore-scripts',
        '--prefer-offline',
        '@astryxdesign/cli@0.6.8',
        '@astryxdesign/core@0.6.8',
      ]),
    );
    expect(cachedRelease('0.6.8', cacheDir)?.coreDir).toBe(
      path.join(
        releasesDir(cacheDir),
        '0.6.8',
        'node_modules',
        '@astryxdesign',
        'core',
      ),
    );
    ensureRelease('0.6.8', {cacheDir, run: npm.run});
    expect(npm.calls).toHaveLength(1);
    expect(
      fs.readdirSync(releasesDir(cacheDir)).filter(n => n.startsWith('.')),
    ).toEqual([]);
  });

  it('says why a release is unavailable and keeps nothing', () => {
    const cases = /** @type {const} */ ([
      ['offline', /could not be reached/],
      ['missing', /does not have it/],
      ['wrong-version', /another version/],
    ]);
    for (const [outcome, reason] of cases) {
      const cacheDir = tempDir('cache');
      const result = ensureRelease('0.6.8', {
        cacheDir,
        run: fakeNpm({outcome}).run,
      });
      expect('reason' in result && result.reason).toMatch(reason);
      expect(cachedRelease('0.6.8', cacheDir)).toBeNull();
    }
  });

  it("refuses a release this computer's Node cannot run", () => {
    const cacheDir = tempDir('cache');
    const result = ensureRelease('0.9.0', {
      cacheDir,
      run: fakeNpm({engines: '>=99.0.0'}).run,
    });
    expect('reason' in result && result.reason).toMatch(
      /needs Node >=99\.0\.0/,
    );
  });

  it('refuses a version that is not a release version', () => {
    const result = ensureRelease('../../etc', {
      cacheDir: tempDir('cache'),
      run: fakeNpm().run,
    });
    expect('reason' in result && result.reason).toMatch(
      /not a release version/,
    );
  });

  it('waits for another run installing the same release', () => {
    const cacheDir = tempDir('cache');
    fs.mkdirSync(path.join(releasesDir(cacheDir), '.lock-0.6.8'), {
      recursive: true,
    });
    const result = ensureRelease('0.6.8', {
      cacheDir,
      run: fakeNpm().run,
      waitMs: 300,
    });
    expect('reason' in result && result.reason).toMatch(/still installing/);
  });
});

describe('cachedRelease', () => {
  it('counts a release only once it is verified', () => {
    const cacheDir = tempDir('cache');
    const dir = seedRelease(cacheDir, '0.7.1');
    expect(cachedRelease('0.7.1', cacheDir)).not.toBeNull();
    fs.rmSync(path.join(dir, 'release.json'));
    forgetVerifiedReleases();
    expect(cachedRelease('0.7.1', cacheDir)).toBeNull();
  });

  it('knows a folder inside the cache', () => {
    const cacheDir = tempDir('cache');
    const dir = seedRelease(cacheDir, '0.7.1');
    expect(isInReleaseCache(dir, cacheDir)).toBe(true);
    expect(isInReleaseCache(tempDir(), cacheDir)).toBe(false);
  });
});

describe.skipIf(process.platform === 'win32')(
  'a stale lock ends a recorded process group only when it is surely the install',
  () => {
    /** @type {import('node:child_process').ChildProcess[]} */
    const started = [];
    afterEach(() => {
      for (const child of started.splice(0)) {
        try {
          process.kill(-(/** @type {number} */ (child.pid)), 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
    });
    const SLEEP = 'setTimeout(() => {}, 60000)';
    /**
     * A process in a group of its own, started as `program args…`.
     * @param {string} program @param {string[]} args
     */
    const startGroup = (program, args) => {
      const child = spawn(program, args, {detached: true, stdio: 'ignore'});
      started.push(child);
      return /** @type {number} */ (child.pid);
    };
    /** A sleeping script at `dir/name`. @param {string} name */
    const script = name => {
      const file = path.join(tempDir('bin'), name);
      fs.writeFileSync(file, SLEEP);
      return file;
    };
    /** @param {number} pid @param {number} at */
    const lockFor = (pid, at) => {
      const lockDir = path.join(tempDir('lock'), '.lock-9.9.9');
      fs.mkdirSync(lockDir, {recursive: true});
      fs.writeFileSync(path.join(lockDir, 'npm.pid'), String(pid));
      fs.writeFileSync(
        path.join(lockDir, 'owner.json'),
        JSON.stringify({pid: 999999, host: os.hostname(), at}),
      );
      return lockDir;
    };
    const alive = (/** @type {number} */ pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const INSTALL = ['install', '--no-save', '@astryxdesign/cli@9.9.9'];
    const until = async (/** @type {() => boolean} */ done) => {
      for (let i = 0; i < 50 && !done(); i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return done();
    };

    it('reads the install only from its exact program and arguments', () => {
      const ok = ['/usr/bin/node', '/x/npm/bin/npm-cli.js', ...INSTALL];
      expect(isReleaseInstall(ok, '9.9.9')).toBe(true);
      // npm's own process title, split on whitespace.
      expect(
        isReleaseInstall(
          'npm install --no-save @astryxdesign/cli@9.9.9 @astryxdesign/core@9.9.9'.split(
            ' ',
          ),
          '9.9.9',
        ),
      ).toBe(true);
      expect(isReleaseInstall(['C:\\npm\\npm.cmd', ...INSTALL], '9.9.9')).toBe(
        true,
      );
      for (const argv of [
        ['/opt/my-npm-tool', ...INSTALL],
        ['python3', '-c', 'sleep', '/home/me/notes/npm-debug.log', ...INSTALL],
        ['/usr/bin/node', '-e', 'x', 'npm', ...INSTALL],
        [
          '/usr/bin/node',
          '/x/npm-cli.js',
          'install',
          '@astryxdesign/cli@9.9.90',
        ],
        ['/usr/bin/node', '/x/npm-cli.js', 'ci', '@astryxdesign/cli@9.9.9'],
      ]) {
        expect(isReleaseInstall(argv, '9.9.9'), argv.join(' ')).toBe(false);
      }
    });

    it.skipIf(!fs.existsSync('/proc/self/stat'))(
      "reads npm's rewritten process title from /proc, one argument, and ends that install",
      async () => {
        const at = Date.now() - 1000;
        const npm = startGroup(process.execPath, ['-e', SLEEP]);
        await new Promise(resolve => setTimeout(resolve, 300));
        // A process table whose cmdline is npm's title: one NUL-terminated string.
        const procRoot = tempDir('proc');
        fs.mkdirSync(path.join(procRoot, String(npm)));
        fs.writeFileSync(
          path.join(procRoot, String(npm), 'cmdline'),
          'npm install --no-save @astryxdesign/cli@9.9.9 @astryxdesign/core@9.9.9\u0000',
        );
        // procfs files report size 0, so they are read, not copied.
        for (const [from, to] of [
          [`/proc/${npm}/stat`, path.join(procRoot, String(npm), 'stat')],
          ['/proc/stat', path.join(procRoot, 'stat')],
        ]) {
          fs.writeFileSync(to, fs.readFileSync(from, 'utf8'));
        }
        expect(endRecordedInstall(lockFor(npm, at), {procRoot})).toBe('ended');
        expect(await until(() => !alive(npm))).toBe(true);
      },
    );

    it('leaves a program named my-npm-tool, and one with npm only in an argument', async () => {
      const now = Date.now();
      const tool = path.join(tempDir('bin'), 'my-npm-tool');
      fs.symlinkSync(process.execPath, tool);
      const named = startGroup(tool, [script('sleep.js'), ...INSTALL]);
      const argued = startGroup(process.execPath, [
        '-e',
        SLEEP,
        'npm',
        '/home/me/notes/npm-debug.log',
        ...INSTALL,
      ]);
      await new Promise(resolve => setTimeout(resolve, 300));
      for (const pid of [named, argued]) {
        expect(endRecordedInstall(lockFor(pid, now - 5000), {now})).toBe(
          'left',
        );
        expect(alive(pid)).toBe(true);
      }
    });

    it("ends the lock's own install: node running npm-cli.js install of that release, started after the lock", async () => {
      const at = Date.now() - 1000;
      const npm = startGroup(process.execPath, [
        script('npm-cli.js'),
        ...INSTALL,
      ]);
      await new Promise(resolve => setTimeout(resolve, 300));
      // An old lock, or one with no recorded start: not trusted.
      expect(
        endRecordedInstall(lockFor(npm, Date.now() - INSTALL_TIMEOUT_MS - 1)),
      ).toBe('left');
      const unknown = lockFor(npm, at);
      fs.writeFileSync(
        path.join(unknown, 'owner.json'),
        JSON.stringify({pid: 999999, host: os.hostname()}),
      );
      expect(endRecordedInstall(unknown)).toBe('left');
      // A lock taken after the process started: the id names an older process.
      expect(
        endRecordedInstall(lockFor(npm, Date.now() + 60_000), {
          now: Date.now() + 61_000,
        }),
      ).toBe('left');
      expect(alive(npm)).toBe(true);
      expect(endRecordedInstall(lockFor(npm, at))).toBe('ended');
      expect(await until(() => !alive(npm))).toBe(true);
    });

    it('decides from the process facts alone, however they were read (no /proc: ps or PowerShell)', async () => {
      const at = Date.now() - 1000;
      // A real group to end, with facts given as ps would report them, so the
      // outcome never depends on what this computer's ps prints.
      const npm = startGroup(process.execPath, ['-e', SLEEP]);
      await new Promise(resolve => setTimeout(resolve, 300));
      const factsOf =
        (/** @type {string[]} */ argv, startedAt = at + 500) =>
        () => ({argv, startedAt});
      const installArgv = [
        '/usr/bin/node',
        '/x/npm/bin/npm-cli.js',
        ...INSTALL,
      ];
      for (const [argv, startedAt] of /** @type {const} */ ([
        [['/opt/my-npm-tool', ...INSTALL], at + 500],
        [['/usr/bin/node', '-e', 'x', 'npm', ...INSTALL], at + 500],
        [
          [
            'python3',
            '-c',
            'sleep',
            '/home/me/notes/npm-debug.log',
            ...INSTALL,
          ],
          at + 500,
        ],
        // Started before the lock: an older process that reuses the id.
        [installArgv, at - 5000],
      ])) {
        expect(
          endRecordedInstall(lockFor(npm, at), {
            factsOf: factsOf([...argv], startedAt),
          }),
          argv.join(' '),
        ).toBe('left');
      }
      // Facts that cannot be read: left alone.
      expect(
        endRecordedInstall(lockFor(npm, at), {
          factsOf: () => ({argv: null, startedAt: null}),
        }),
      ).toBe('left');
      expect(alive(npm)).toBe(true);
      expect(
        endRecordedInstall(lockFor(npm, at), {factsOf: factsOf(installArgv)}),
      ).toBe('ended');
      expect(await until(() => !alive(npm))).toBe(true);
    });
  },
);

describe('a declared range never reaches a shell', () => {
  it('reads only version ranges as ranges', () => {
    for (const ok of [
      '^1.2.3',
      '>=1 <2',
      '1.x || 2.x',
      '*',
      '1.0.0-beta.1',
      'latest',
    ]) {
      expect(isVersionRange(ok), ok).toBe(true);
    }
    for (const bad of [
      '^1 & echo hi',
      '1 && 2',
      '1|2',
      '1;2',
      '"1"',
      '$(id)',
      '`id`',
      'https://x',
      '',
      ' ',
    ]) {
      expect(isVersionRange(bad), bad).toBe(false);
    }
  });

  it('asks npm nothing for a range with shell syntax in it', () => {
    /** @type {string[][]} */
    const asked = [];
    const run = (/** @type {string[]} */ args) => {
      asked.push(args);
      return {status: 0, stdout: '"1.0.0"', stderr: ''};
    };
    for (const spec of ['^1 & echo hi', '^1 | tee x', '^1; rm x']) {
      expect(
        resolvePublishedVersion('@astryxdesign/core', spec, {run}),
      ).toBeNull();
    }
    expect(
      resolvePublishedVersion('@astryxdesign/core && x', '^1', {run}),
    ).toBeNull();
    expect(asked).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')(
    'takes an npm beside the running Node, or on the PATH, that links to its entry file',
    () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-npm-link-'));
      try {
        // A distribution layout: npm's files away from Node's folder, and an
        // npm link into them on the PATH.
        const entry = path.join(
          root,
          'lib',
          'node_modules_22',
          'npm',
          'bin',
          'npm-cli.js',
        );
        fs.mkdirSync(path.dirname(entry), {recursive: true});
        fs.writeFileSync(entry, '');
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin);
        fs.symlinkSync(entry, path.join(bin, 'npm'));
        // A Node with no npm beside it.
        const node = path.join(root, 'node', 'bin', 'node');
        fs.mkdirSync(path.dirname(node), {recursive: true});
        expect(
          npmCommand({env: {PATH: bin}, platform: 'linux', execPath: node}),
        ).toEqual({
          command: node,
          prefix: [fs.realpathSync(entry)],
          shell: false,
        });
        // The same link beside the running Node.
        fs.symlinkSync(entry, path.join(path.dirname(node), 'npm'));
        expect(
          npmCommand({env: {PATH: ''}, platform: 'linux', execPath: node}),
        ).toEqual({
          command: node,
          prefix: [fs.realpathSync(entry)],
          shell: false,
        });
        // Nothing anywhere: npm on the PATH, started directly.
        expect(
          npmCommand({
            env: {PATH: ''},
            platform: 'linux',
            execPath: path.join(root, 'none', 'node'),
          }),
        ).toEqual({command: 'npm', prefix: [], shell: false});
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    },
  );

  it('names why the newest release could not be asked for', () => {
    /** @type {string[]} */
    const reasons = [];
    const onFailure = (/** @type {string} */ r) => reasons.push(r);
    const missing = Object.assign(new Error('spawn npm ENOENT'), {
      code: 'ENOENT',
    });
    expect(
      resolveLatestRelease({
        run: () => ({status: null, stdout: '', stderr: '', error: missing}),
        onFailure,
      }),
    ).toBeNull();
    expect(
      resolveLatestRelease({
        run: () => ({
          status: 1,
          stdout: '',
          stderr: 'npm error code ECONNREFUSED\nnpm error errno ECONNREFUSED\n',
        }),
        onFailure,
      }),
    ).toBeNull();
    expect(
      resolveLatestRelease({
        run: () => ({status: 0, stdout: '"latest"', stderr: ''}),
        onFailure,
      }),
    ).toBeNull();
    expect(reasons).toEqual([
      'npm-missing',
      'npm-failed: ECONNREFUSED',
      'bad-reply',
    ]);
  });

  it('starts npm from its entry file with this Node, never through a shell', () => {
    const npm = npmCommand();
    expect(npm.shell).toBe(false);
    if (npm.prefix.length > 0) {
      expect(npm.command).toBe(process.execPath);
      expect(npm.prefix[0]).toMatch(/npm-cli\.js$/u);
    }
  });
});

describe('resolvePublishedVersion', () => {
  it('takes the newest version npm reports for a range', () => {
    /** @type {import('./cache.mjs').runNpm} */
    const run = args => {
      expect(args).toEqual([
        'view',
        '@astryxdesign/core@^0.6.0',
        'version',
        '--json',
        '--fetch-retries=1',
        '--fetch-timeout=30000',
        '--fetch-retry-mintimeout=2000',
        '--fetch-retry-maxtimeout=10000',
      ]);
      return {status: 0, stdout: '["0.6.3","0.6.8"]', stderr: ''};
    };
    expect(resolvePublishedVersion('@astryxdesign/core', '^0.6.0', {run})).toBe(
      '0.6.8',
    );
  });

  it('is null when npm fails or answers nothing usable', () => {
    expect(
      resolvePublishedVersion('@astryxdesign/cli', 'latest', {
        run: () => ({status: 1, stdout: '', stderr: ''}),
      }),
    ).toBeNull();
    expect(
      resolvePublishedVersion('@astryxdesign/cli', 'latest', {
        run: () => ({status: 0, stdout: '""', stderr: ''}),
      }),
    ).toBeNull();
  });
});

describe('tryLock', () => {
  it('takes a free lock once, keeps a live holder, and reclaims a stale one', () => {
    const dir = path.join(tempDir('lock'), '.lock-x');
    expect(tryLock(dir)).toBe(true);
    expect(tryLock(dir)).toBe(false);
    // A live holder on this computer keeps its lock, however long it takes.
    const slow = new Date(Date.now() - 25 * 60_000);
    fs.utimesSync(dir, slow, slow);
    expect(tryLock(dir)).toBe(false);
    // Past the hard bound, even a live holder's lock is reclaimed.
    const old = new Date(Date.now() - 31 * 60_000);
    fs.utimesSync(dir, old, old);
    expect(tryLock(dir)).toBe(true);
  });

  it('takes over a lock from another computer once its holder stops renewing it (b12)', () => {
    const dir = path.join(tempDir('lock'), '.lock-z');
    fs.mkdirSync(dir, {recursive: true});
    const owner = path.join(dir, 'owner.json');
    fs.writeFileSync(owner, JSON.stringify({pid: 4242, host: 'other-host'}));
    const t0 = Date.now();
    expect(tryLock(dir, {now: t0})).toBe(false);
    expect(tryLock(dir, {now: t0 + LEASE_SILENCE_MS - 1})).toBe(false);
    // The holder renews: the wait starts again from the change.
    renewLock(dir);
    expect(JSON.parse(fs.readFileSync(owner, 'utf8'))).toEqual({
      pid: 4242,
      host: 'other-host',
      beat: 1,
    });
    expect(tryLock(dir, {now: t0 + LEASE_SILENCE_MS})).toBe(false);
    expect(tryLock(dir, {now: t0 + 2 * LEASE_SILENCE_MS - 1})).toBe(false);
    // Unrenewed for the whole lease, as this run saw it: taken over.
    expect(tryLock(dir, {now: t0 + 2 * LEASE_SILENCE_MS})).toBe(true);
    expect(JSON.parse(fs.readFileSync(owner, 'utf8'))).toEqual({
      pid: process.pid,
      host: os.hostname(),
      at: expect.any(Number),
    });
  });

  it('reclaims a lock with no owner record after a few seconds', () => {
    const dir = path.join(tempDir('lock'), '.lock-y');
    fs.mkdirSync(dir, {recursive: true});
    expect(tryLock(dir)).toBe(false);
    const old = new Date(Date.now() - 11_000);
    fs.utimesSync(dir, old, old);
    expect(tryLock(dir)).toBe(true);
  });
});

describe('a slow install', () => {
  it('ends in a timeout reason, never a stopped run, when npm hits the time limit', () => {
    const cacheDir = tempDir('cache');
    /** @type {import('./cache.mjs').runNpm} */
    const run = () => ({
      status: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('spawnSync npm ETIMEDOUT'), {
        code: 'ETIMEDOUT',
      }),
    });
    const result = ensureRelease('0.6.8', {cacheDir, run});
    expect('reason' in result && result.reason).toMatch(
      /did not finish within 15 minutes/,
    );
    expect('signal' in result && result.signal).toBeFalsy();
  });

  it('tells the caller once when it installs and once when it waits', () => {
    const cacheDir = tempDir('cache');
    /** @type {string[]} */
    const events = [];
    ensureRelease('0.6.8', {
      cacheDir,
      run: fakeNpm().run,
      onProgress: (e, v) => events.push(`${e} ${v}`),
    });
    expect(events).toEqual(['install 0.6.8']);
    const other = tempDir('cache');
    const lock = path.join(releasesDir(other), '.lock-0.6.8');
    fs.mkdirSync(lock, {recursive: true});
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({pid: process.pid, host: os.hostname()}),
    );
    events.length = 0;
    ensureRelease('0.6.8', {
      cacheDir: other,
      run: fakeNpm().run,
      waitMs: 500,
      onProgress: (e, v) => events.push(`${e} ${v}`),
    });
    expect(events).toEqual(['wait 0.6.8']);
  });
});

describe('a damaged library file', () => {
  it('is caught by the size record and replaced', () => {
    const cacheDir = tempDir('cache');
    const npm = fakeNpm();
    ensureRelease('0.6.8', {cacheDir, run: npm.run});
    const cli = path.join(
      releasesDir(cacheDir),
      '0.6.8',
      'node_modules',
      '@astryxdesign',
      'cli',
    );
    fs.writeFileSync(path.join(cli, 'extra-module.mjs'), 'export {};\n');
    forgetVerifiedReleases();
    expect(cachedRelease('0.6.8', cacheDir)).toBeNull();
    expect('bin' in ensureRelease('0.6.8', {cacheDir, run: npm.run})).toBe(
      true,
    );
    expect(npm.calls).toHaveLength(2);
  });
});

describe('stopped and damaged installs heal', () => {
  it('takes over a lock whose holder has gone, and clears its scratch folder', () => {
    const cacheDir = tempDir('cache');
    const root = releasesDir(cacheDir);
    const lock = path.join(root, '.lock-0.6.8');
    fs.mkdirSync(lock, {recursive: true});
    // A process id no run has: the holder was killed.
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({pid: 2 ** 22 + 7, host: os.hostname()}),
    );
    fs.mkdirSync(path.join(root, '.tmp-0.6.8-999-abc'), {recursive: true});
    const started = Date.now();
    const result = ensureRelease('0.6.8', {
      cacheDir,
      run: fakeNpm().run,
      waitMs: 60_000,
    });
    expect('bin' in result).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(fs.readdirSync(root).filter(n => n.startsWith('.'))).toEqual([]);
  });

  it('waits for a holder that is still running', () => {
    const cacheDir = tempDir('cache');
    const lock = path.join(releasesDir(cacheDir), '.lock-0.6.8');
    fs.mkdirSync(lock, {recursive: true});
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({pid: process.pid, host: os.hostname()}),
    );
    const result = ensureRelease('0.6.8', {
      cacheDir,
      run: fakeNpm().run,
      waitMs: 300,
    });
    expect('reason' in result && result.reason).toMatch(/still installing/);
  });

  it('replaces a release whose marker, Core, or entry file is damaged', () => {
    /** @type {Array<(dir: string) => void>} */
    const damage = [
      dir =>
        fs.writeFileSync(path.join(dir, 'release.json'), '{"version": "0.6'),
      dir =>
        fs.rmSync(path.join(dir, 'node_modules', '@astryxdesign', 'core'), {
          recursive: true,
        }),
      dir =>
        fs.writeFileSync(
          path.join(dir, 'node_modules', '@astryxdesign', 'cli', 'bin.cjs'),
          '#!/usr/bin/env node\n',
        ),
    ];
    for (const harm of damage) {
      const cacheDir = tempDir('cache');
      const npm = fakeNpm();
      const first = ensureRelease('0.6.8', {cacheDir, run: npm.run});
      expect('bin' in first).toBe(true);
      harm(path.join(releasesDir(cacheDir), '0.6.8'));
      forgetVerifiedReleases();
      expect(cachedRelease('0.6.8', cacheDir)).toBeNull();
      const healed = ensureRelease('0.6.8', {cacheDir, run: npm.run});
      expect('bin' in healed && healed.version).toBe('0.6.8');
      expect(npm.calls).toHaveLength(2);
      expect(cachedRelease('0.6.8', cacheDir)).not.toBeNull();
    }
  });

  it('says the cache cannot be written instead of throwing', () => {
    const parent = tempDir('ro');
    const cacheDir = path.join(parent, 'cache');
    // A file where the cache folder should be: no folder can be made there.
    fs.writeFileSync(cacheDir, '');
    const result = ensureRelease('0.6.8', {cacheDir, run: fakeNpm().run});
    expect('reason' in result && result.reason).toMatch(/cannot be written/);
  });
});

/** @param {number} pid */
const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** @param {() => boolean} done @param {number} ms */
const waitFor = async (done, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (done()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return done();
};

describe('runNpm time limit', () => {
  it('ends a package manager that ignores SIGTERM, leaving no process behind', async () => {
    const marker = tempDir('npm-pid');
    const pidFile = path.join(marker, 'pid');
    const result = runNpm([], {
      timeoutMs: 500,
      npm: {
        command: process.execPath,
        prefix: [
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000);`,
        ],
        shell: false,
      },
    });
    expect(/** @type {any} */ (result.error)?.code).toBe('ETIMEDOUT');
    const pid = Number(fs.readFileSync(pidFile, 'utf-8'));
    // The guard sends SIGKILL and exits at once; the killed process can still
    // exist for a moment (the signal in flight, or awaiting reaping).
    expect(await waitFor(() => !alive(pid), 5_000)).toBe(true);
  });
});

describe('no install outlives its run', () => {
  it('ends npm when the run that started it is killed outright, and removes its process-id record', async () => {
    const dir = tempDir('orphan');
    const pidFile = path.join(dir, 'npm-pid');
    // The record a release lock keeps of npm's process id.
    const record = path.join(dir, 'npm.pid');
    const cacheModule = new URL('./cache.mjs', import.meta.url).href;
    const sleeper = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 120000);`;
    const script = `import(${JSON.stringify(cacheModule)}).then(m => m.runNpm([], {timeoutMs: 120000, pidFile: ${JSON.stringify(record)}, npm: {command: process.execPath, prefix: ['-e', ${JSON.stringify(sleeper)}], shell: false}}));`;
    const cli = spawn(process.execPath, ['-e', script], {stdio: 'ignore'});
    expect(await waitFor(() => fs.existsSync(pidFile), 10_000)).toBe(true);
    expect(await waitFor(() => fs.existsSync(record), 5_000)).toBe(true);
    const npmPid = Number(fs.readFileSync(pidFile, 'utf-8'));
    expect(alive(npmPid)).toBe(true);
    cli.kill('SIGKILL');
    expect(await waitFor(() => !alive(npmPid), 5_000)).toBe(true);
    // A later takeover finds no id that could now name another process.
    expect(await waitFor(() => !fs.existsSync(record), 5_000)).toBe(true);
  }, 30_000);

  it('ends npm, which ignores Ctrl-C, when the run gets Ctrl-C', async () => {
    const dir = tempDir('ctrlc');
    const pidFile = path.join(dir, 'npm-pid');
    const cacheModule = new URL('./cache.mjs', import.meta.url).href;
    const sleeper = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGINT', () => {}); setTimeout(() => {}, 120000);`;
    const script = `import(${JSON.stringify(cacheModule)}).then(m => m.runNpm([], {timeoutMs: 120000, npm: {command: process.execPath, prefix: ['-e', ${JSON.stringify(sleeper)}], shell: false}}));`;
    // Its own group, as a terminal's foreground job: Ctrl-C reaches the group.
    const cli = spawn(process.execPath, ['-e', script], {
      stdio: 'ignore',
      detached: true,
    });
    expect(await waitFor(() => fs.existsSync(pidFile), 10_000)).toBe(true);
    const npmPid = Number(fs.readFileSync(pidFile, 'utf-8'));
    const exited = new Promise(resolve => cli.on('exit', resolve));
    process.kill(-(/** @type {number} */ (cli.pid)), 'SIGINT');
    expect(await waitFor(() => !alive(npmPid), 5_000)).toBe(true);
    await exited;
  }, 30_000);

  it("a run that takes over a dead run's lock ends the install it recorded", async () => {
    const cacheDir = tempDir('cache');
    const lock = path.join(releasesDir(cacheDir), '.lock-0.6.8');
    fs.mkdirSync(lock, {recursive: true});
    // An install left running by a run that was killed: its own group, node
    // running npm's entry file to install this release.
    const at = Date.now() - 1000;
    const npmCli = path.join(tempDir('npm'), 'npm-cli.js');
    fs.writeFileSync(npmCli, 'setTimeout(() => {}, 120000)');
    const leftover = spawn(
      process.execPath,
      [
        npmCli,
        'install',
        '@astryxdesign/cli@0.6.8',
        '@astryxdesign/core@0.6.8',
      ],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    leftover.unref();
    await new Promise(resolve => setTimeout(resolve, 300));
    fs.writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({pid: 2 ** 22 + 7, host: os.hostname(), at}),
    );
    fs.writeFileSync(path.join(lock, 'npm.pid'), String(leftover.pid));
    expect(alive(/** @type {number} */ (leftover.pid))).toBe(true);
    const result = ensureRelease('0.6.8', {cacheDir, run: fakeNpm().run});
    expect('bin' in result).toBe(true);
    expect(
      await waitFor(() => !alive(/** @type {number} */ (leftover.pid)), 5_000),
    ).toBe(true);
  }, 30_000);
});
