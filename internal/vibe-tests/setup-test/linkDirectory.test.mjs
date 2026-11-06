// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {linkDirectory, retargetLinkTarget} from './linkDirectory.mjs';

const scratchDirs = [];

function scratch(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/**
 * Builds a source tree shaped like pnpm's own Windows node_modules layout:
 * a real package directory nested under `.pnpm`, and a top-level entry that
 * links to it with an absolute target — a junction on win32, an absolute
 * symlink everywhere else, so the retargeting logic under test runs
 * identically on every platform even though the real-world bug is
 * Windows-only (pnpm only uses absolute-target links there).
 */
function buildPnpmLikeSource(root) {
  const realPkgDir = path.join(
    root,
    'node_modules',
    '.pnpm',
    'pkg@1.0.0',
    'node_modules',
    'pkg',
  );
  fs.mkdirSync(realPkgDir, {recursive: true});
  fs.writeFileSync(path.join(realPkgDir, 'package.json'), '{"name":"pkg"}');

  const linkPath = path.join(root, 'node_modules', 'pkg');
  fs.symlinkSync(
    realPkgDir,
    linkPath,
    process.platform === 'win32' ? 'junction' : undefined,
  );
  return {realPkgDir, linkPath};
}

describe('retargetLinkTarget', () => {
  // path.resolve() prepends the current drive letter on Windows, so a
  // bare '/src' string would silently gain a 'D:' prefix and no longer
  // match a literal '/src'-based expectation. Root everything under a
  // real tmp directory instead, which resolves consistently on every
  // platform.
  const root = os.tmpdir();
  const src = path.join(root, 'src');
  const dst = path.join(root, 'dst');

  it('leaves a relative target untouched', () => {
    expect(retargetLinkTarget('../sibling', src, dst)).toBe('../sibling');
  });

  it('retargets an absolute target that resolves inside sourceRoot', () => {
    const source = path.join(src, 'node_modules');
    const destination = path.join(dst, 'node_modules');
    const target = path.join(source, '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg');
    expect(retargetLinkTarget(target, source, destination)).toBe(
      path.join(destination, '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg'),
    );
  });

  it('leaves an absolute target that resolves outside sourceRoot alone', () => {
    const source = path.join(src, 'node_modules');
    const destination = path.join(dst, 'node_modules');
    const external = path.join(root, 'workspace', 'packages', 'core');
    expect(retargetLinkTarget(external, source, destination)).toBe(external);
  });
});

describe('linkDirectory (#5907)', () => {
  it('recreates a junction/symlink pointing into the destination copy, not the source', () => {
    const source = scratch('linkdir-source-');
    const destination = path.join(scratch('linkdir-dest-'), 'copy');
    buildPnpmLikeSource(source);

    linkDirectory(
      path.join(source, 'node_modules'),
      path.join(destination, 'node_modules'),
    );

    const copiedLink = path.join(destination, 'node_modules', 'pkg');
    const resolvedTarget = fs.realpathSync(copiedLink);
    const expectedInsideDestination = fs.realpathSync(
      path.join(
        destination,
        'node_modules',
        '.pnpm',
        'pkg@1.0.0',
        'node_modules',
        'pkg',
      ),
    );
    expect(resolvedTarget).toBe(expectedInsideDestination);
  });

  it('keeps a write through one sandbox from reaching the shared source or a sibling sandbox', () => {
    const source = scratch('linkdir-source-');
    buildPnpmLikeSource(source);

    const sandboxA = path.join(scratch('linkdir-sandbox-a-'), 'copy');
    const sandboxB = path.join(scratch('linkdir-sandbox-b-'), 'copy');
    linkDirectory(
      path.join(source, 'node_modules'),
      path.join(sandboxA, 'node_modules'),
    );
    linkDirectory(
      path.join(source, 'node_modules'),
      path.join(sandboxB, 'node_modules'),
    );

    // Write a NEW file through sandbox A's link, the way a build or an
    // agent editing the sandbox would, not by overwriting an existing
    // hardlinked file's content (which shares bytes with the source by
    // design, and isn't what this bug was about).
    const addedFileRelative = path.join(
      'node_modules',
      'pkg',
      'added-by-sandbox-a.txt',
    );
    fs.writeFileSync(
      path.join(sandboxA, addedFileRelative),
      'written through sandbox A',
    );

    const sourceAddedFile = path.join(
      source,
      'node_modules',
      '.pnpm',
      'pkg@1.0.0',
      'node_modules',
      'pkg',
      'added-by-sandbox-a.txt',
    );
    const sandboxBAddedFile = path.join(
      sandboxB,
      'node_modules',
      '.pnpm',
      'pkg@1.0.0',
      'node_modules',
      'pkg',
      'added-by-sandbox-a.txt',
    );
    const sandboxAOwnCopy = path.join(
      sandboxA,
      'node_modules',
      '.pnpm',
      'pkg@1.0.0',
      'node_modules',
      'pkg',
      'added-by-sandbox-a.txt',
    );

    expect(fs.existsSync(sourceAddedFile)).toBe(false);
    expect(fs.existsSync(sandboxBAddedFile)).toBe(false);
    expect(fs.existsSync(sandboxAOwnCopy)).toBe(true);
  });
});
