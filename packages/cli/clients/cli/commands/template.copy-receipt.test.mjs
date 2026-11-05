// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx template <name> <path>` tells the caller, in JSON and in text,
 * when demo media in the copied file was replaced with placeholders.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {discoverTemplates} from '../../../api/template/template.mjs';

const SLOW = 60_000;

/** A page template whose source carries demo media, and one that carries none. */
async function pickPages() {
  const pages = /** @type {Array<{dirName: string, type: string, filePath: string}>} */ (
    await discoverTemplates()
  ).filter(t => t.type === 'page' && fs.existsSync(t.filePath));
  const hasMedia = (/** @type {{filePath: string}} */ t) =>
    /\/template-assets\/[\w.-]+\.\w+/.test(fs.readFileSync(t.filePath, 'utf-8'));
  const withMedia = pages.find(hasMedia);
  const without = pages.find(t => !hasMedia(t));
  if (!withMedia || !without) throw new Error('catalog lacks a page with and without demo media');
  return {withMedia: withMedia.dirName, without: without.dirName};
}

describe('template copy receipt discloses replaced demo media', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-receipt-cli-'));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('--json carries demoMediaReplaced and the text states the same count', async () => {
    const {withMedia} = await pickPages();
    const json = await runCli(['template', withMedia, './a', '--json'], dir);
    expect(json.status).toBe(0);
    const {data} = JSON.parse(json.stdout);
    expect(data.demoMediaReplaced).toBeGreaterThan(0);

    const human = await runCli(['template', withMedia, './b'], dir);
    expect(human.status).toBe(0);
    expect(human.stdout).toContain(
      `Replaced ${data.demoMediaReplaced} Astryx demo media reference`,
    );
    expect(human.stdout).toContain('b/page.tsx');
  }, SLOW);

  it('says nothing about media when none was replaced', async () => {
    const {without} = await pickPages();
    const json = await runCli(['template', without, './a', '--json'], dir);
    expect(JSON.parse(json.stdout).data.demoMediaReplaced).toBe(0);
    const human = await runCli(['template', without, './b'], dir);
    expect(human.status).toBe(0);
    expect(human.stdout).not.toMatch(/demo media/i);
  }, SLOW);
});
