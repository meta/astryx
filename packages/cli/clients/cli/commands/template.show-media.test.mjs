// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx template <name>` says how many demo media references it
 * replaced: in `--json` as `demoMediaReplaced`, and in text on stderr, so that
 * stdout stays exactly the source a copy writes and can be piped into a file.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
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

describe('template show discloses replaced demo media', () => {
  /** @type {string} */
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-show-cli-'));
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('--json carries demoMediaReplaced, and text states it on stderr with stdout left as the source', async () => {
    const {withMedia} = await pickPages();
    const json = await runCli(['template', withMedia, '--type', 'page', '--json'], dir);
    expect(json.status).toBe(0);
    const {data} = JSON.parse(json.stdout);
    expect(data.demoMediaReplaced).toBeGreaterThan(0);

    const human = await runCli(['template', withMedia, '--type', 'page'], dir);
    expect(human.status).toBe(0);
    expect(human.stdout.trimEnd()).toBe(data.source.trimEnd());
    expect(human.stderr).toContain(
      `Replaced ${data.demoMediaReplaced} Astryx demo media reference`,
    );
  }, SLOW);

  it('says nothing about media when none was replaced', async () => {
    const {without} = await pickPages();
    const json = await runCli(['template', without, '--type', 'page', '--json'], dir);
    expect(JSON.parse(json.stdout).data.demoMediaReplaced).toBe(0);
    const human = await runCli(['template', without, '--type', 'page'], dir);
    expect(human.status).toBe(0);
    expect(human.stderr).not.toMatch(/demo media/i);
  }, SLOW);
});
