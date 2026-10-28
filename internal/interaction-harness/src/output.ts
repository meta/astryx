// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file output.ts
 * @input Uses node:fs, node:path and the Playwright `TestInfo`
 * @output `evidenceDir` / `writeEvidence` — where storyboards and curve traces
 *   go, and the one way they are written and attached to the test report.
 * @position Every artifact the harness produces lands under one gitignored
 *   directory, `test-results/interaction-evidence/` by default
 *   (`ASTRYX_INTERACTION_EVIDENCE` overrides it). Playwright wipes its own
 *   output directory per run; this one is separate, so a storyboard run never
 *   deletes another's evidence. Generated evidence is never committed: a pull
 *   request links or attaches it.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {TestInfo} from '@playwright/test';

export function evidenceDir(): string {
  return path.resolve(
    process.env.ASTRYX_INTERACTION_EVIDENCE ??
      'test-results/interaction-evidence',
  );
}

/** A filesystem-safe name: letters, digits, dot, dash and underscore. */
export function safeName(name: string): string {
  return (
    name
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'evidence'
  );
}

/**
 * Writes `files` (name → contents) under `<evidenceDir>/<group>/` and attaches
 * them to the test's report when a `TestInfo` is given. Returns the paths.
 */
export async function writeEvidence(
  group: string,
  files: Readonly<Record<string, string | Buffer>>,
  testInfo?: TestInfo,
): Promise<Record<string, string>> {
  // `group` may nest ("storyboards/<name>"): each segment is made safe on its own.
  const dir = path.join(evidenceDir(), ...group.split('/').map(safeName));
  fs.mkdirSync(dir, {recursive: true});
  const written: Record<string, string> = {};
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(dir, safeName(name));
    fs.writeFileSync(file, contents);
    written[name] = file;
    if (testInfo != null) {
      await testInfo.attach(`${group}/${safeName(name)}`, {
        path: file,
        contentType: name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.json')
            ? 'application/json'
            : 'text/plain',
      });
    }
  }
  return written;
}
