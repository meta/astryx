// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, test} from 'node:test';

import {
  buildPreviews,
  stageSandbox,
  stageStorybook,
} from './build-previews.mjs';

const roots = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-static-preview-'));
  roots.push(root);
  const storybook = path.join(root, 'apps/storybook/dist');
  const sandbox = path.join(root, 'apps/sandbox/out');
  const publicDir = path.join(root, 'apps/docsite/public');
  fs.mkdirSync(path.join(storybook, 'assets'), {recursive: true});
  fs.writeFileSync(
    path.join(storybook, 'index.html'),
    '<html><head></head><body>Storybook</body></html>',
  );
  fs.writeFileSync(
    path.join(storybook, 'iframe.html'),
    '<html><head></head><body>Story</body></html>',
  );
  fs.writeFileSync(path.join(storybook, 'assets/manager.js'), 'manager bytes');
  for (const dir of [
    '',
    '404',
    'pages/motion-lab/bugs',
    'templates/login-sso',
  ]) {
    fs.mkdirSync(path.join(sandbox, dir), {recursive: true});
    fs.writeFileSync(
      path.join(sandbox, dir, 'index.html'),
      `<html><head></head><body>${dir}</body></html>`,
    );
  }
  fs.writeFileSync(
    path.join(sandbox, '404.html'),
    '<html><head></head><body>not found</body></html>',
  );
  fs.mkdirSync(path.join(sandbox, 'assets'), {recursive: true});
  fs.mkdirSync(path.join(sandbox, 'template-assets'), {recursive: true});
  fs.writeFileSync(path.join(sandbox, 'assets/app.js'), 'app');
  fs.writeFileSync(path.join(sandbox, 'assets/app.css'), 'styles');
  fs.writeFileSync(path.join(sandbox, 'template-assets/logo.svg'), '<svg/>');
  fs.writeFileSync(
    path.join(sandbox, 'templates/login-sso/embed.html'),
    '<html><head></head><body>embed</body></html>',
  );
  return {root, storybook, sandbox, publicDir};
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

test('stages complete Storybook under a stable /storybook/ asset base', () => {
  const {storybook, publicDir} = fixture();
  const destination = path.join(publicDir, 'storybook');
  fs.mkdirSync(destination, {recursive: true});
  fs.writeFileSync(path.join(destination, 'stale.js'), 'old');
  stageStorybook(storybook, destination, 'production');
  const index = fs.readFileSync(path.join(destination, 'index.html'), 'utf8');
  assert.match(index, /<base href="\/storybook\/" \/>/);
  assert.match(
    index,
    /<link rel="canonical" href="https:\/\/astryx\.atmeta\.com\/storybook\/" \/>/,
  );
  assert.match(
    fs.readFileSync(path.join(destination, 'iframe.html'), 'utf8'),
    /<meta name="robots" content="noindex, nofollow" \/>/,
  );
  assert.equal(
    fs.readFileSync(path.join(destination, 'assets/manager.js'), 'utf8'),
    'manager bytes',
  );
  assert.equal(fs.existsSync(path.join(destination, 'stale.js')), false);
});

test('stages physical Sandbox routes, embeds and assets without a fallback', () => {
  const {sandbox, publicDir} = fixture();
  const destination = path.join(publicDir, 'sandbox');
  fs.mkdirSync(destination, {recursive: true});
  fs.writeFileSync(path.join(destination, 'stale.html'), 'old');
  stageSandbox(sandbox, destination, 'production');
  for (const relative of [
    'template-assets/logo.svg',
    'assets/app.js',
    'assets/app.css',
  ]) {
    assert.equal(
      fs.readFileSync(path.join(destination, relative), 'utf8'),
      fs.readFileSync(path.join(sandbox, relative), 'utf8'),
    );
  }
  for (const [relative, canonical] of [
    ['index.html', '/sandbox/'],
    ['pages/motion-lab/bugs/index.html', '/sandbox/pages/motion-lab/bugs/'],
    ['templates/login-sso/index.html', '/sandbox/templates/login-sso/'],
  ]) {
    assert.match(
      fs.readFileSync(path.join(destination, relative), 'utf8'),
      new RegExp(
        `<link rel="canonical" href="https://astryx\\.atmeta\\.com${canonical}" />`,
      ),
    );
  }
  for (const relative of [
    '404.html',
    '404/index.html',
    'templates/login-sso/embed.html',
  ]) {
    assert.match(
      fs.readFileSync(path.join(destination, relative), 'utf8'),
      /<meta name="robots" content="noindex, nofollow" \/>/,
    );
  }
  assert.equal(fs.existsSync(path.join(destination, 'stale.html')), false);
  assert.equal(
    fs.existsSync(path.join(destination, 'unknown/index.html')),
    false,
  );
});

