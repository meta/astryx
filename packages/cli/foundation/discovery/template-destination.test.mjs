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

describe('templateDestination', () => {
  it('puts a page in the root App Router folder, where Next serves it', () => {
    mkdir('app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe('app/dashboard');
  });

  it('puts a page in src/app when that is the App Router folder', () => {
    mkdir('src/app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/app/dashboard',
    );
  });

  it('prefers the root app/ folder when both exist, as Next does', () => {
    mkdir('app');
    mkdir('src/app');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe('app/dashboard');
  });

  it('never names src/pages beside an app/ folder, which Next refuses to build', () => {
    mkdir('app');
    mkdir('src/pages');
    expect(templateDestination(dir, 'page', 'login')).toBe('app/login');
  });

  it('puts a page in src/pages in a project with no App Router', () => {
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/pages/dashboard',
    );
    mkdir('pages');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/pages/dashboard',
    );
  });

  it('does not count a file named app as the App Router folder', () => {
    fs.writeFileSync(path.join(dir, 'app'), '');
    expect(templateDestination(dir, 'page', 'dashboard')).toBe(
      'src/pages/dashboard',
    );
  });

  it('puts a block in src/components in every project', () => {
    mkdir('app');
    expect(templateDestination(dir, 'block', 'ButtonShowcase')).toBe(
      'src/components/ButtonShowcase',
    );
  });

  it('skips a folder that already exists, so the command runs as printed', () => {
    mkdir('app/settings');
    mkdir('app/settings-2');
    fs.writeFileSync(path.join(dir, 'app', 'settings-3'), '');
    expect(templateDestination(dir, 'page', 'settings')).toBe('app/settings-4');
    mkdir('src/components/CardShowcase');
    expect(templateDestination(dir, 'block', 'CardShowcase')).toBe(
      'src/components/CardShowcase-2',
    );
  });
});
