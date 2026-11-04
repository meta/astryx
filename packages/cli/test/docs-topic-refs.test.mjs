// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every `astryx docs <topic>` that the changesets, the READMEs, and the
 * computer-level agent skill name resolves to a real docs topic, so a release
 * note or the skill never points a reader at a page that does not exist.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {docs} from '../api/docs/docs.mjs';
import {renderComputerAgentText} from '../foundation/agent-docs/computer-agent-text.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(CLI, '..', '..');

/** Each topic `astryx docs <topic>` names in `text`, placeholders left out. */
function topicsIn(/** @type {string} */ text) {
  return [...text.matchAll(/astryx docs ([a-z][\w/-]*)/gu)]
    .map(match => match[1].replace(/\/+$/u, ''))
    .filter(topic => topic.length > 0);
}

const sources = [
  ...fs
    .readdirSync(path.join(REPO, '.changeset'))
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(REPO, '.changeset', name)),
  path.join(REPO, 'README.md'),
  path.join(CLI, 'README.md'),
].map(file => ({
  name: path.relative(REPO, file),
  text: fs.readFileSync(file, 'utf8'),
}));
sources.push({
  name: 'the computer-level agent skill',
  text: renderComputerAgentText({command: 'astryx'}),
});

describe('docs topics named in release notes, READMEs, and the skill', () => {
  it('each resolves to a real topic', async () => {
    /** @type {string[]} */
    const missing = [];
    let checked = 0;
    for (const {name, text} of sources) {
      for (const topic of new Set(topicsIn(text))) {
        checked++;
        try {
          await docs(topic, undefined, {cwd: REPO});
        } catch (error) {
          missing.push(
            `${name}: astryx docs ${topic} (${/** @type {any} */ (error).code ?? error})`,
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  }, 60_000);
});