test('rejects incomplete exports before touching staged bytes', () => {
  const {storybook, sandbox, publicDir} = fixture();
  for (const [source, stage, missing, message] of [
    [
      storybook,
      stageStorybook,
      'index.html',
      /Storybook build has no index.html/,
    ],
    [
      sandbox,
      stageSandbox,
      '404/index.html',
      /Sandbox build has no 404\/index.html/,
    ],
  ]) {
    const destination = path.join(publicDir, 'staged');
    fs.mkdirSync(destination, {recursive: true});
    fs.writeFileSync(path.join(destination, 'index.html'), 'old');
    fs.rmSync(path.join(source, missing));
    assert.throws(() => stage(source, destination, 'preview'), message);
    assert.equal(
      fs.readFileSync(path.join(destination, 'index.html'), 'utf8'),
      'old',
    );
  }
});

test('stages versioned static apps in preview and production only', () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  for (const deploymentEnv of ['preview', 'production']) {
    const {root, publicDir} = fixture();
    const calls = [];
    buildPreviews(
      deploymentEnv,
      root,
      (command, args, options) => {
        calls.push({command, args, options});
      },
      commit,
    );
    assert.deepEqual(
      calls.map(({command, args}) => [command, args]),
      [
        ['pnpm', ['-F', '@astryxdesign/storybook', 'build']],
        ['pnpm', ['-F', '@astryxdesign/sandbox', 'build']],
      ],
    );
    assert.equal(calls[1].options.env.SANDBOX_BASE_PATH, '/sandbox');
    for (const name of ['storybook', 'sandbox'])
      assert.equal(
        fs.existsSync(path.join(publicDir, name, 'index.html')),
        true,
      );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(publicDir, 'version.json'), 'utf8')),
      {commit, environment: deploymentEnv},
    );
    const storybook = fs.readFileSync(
      path.join(publicDir, 'storybook/index.html'),
      'utf8',
    );
    if (deploymentEnv === 'production') {
      assert.match(storybook, /rel="canonical"/);
      assert.doesNotMatch(storybook, /noindex/);
    } else {
      assert.match(storybook, /noindex, nofollow/);
      assert.doesNotMatch(storybook, /rel="canonical"/);
    }
  }

  const {root, publicDir} = fixture();
  for (const deploymentEnv of ['development', undefined]) {
    buildPreviews(deploymentEnv, root, () => {
      throw new Error('should not run');
    });
    for (const name of ['storybook', 'sandbox'])
      assert.equal(fs.existsSync(path.join(publicDir, name)), false);
    assert.equal(fs.existsSync(path.join(publicDir, 'version.json')), false);
  }
});

test('refuses a deployed build without an exact commit identity', () => {
  const {root} = fixture();
  assert.throws(
    () => buildPreviews('production', root, () => {}, ''),
    /missing VERCEL_GIT_COMMIT_SHA/,
  );
});

test('Next preserves generated Sandbox routes in preview and production without a catch-all', async () => {
  const configPath = path.resolve(import.meta.dirname, '../next.config.mjs');
  const previous = process.env.VERCEL_ENV;
  try {
    for (const deploymentEnv of ['preview', 'production']) {
      process.env.VERCEL_ENV = deploymentEnv;
      const {default: config} = await import(
        `${configPath}?${deploymentEnv}-${Date.now()}`
      );
      assert.equal(config.skipTrailingSlashRedirect, true);
      assert.deepEqual((await config.rewrites()).afterFiles.slice(-2), [
        {source: '/sandbox', destination: '/sandbox/index.html'},
        {source: '/sandbox/:path+', destination: '/sandbox/:path+/index.html'},
      ]);
    }
    process.env.VERCEL_ENV = 'development';
    const {default: development} = await import(`${configPath}?development`);
    assert.equal(development.skipTrailingSlashRedirect, false);
    assert.equal(
      (await development.rewrites()).afterFiles.some(rule =>
        rule.source.startsWith('/sandbox'),
      ),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test('failed preview builds do not leave cached static trees', () => {
  const {root, publicDir} = fixture();
  buildPreviews(
    'preview',
    root,
    () => {},
    '0123456789abcdef0123456789abcdef01234567',
  );
  assert.throws(
    () =>
      buildPreviews(
        'preview',
        root,
        (_command, args) => {
          if (args[1] === '@astryxdesign/sandbox')
            throw Object.assign(new Error('command failed'), {
              stdout: 'building',
              stderr: 'failed to compile',
            });
        },
        '0123456789abcdef0123456789abcdef01234567',
      ),
    /Sandbox static build failed:\nbuilding\nfailed to compile/,
  );
  for (const name of ['storybook', 'sandbox'])
    assert.equal(fs.existsSync(path.join(publicDir, name)), false);
});
