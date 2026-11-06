// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Content-target resolution tests.
 *
 * Pins the DOCSITE_TARGET × VERCEL_ENV matrix of getTarget() exactly as it
 * behaves today — test-only documentation of an intentional contract, not a
 * behavior change. The explicit DOCSITE_TARGET override always wins: it exists
 * for CI lanes and local runs. Deployments rely on VERCEL_ENV alone (canary
 * site = preview, production → latest) and never set the override.
 *
 * Also covers the `latest` content snapshot: which packages it materializes
 * from npm, when a missing tarball is the gap before a package's first stable
 * release and when it is a partly published release that fails the build, and
 * that a cache built with a gap is not reused.
 *
 * @input DOCSITE_TARGET / VERCEL_ENV environment combinations; a fake npm/tar
 *   runner for the snapshot
 * @output Regression coverage for the target-selection and snapshot contracts
 * @position Build-time docsite target verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  admittedStableIntegration,
  getTarget,
  latestStableVersion,
  materializeFromNpm,
} from '../../scripts/resolve-content-root.mjs';

const ENV_KEYS = ['DOCSITE_TARGET', 'VERCEL_ENV'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

function setEnv(vercelEnv: string | null, docsiteTarget: string | null) {
  if (vercelEnv == null) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = vercelEnv;
  }
  if (docsiteTarget == null) {
    delete process.env.DOCSITE_TARGET;
  } else {
    process.env.DOCSITE_TARGET = docsiteTarget;
  }
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('getTarget', () => {
  it('defaults to canary outside production (development, preview, unset)', () => {
    setEnv(null, null);
    expect(getTarget()).toBe('canary');
    setEnv('preview', null);
    expect(getTarget()).toBe('canary');
    setEnv('development', null);
    expect(getTarget()).toBe('canary');
  });

  it('derives latest from a production deployment', () => {
    setEnv('production', null);
    expect(getTarget()).toBe('latest');
  });

  it('lets an explicit DOCSITE_TARGET override the deployment default', () => {
    // The override exists for CI lanes and local runs (e.g. generating the
    // latest catalog on a dev machine, or pinning a preview to published
    // content). Deployed environments never set it: the canary site deploys
    // as VERCEL_ENV=preview and production deploys with no override, so
    // production always resolves to latest in practice.
    setEnv(null, 'latest');
    expect(getTarget()).toBe('latest');
    setEnv('preview', 'latest');
    expect(getTarget()).toBe('latest');
    setEnv('production', 'latest');
    expect(getTarget()).toBe('latest');
    setEnv('production', 'canary');
    expect(getTarget()).toBe('canary');
  });

  it('rejects unknown target values', () => {
    setEnv(null, 'bogus');
    expect(() => getTarget()).toThrow(/Invalid DOCSITE_TARGET="bogus"/);
  });
});

/**
 * A fake `exec` for the snapshot: `npm pack` succeeds for the specs in
 * `published` (writing a placeholder tarball), fails E404 for the rest;
 * `npm view <name> dist-tags` answers from `distTags` (E404 when absent);
 * `tar` extracts by writing a package.json into the destination.
 */
function fakeNpm({
  published,
  distTags,
}: {
  published: string[];
  distTags: Record<string, Record<string, string>>;
}) {
  const calls: string[][] = [];
  // What npm really reports: ETARGET for a published package without the
  // requested version, E404 for a package that is not on npm at all.
  const noSuchVersion = (spec: string) =>
    Object.assign(new Error(`Command failed: npm pack ${spec}`), {
      stderr: `npm error code ETARGET\nnpm error notarget No matching version found for ${spec}.\n`,
    });
  const notFound = (what: string) =>
    Object.assign(new Error(`Command failed: npm view ${what}`), {
      stderr: `npm error code E404\nnpm error 404 Not Found - ${what}\n`,
    });
  const exec = (cmd: string, args: string[], opts: {cwd?: string} = {}) => {
    calls.push([cmd, ...args]);
    if (cmd === 'npm' && args[0] === 'pack') {
      const spec = args[1];
      if (!published.includes(spec)) {
        throw noSuchVersion(spec);
      }
      const filename = `${spec.replace(/[@/]/g, '-')}.tgz`;
      fs.writeFileSync(path.join(opts.cwd!, filename), '');
      return JSON.stringify([{filename}]);
    }
    if (cmd === 'npm' && args[0] === 'view') {
      const tags = distTags[args[1]];
      if (tags == null) {
        throw notFound(args[1]);
      }
      return JSON.stringify(tags);
    }
    if (cmd === 'tar') {
      const dest = args[args.indexOf('-C') + 1];
      fs.mkdirSync(dest, {recursive: true});
      fs.writeFileSync(path.join(dest, 'package.json'), '{}');
      return '';
    }
    throw new Error(`unexpected command: ${cmd} ${args.join(' ')}`);
  };
  return {exec, calls};
}

describe('materializeFromNpm', () => {
  const core = {name: '@astryxdesign/core', dir: 'packages/core'};
  const neutral = {
    name: '@astryxdesign/theme-neutral',
    dir: 'packages/themes/neutral',
  };
  const richtext = {name: '@astryxdesign/richtext', dir: 'packages/richtext'};
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-snapshot-'));
  });

  afterEach(() => {
    fs.rmSync(cacheDir, {recursive: true, force: true});
  });

  it('skips a package that has never had a stable release and leaves it out of the stamp', () => {
    const npm = fakeNpm({
      published: ['@astryxdesign/core@0.7.0'],
      distTags: {
        '@astryxdesign/core': {latest: '0.7.0'},
        // The bootstrap publish that reserves the name: a prerelease on
        // `latest`, no stable release yet.
        '@astryxdesign/richtext': {
          latest: '0.0.0-bootstrap.0',
          canary: '0.7.0-canary.abc1234',
        },
      },
    });
    const root = materializeFromNpm('0.7.0', [core, richtext], {
      exec: npm.exec,
      cacheDir,
    });

    expect(fs.existsSync(path.join(root, 'packages/core/package.json'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(root, 'packages/richtext'))).toBe(false);
    expect(fs.readFileSync(path.join(root, '.stamp'), 'utf-8')).toBe(
      'v3:npm-0.7.0:@astryxdesign/core',
    );

    // A cache with a gap is rebuilt on the next run, so the package appears
    // as soon as it is published; a complete cache is reused as is.
    const before = npm.calls.length;
    materializeFromNpm('0.7.0', [core, richtext], {exec: npm.exec, cacheDir});
    expect(npm.calls.length).toBeGreaterThan(before);
    const complete = fakeNpm({
      published: ['@astryxdesign/core@0.7.0'],
      distTags: {'@astryxdesign/core': {latest: '0.7.0'}},
    });
    materializeFromNpm('0.7.0', [core], {exec: complete.exec, cacheDir});
    const afterComplete = complete.calls.length;
    materializeFromNpm('0.7.0', [core], {exec: complete.exec, cacheDir});
    expect(complete.calls.length).toBe(afterComplete);
  });

  it('fails when a package with a stable release behind it is missing at the documented version', () => {
    // Core is published at 0.7.0 but the theme is still at 0.6.8: the release
    // is only partly published, which must fail the build, not document a
    // production site without the theme.
    const npm = fakeNpm({
      published: ['@astryxdesign/core@0.7.0'],
      distTags: {
        '@astryxdesign/core': {latest: '0.7.0'},
        '@astryxdesign/theme-neutral': {latest: '0.6.8'},
      },
    });
    expect(() =>
      materializeFromNpm('0.7.0', [core, neutral], {exec: npm.exec, cacheDir}),
    ).toThrow(
      /@astryxdesign\/theme-neutral@0\.7\.0 is not on npm, but @astryxdesign\/theme-neutral already has stable release 0\.6\.8/,
    );
    expect(fs.existsSync(path.join(cacheDir, 'npm-0.7.0', '.stamp'))).toBe(
      false,
    );
  });

  it('propagates npm failures other than a missing version', () => {
    // execFileSync appends the captured stderr to the message.
    const exec = () => {
      throw Object.assign(
        new Error('Command failed: npm pack\nnpm error code ETIMEDOUT'),
        {stderr: 'npm error code ETIMEDOUT\n'},
      );
    };
    expect(() => materializeFromNpm('0.7.0', [core], {exec, cacheDir})).toThrow(
      /ETIMEDOUT/,
    );
  });
});

