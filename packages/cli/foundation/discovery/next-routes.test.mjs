// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  nextRouteFolders,
  pagesRouterPage,
  sameUrlPage,
} from './next-routes.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-next-routes-'));
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

describe('nextRouteFolders', () => {
  it('finds each routes folder at the root, else in src/, as Next finds it', () => {
    expect(nextRouteFolders(dir)).toEqual({app: null, pages: null});
    mkdir('src/app');
    mkdir('src/pages');
    expect(nextRouteFolders(dir)).toEqual({app: 'src/app', pages: 'src/pages'});
    // Next refuses to build this one: its app and pages folders are apart.
    mkdir('pages');
    expect(nextRouteFolders(dir)).toEqual({app: 'src/app', pages: 'pages'});
    mkdir('app');
    expect(nextRouteFolders(dir)).toEqual({app: 'app', pages: 'pages'});
  });

  it('does not count a file as a routes folder', () => {
    fs.writeFileSync(path.join(dir, 'app'), '');
    mkdir('src/app');
    expect(nextRouteFolders(dir)).toEqual({app: 'src/app', pages: null});
  });
});

describe('pagesRouterPage', () => {
  it('finds the file or the index file that serves a URL', () => {
    expect(pagesRouterPage(dir, 'login')).toBeNull();
    write('pages/login/index.tsx');
    expect(pagesRouterPage(dir, 'login')).toBe(
      path.join(dir, 'pages', 'login', 'index.tsx'),
    );
    write('src/pages/about.js');
    expect(pagesRouterPage(dir, 'about')).toBe(
      path.join(dir, 'src', 'pages', 'about.js'),
    );
    expect(pagesRouterPage(dir, '')).toBeNull();
  });
});

describe('sameUrlPage', () => {
  it('finds a page in a route group, and leaves other URLs alone', () => {
    const app = path.join(dir, 'app');
    write('app/(auth)/login/page.tsx');
    expect(sameUrlPage(dir, app, path.join(app, 'login'))).toBe(
      path.join(app, '(auth)', 'login', 'page.tsx'),
    );
    expect(sameUrlPage(dir, app, path.join(app, 'signup'))).toBeNull();
  });

  it('finds a page served at the URL through a route group and a catch-all', () => {
    write('app/settings/profile/page.tsx');
    write('app/(shop)/login/[[...rest]]/page.tsx');
    expect(
      sameUrlPage(dir, path.join(dir, 'app'), path.join(dir, 'app', 'login')),
    ).toBe(path.join(dir, 'app', '(shop)', 'login', '[[...rest]]', 'page.tsx'));
  });

  it('finds a Pages Router file that serves the same URL', () => {
    const app = path.join(dir, 'app');
    mkdir('app');
    write('pages/login.tsx');
    expect(sameUrlPage(dir, app, path.join(app, 'login'))).toBe(
      path.join(dir, 'pages', 'login.tsx'),
    );
  });
});
