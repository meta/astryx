// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {templateDestination} from './template-destination.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-destination-'));
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel */
const mkdir = rel => fs.mkdirSync(path.join(dir, rel), {recursive: true});

/** @param {string} rel */
const write = rel => {
  mkdir(path.dirname(rel));
  fs.writeFileSync(path.join(dir, rel), 'export default function Page() {}\n');
};

/** @param {Record<string, unknown>} pkg */
const writePackage = pkg =>
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));

const nextApp = () => writePackage({dependencies: {next: '^16.0.0'}});

describe('templateDestination', () => {
  it('puts a page in the root App Router folder of a Next app, where Next serves it', () => {
    nextApp();
    mkdir('app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe('app/dashboard');
  });

  it('puts a page in src/app when that is the App Router folder', () => {
    writePackage({devDependencies: {next: '16.4.0'}});
    mkdir('src/app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/app/dashboard',
    );
  });

  it('prefers the root app/ folder when both exist, as Next does', () => {
    nextApp();
    mkdir('app');
    mkdir('src/app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe('app/dashboard');
  });

  it('never names src/pages beside the app/ folder of a Next app, which Next refuses to build', () => {
    nextApp();
    mkdir('app');
    mkdir('src/pages');
    expect(templateDestination(dir, 'page', 'login')).toBe('app/login');
  });

  it('puts a page in src/pages in a project that is not a Next app', () => {
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/pages/dashboard',
    );
  });

  it('writes a Pages Router page as the file Next serves at its URL', () => {
    nextApp();
    mkdir('pages');
    expect(templateDestination(dir, 'page', 'login')).toBe('pages/login.tsx');
    write('pages/login/index.tsx');
    expect(templateDestination(dir, 'page', 'login')).toBe('pages/login-2.tsx');
  });

  it('reads the Pages Router folder at the root, else in src/, as Next finds it', () => {
    nextApp();
    mkdir('src/pages');
    expect(templateDestination(dir, 'page', 'login')).toBe(
      'src/pages/login.tsx',
    );
    mkdir('pages');
    expect(templateDestination(dir, 'page', 'login')).toBe('pages/login.tsx');
  });

  it('passes over a URL a page in a route group already serves', () => {
    nextApp();
    write('app/layout.tsx');
    write('app/(auth)/login/page.tsx');
    expect(templateDestination(dir, 'page', 'login')).toBe('app/login-2');
  });

  it('passes over a URL a Pages Router file serves beside the App Router', () => {
    nextApp();
    mkdir('app');
    write('pages/login.tsx');
    expect(templateDestination(dir, 'page', 'login')).toBe('app/login-2');
  });

  it('puts a page under the root layout when the routes folder has none of its own', () => {
    nextApp();
    write('app/(shop)/layout.tsx');
    write('app/(marketing)/layout.tsx');
    expect(templateDestination(dir, 'page', 'login')).toBe(
      'app/(marketing)/login',
    );
  });

  it('keeps src/pages in a project that is not a Next app, whatever its folders are called', () => {
    writePackage({dependencies: {vite: '^8.0.0'}});
    mkdir('app');
    mkdir('src/app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/pages/dashboard',
    );
  });

  it('does not count a file named app as the App Router folder', () => {
    nextApp();
    fs.writeFileSync(path.join(dir, 'app'), '');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/pages/dashboard',
    );
  });

  it('puts a block beside the routes of a Next app whose App Router folder is app/', () => {
    nextApp();
    mkdir('app');
    expect(templateDestination(dir, 'block', 'ButtonShowcase')).toBe(
      'app/components/ButtonShowcase',
    );
  });

  it('puts a block in components/ in a Next app with only a root pages/ folder', () => {
    nextApp();
    mkdir('pages');
    expect(templateDestination(dir, 'block', 'ButtonShowcase')).toBe(
      'components/ButtonShowcase',
    );
  });

  it('puts a block in src/components in every other project', () => {
    expect(templateDestination(dir, 'block', 'ButtonShowcase')).toBe(
      'src/components/ButtonShowcase',
    );
    nextApp();
    mkdir('src/app');
    expect(templateDestination(dir, 'block', 'ButtonShowcase')).toBe(
      'src/components/ButtonShowcase',
    );
  });

  it('skips a folder that already exists, so the command runs as printed', () => {
    nextApp();
    mkdir('app/settings');
    mkdir('app/settings-2');
    fs.writeFileSync(path.join(dir, 'app', 'settings-3'), '');
    expect(templateDestination(dir, 'page', 'settings')).toBe('app/settings-4');
    mkdir('app/components/CardShowcase');
    expect(templateDestination(dir, 'block', 'CardShowcase')).toBe(
      'app/components/CardShowcase-2',
    );
  });
});