describe('latestStableVersion', () => {
  it('reads the stable dist-tag', () => {
    const {exec} = fakeNpm({
      published: [],
      distTags: {'@astryxdesign/core': {latest: '0.6.8', canary: '0.7.0-c'}},
    });
    expect(latestStableVersion('@astryxdesign/core', exec)).toBe('0.6.8');
  });

  it('treats a prerelease on latest, or no package at all, as no stable release', () => {
    const {exec} = fakeNpm({
      published: [],
      distTags: {'@astryxdesign/richtext': {latest: '0.0.0-bootstrap.0'}},
    });
    expect(latestStableVersion('@astryxdesign/richtext', exec)).toBeNull();
    expect(
      latestStableVersion('@astryxdesign/never-published', exec),
    ).toBeNull();
  });
});

describe('admittedStableIntegration', () => {
  let contentRoot: string;

  beforeEach(() => {
    contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-content-'));
  });

  afterEach(() => {
    fs.rmSync(contentRoot, {recursive: true, force: true});
  });

  it('admits a stable package only once the content snapshot holds it', () => {
    // Core is a stable release in the workspace. Before its tarball is in
    // the snapshot (a promoted package awaiting its first stable publish)
    // it is not admitted, so its workspace showcase blocks and playground
    // scope stay off `latest` along with its component docs; once the
    // snapshot holds it, it is.
    const admitted = admittedStableIntegration(contentRoot);
    expect(admitted('@astryxdesign/core')).toBe(false);

    fs.mkdirSync(path.join(contentRoot, 'packages/core'), {recursive: true});
    fs.writeFileSync(
      path.join(contentRoot, 'packages/core/package.json'),
      '{"name":"@astryxdesign/core"}',
    );
    expect(admitted('@astryxdesign/core')).toBe(true);
  });

  it('never admits a canary-only package, a theme dir mismatch, or a non-Astryx name', () => {
    const admitted = admittedStableIntegration(contentRoot);
    // @astryxdesign/lab is astryx.canaryOnly in the workspace: a snapshot
    // entry alone cannot admit it.
    fs.mkdirSync(path.join(contentRoot, 'packages/lab'), {recursive: true});
    fs.writeFileSync(
      path.join(contentRoot, 'packages/lab/package.json'),
      '{"name":"@astryxdesign/lab"}',
    );
    expect(admitted('@astryxdesign/lab')).toBe(false);
    // Themes live under packages/themes/<name>, so the plain dir does not count.
    fs.mkdirSync(path.join(contentRoot, 'packages/theme-neutral'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(contentRoot, 'packages/theme-neutral/package.json'),
      '{}',
    );
    expect(admitted('@astryxdesign/theme-neutral')).toBe(false);
    expect(admitted('react')).toBe(false);
  });
});
