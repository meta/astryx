// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the template.show leaf — the source it returns is
 * the source template.copy writes. An agent that prints a template and pastes
 * it must end up with the same file as one that scaffolds it, demo media
 * included (spec:AST-028 FR7).
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {discoverAll, template} from '../template.mjs';
import {templateCopy} from '../copy/copy.mjs';
import {templateShow} from './show.mjs';

const SLOW = 60_000;
/** Astryx's demo-media namespace: only its own previews serve these files. */
const FIXTURE = '/template-assets/';
const FIXTURE_IMAGE = /\/template-assets\/[^'"`\s]+\.(png|jpe?g|webp)/i;

const read = (/** @type {string} */ file) => fs.readFileSync(file, 'utf-8');

describe('template.show', () => {
  /** @type {string} */
  let dir;
  /** @type {Awaited<ReturnType<typeof discoverAll>>} */
  let templates;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-show-'));
    templates = await discoverAll(dir);
  }, SLOW);
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('returns exactly the source copy writes, for every template', () => {
    let withFixtures = 0;
    templates.forEach((match, index) => {
      if (read(match.filePath).includes(FIXTURE)) withFixtures += 1;
      const shown = templateShow(match).data.source;
      const copied = templateCopy(match, {targetPath: `out-${index}`, cwd: dir});
      const written = read(
        path.join(dir, copied.data.outputDir, copied.data.fileName),
      );
      expect(shown, match.dirName).toBe(written);
    });
    // The templates with demo media are the ones that used to differ.
    expect(withFixtures).toBeGreaterThan(0);
  }, SLOW);

  it('reports a replaced count when the source changed, and 0 when it did not', () => {
    let reported = 0;
    for (const match of templates) {
      const raw = read(match.filePath);
      const {source, demoMediaReplaced, demoContentReplaced} = templateShow(match).data;
      const replaced = demoMediaReplaced + demoContentReplaced;
      if (source === raw) expect(replaced, match.dirName).toBe(0);
      else expect(replaced, match.dirName).toBeGreaterThan(0);
      reported += replaced;
    }
    expect(reported).toBeGreaterThan(0);
  }, SLOW);

  it('prints a placeholder where a template shows a demo image', async () => {
    const match = templates.find(
      t => t.type === 'page' && FIXTURE_IMAGE.test(read(t.filePath)),
    );
    expect(match).toBeDefined();
    if (!match) return;
    const res = await template(match.dirName, {type: 'page', cwd: dir});
    expect(res.type).toBe('template.show');
    if (res.type !== 'template.show') return;
    expect(res.data.source).not.toContain(FIXTURE);
    expect(res.data.source).toContain('data:image/svg+xml,');
    expect(res.data.demoMediaReplaced).toBeGreaterThan(0);
  }, SLOW);
});
