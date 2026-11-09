// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {readObjects} from './git-objects.mjs';
import {filesAtRef} from '../release/active-release.mjs';

const require = createRequire(import.meta.url);
const {
  isKnowledgeRecordPath,
} = require('../../.github/scripts/knowledge-paths.cjs');
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/** @type {string[]} */
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

/** @param {string} root @param {string[]} args */
const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], {maxBuffer: 1024 * 1024 * 1024});

/**
 * The id git names a blob by: the hash of its header and bytes.
 * @param {string} format the repository's object format
 * @param {Buffer} content
 */
function blobId(format, content) {
  return createHash(format === 'sha256' ? 'sha256' : 'sha1')
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex');
}

// The two batched readers: check-knowledge's and the release check's own.
const READERS = {
  readObjects: (root, ref, files) => {
    const objects = readObjects(
      root,
      files.map(file => `${ref}:${file}`),
    );
    return new Map(files.map(file => [file, objects.get(`${ref}:${file}`)]));
  },
  filesAtRef,
};

describe.each(Object.entries(READERS))('%s', (_, read) => {
  it('reads each file as `git show` reads it, and null where git has none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-objects-'));
    roots.push(root);
    const files = {
      'a.txt': Buffer.from('one\ntwo\n'),
      'my dir/space name.md': Buffer.from('# Ünïcode — ok\n'),
      'empty.txt': Buffer.alloc(0),
      'binary.dat': Buffer.from([0, 10, 255, 10, 0, 1]),
    };
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), content);
    }
    git(root, 'init', '-q');
    git(root, 'add', '-A');
    git(
      root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.com',
      'commit',
      '-qm',
      'files',
    );

    const read1 = read(root, 'HEAD', [...Object.keys(files), 'missing.txt']);
    for (const file of Object.keys(files)) {
      expect(read1.get(file), file).toEqual(git(root, 'show', `HEAD:${file}`));
    }
    expect(read1.get('missing.txt')).toBeNull();
    expect(read(root, 'no-such-ref', ['a.txt']).get('a.txt')).toBeNull();
  });

  it('reads every knowledge record of this repository at HEAD byte for byte', () => {
    const listing = git(
      REPO_ROOT,
      'ls-tree',
      '-r',
      'HEAD',
      '--',
      'docs',
      'packages',
    )
      .toString()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [meta, file] = line.split('\t');
        return {id: meta.split(' ')[2], file};
      })
      .filter(({file}) => isKnowledgeRecordPath(file));
    expect(listing.length).toBeGreaterThan(100);
    const format = git(REPO_ROOT, 'rev-parse', '--show-object-format')
      .toString()
      .trim();
    const contents = read(
      REPO_ROOT,
      'HEAD',
      listing.map(({file}) => file),
    );
    for (const {id, file} of listing) {
      expect(blobId(format, contents.get(file)), file).toBe(id);
    }
  });
});
