// Copyright (c) Meta Platforms, Inc. and affiliates.

import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expandWorkspaceDirs} from '../lib/workspace-globs.mjs';

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function comparableContents(file, relative) {
  const contents = fs.readFileSync(file);
  if (relative !== 'package.json') return contents;

  // pnpm resolves workspace dependencies concurrently, so packed JSON object
  // insertion order can vary. Object keys are unordered; values and array order
  // remain exact, while every other package file stays byte-for-byte strict.
  return Buffer.from(JSON.stringify(canonicalJson(JSON.parse(contents))));
}

function files(root, directory = root, result = new Map()) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files(root, absolute, result);
    else if (entry.isFile()) {
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      result.set(relative, sha256(comparableContents(absolute, relative)));
    }
  }
  return result;
}

export function comparePackageTrees(localRoot, publishedRoot) {
  const local = files(localRoot);
  const published = files(publishedRoot);
  const errors = [];
  for (const [file, digest] of local) {
    if (!published.has(file))
      errors.push(`published package is missing ${file}`);
    else if (published.get(file) !== digest)
      errors.push(`published package differs at ${file}`);
  }
  for (const file of published.keys()) {
    if (!local.has(file))
      errors.push(`published package has unexpected ${file}`);
  }
  return errors;
}

function publishablePackages(root) {
  return expandWorkspaceDirs(root)
    .filter(directory => fs.existsSync(path.join(directory, 'package.json')))
    .map(directory => ({
      directory,
      manifest: JSON.parse(
        fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
      ),
    }))
    .filter(
      ({manifest}) =>
        manifest.name?.startsWith('@astryxdesign/') &&
        manifest.private !== true &&
        manifest.astryx?.canaryOnly !== true,
    );
}

function packLocal(directory, destination) {
  fs.mkdirSync(destination, {recursive: true});
  const output = execFileSync(
    'pnpm',
    ['pack', '--pack-destination', destination],
    {cwd: directory, encoding: 'utf8'},
  ).trim();
  const filename = output.split(/\r?\n/u).filter(Boolean).at(-1);
  if (!filename)
    throw new Error(`pnpm pack returned no tarball for ${directory}`);
  return path.isAbsolute(filename)
    ? filename
    : path.join(destination, path.basename(filename));
}

function packPublished(specifier, destination, cwd) {
  fs.mkdirSync(destination, {recursive: true});
  const output = execFileSync(
    'npm',
    [
      'pack',
      specifier,
      '--pack-destination',
      destination,
      '--ignore-scripts',
      '--silent',
    ],
    {cwd, encoding: 'utf8'},
  ).trim();
  const filename = output.split(/\r?\n/u).filter(Boolean).at(-1);
  if (!filename)
    throw new Error(`npm pack returned no tarball for ${specifier}`);
  return path.join(destination, filename);
}

function extract(tarball, destination) {
  fs.mkdirSync(destination, {recursive: true});
  execFileSync('tar', ['-xzf', tarball, '-C', destination]);
  return path.join(destination, 'package');
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null)
      throw new Error('expected --version X.Y.Z and optional --root PATH');
    values[key.slice(2)] = value;
  }
  return values;
}

export function verifyPublishedPackages({root, version}) {
  const scratch = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-published-parity-'),
  );
  const errors = [];
  try {
    for (const {directory, manifest} of publishablePackages(root)) {
      if (manifest.version !== version) {
        errors.push(
          `${manifest.name} is ${manifest.version}, expected ${version}`,
        );
        continue;
      }
      const slug = manifest.name.replace('@', '').replace('/', '-');
      const localTar = packLocal(directory, path.join(scratch, 'local'));
      const publishedTar = packPublished(
        `${manifest.name}@${version}`,
        path.join(scratch, 'published'),
        root,
      );
      const localRoot = extract(localTar, path.join(scratch, `${slug}-local`));
      const publishedRoot = extract(
        publishedTar,
        path.join(scratch, `${slug}-published`),
      );
      for (const error of comparePackageTrees(localRoot, publishedRoot)) {
        errors.push(`${manifest.name}: ${error}`);
      }
    }
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
  return errors;
}

function main() {
  const values = parseArgs(process.argv.slice(2));
  const version = values.version;
  if (!/^\d+\.\d+\.\d+$/u.test(version ?? ''))
    throw new Error('--version must be X.Y.Z');
  const root = path.resolve(values.root ?? process.cwd());
  const errors = verifyPublishedPackages({root, version});
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`Published package contents match ${version}.`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(`published package parity failed: ${error.message}`);
    process.exit(1);
  }
}
