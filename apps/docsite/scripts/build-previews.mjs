// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build and stage Storybook and Vite Sandbox in the Vercel docsite.
 * @input VERCEL_ENV, VERCEL_GIT_COMMIT_SHA, Storybook static build, and Sandbox Vite static build.
 * @output apps/docsite/public/{storybook,sandbox} in preview and production deployments.
 * @position Build-time staging before the docsite Next.js build; CI retains its own visual artifact.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CANONICAL_ORIGIN = 'https://astryx.atmeta.com';
const DEPLOYED_ENVIRONMENTS = new Set(['preview', 'production']);

function documentMetadata(deploymentEnv, canonicalPath) {
  return deploymentEnv === 'production'
    ? `<link rel="canonical" href="${CANONICAL_ORIGIN}${canonicalPath}" />`
    : '<meta name="robots" content="noindex, nofollow" />';
}

function injectHead(html, markup) {
  const head = html.match(/<head(?:\s[^>]*)?>/i)?.[0];
  if (!head) throw new Error('Static app HTML must contain a head element');
  return html.replace(head, `${head}\n    ${markup}`);
}

function htmlFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? htmlFiles(absolute)
      : entry.name.endsWith('.html')
        ? [absolute]
        : [];
  });
}

function sandboxCanonicalPath(destination, file) {
  const relative = path.relative(destination, file).split(path.sep).join('/');
  if (relative === 'index.html') return '/sandbox/';
  if (relative.endsWith('/index.html')) {
    return `/sandbox/${relative.slice(0, -'index.html'.length)}`;
  }
  return `/sandbox/${relative}`;
}

export function stageStorybook(source, destination, deploymentEnv) {
  const index = path.join(source, 'index.html');
  if (!fs.existsSync(index) || !fs.statSync(index).isFile()) {
    throw new Error(`Storybook build has no index.html: ${index}`);
  }
  const html = fs.readFileSync(index, 'utf8');
  if (/<base\b/i.test(html)) {
    throw new Error('Storybook index.html must not contain a base element');
  }

  // Next.js serves /storybook through index.html. Pin relative manager, iframe,
  // and asset URLs to the stable route. Only the entry is canonical in
  // production; previews and standalone frames stay out of search results.
  fs.rmSync(destination, {recursive: true, force: true});
  fs.cpSync(source, destination, {recursive: true});
  for (const file of htmlFiles(destination)) {
    const relative = path.relative(destination, file).split(path.sep).join('/');
    const metadata =
      deploymentEnv === 'production' && relative === 'index.html'
        ? documentMetadata(deploymentEnv, '/storybook/')
        : '<meta name="robots" content="noindex, nofollow" />';
    const markup =
      relative === 'index.html'
        ? ['<base href="/storybook/" />', metadata].join('\n    ')
        : metadata;
    fs.writeFileSync(file, injectHead(fs.readFileSync(file, 'utf8'), markup));
  }
}

export function stageSandbox(source, destination, deploymentEnv) {
  for (const relative of ['index.html', '404.html', '404/index.html']) {
    const file = path.join(source, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`Sandbox build has no ${relative}: ${file}`);
    }
  }
  // The Vite export already uses /sandbox/ for JS, CSS, template assets and
  // fullscreen embeds. Copy the physical tree unchanged except for discovery
  // metadata: stable routes are canonical and preview routes are noindex.
  fs.rmSync(destination, {recursive: true, force: true});
  fs.cpSync(source, destination, {recursive: true});
  for (const file of htmlFiles(destination)) {
    const relative = path.relative(destination, file).split(path.sep).join('/');
    const isRouteIndex =
      relative === 'index.html' || relative.endsWith('/index.html');
    const metadata =
      relative === '404.html' || relative === '404/index.html' || !isRouteIndex
        ? '<meta name="robots" content="noindex, nofollow" />'
        : documentMetadata(
            deploymentEnv,
            sandboxCanonicalPath(destination, file),
          );
    fs.writeFileSync(file, injectHead(fs.readFileSync(file, 'utf8'), metadata));
  }
}

function runPreviewBuild(run, root, name, args, env = process.env) {
  try {
    const output = run('pnpm', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env,
    });
    if (output) process.stdout.write(output);
  } catch (error) {
    const detail = [error.stdout, error.stderr]
      .filter(Boolean)
      .join('\n')
      .slice(-12000);
    throw new Error(
      `${name} static build failed:\n${detail || error.message}`,
      {
        cause: error,
      },
    );
  }
}

export function buildPreviews(
  deploymentEnv,
  root,
  run = execFileSync,
  commitSha = process.env.VERCEL_GIT_COMMIT_SHA,
) {
  const publicDir = path.join(root, 'apps/docsite/public');
  const storybookDestination = path.join(publicDir, 'storybook');
  const sandboxDestination = path.join(publicDir, 'sandbox');
  const versionFile = path.join(publicDir, 'version.json');
  if (!DEPLOYED_ENVIRONMENTS.has(deploymentEnv)) {
    // Local builds must never package an earlier cached deployment.
    fs.rmSync(storybookDestination, {recursive: true, force: true});
    fs.rmSync(sandboxDestination, {recursive: true, force: true});
    fs.rmSync(versionFile, {force: true});
    return;
  }
  if (!/^[0-9a-f]{40}$/i.test(commitSha ?? '')) {
    throw new Error('Vercel deployment is missing VERCEL_GIT_COMMIT_SHA');
  }

  // Remove cached apps before either build: a failed build must not leave an
  // older static tree that the subsequent Next build could accidentally ship.
  fs.rmSync(storybookDestination, {recursive: true, force: true});
  fs.rmSync(sandboxDestination, {recursive: true, force: true});
  fs.rmSync(versionFile, {force: true});
  runPreviewBuild(run, root, 'Storybook', [
    '-F',
    '@astryxdesign/storybook',
    'build',
  ]);
  runPreviewBuild(
    run,
    root,
    'Sandbox',
    ['-F', '@astryxdesign/sandbox', 'build'],
    {...process.env, SANDBOX_BASE_PATH: '/sandbox'},
  );
  stageStorybook(
    path.join(root, 'apps/storybook/dist'),
    storybookDestination,
    deploymentEnv,
  );
  stageSandbox(
    path.join(root, 'apps/sandbox/out'),
    sandboxDestination,
    deploymentEnv,
  );
  fs.writeFileSync(
    versionFile,
    `${JSON.stringify({commit: commitSha, environment: deploymentEnv})}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../..',
  );
  buildPreviews(process.env.VERCEL_ENV, root);
}
