#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file collect-results.mjs
 *
 * Copies agent output from per-agent project directories into the
 * standard results/ path that the evaluation pipeline expects.
 *
 * Usage:
 *   node internal/vibe-tests/src/collect-results.mjs <iteration-id>
 *
 * Copies: results/<id>/projects/<pid>/<pid>.tsx → results/<id>/results/<pid>.tsx
 *         results/<id>/projects/<pid>/<pid>.json → results/<id>/results/<pid>.json
 *         results/<id>/projects/<pid>/<pid>.provenance.json
 *           → results/<id>/results/<pid>.provenance.json (when present)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '..', 'results');

export function collectResults(iterDir) {
  const projectsDir = path.join(iterDir, 'projects');
  const resultsDir = path.join(iterDir, 'results');

  if (!fs.existsSync(projectsDir)) {
    throw new Error(`No projects/ directory found at ${projectsDir}`);
  }

  fs.mkdirSync(resultsDir, {recursive: true});

  let copied = 0;
  let missing = 0;
  const projectIds = fs.readdirSync(projectsDir);

  for (const pid of projectIds) {
    const projectDir = path.join(projectsDir, pid);
    if (!fs.statSync(projectDir).isDirectory()) continue;

    for (const ext of ['.tsx', '.json']) {
      const src = path.join(projectDir, `${pid}${ext}`);
      const dest = path.join(resultsDir, `${pid}${ext}`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        copied++;
      } else {
        missing++;
        console.warn(`  ⚠ Missing: ${pid}${ext}`);
      }
    }

    const provenanceName = `${pid}.provenance.json`;
    const provenanceSrc = path.join(projectDir, provenanceName);
    if (fs.existsSync(provenanceSrc)) {
      fs.copyFileSync(provenanceSrc, path.join(resultsDir, provenanceName));
      copied++;
    }
  }

  return {copied, missing, projects: projectIds.length};
}

function main() {
  const iterationId = process.argv[2];
  if (!iterationId) {
    console.error('Usage: node collect-results.mjs <iteration-id>');
    process.exitCode = 1;
    return;
  }

  try {
    const summary = collectResults(path.join(RESULTS_DIR, iterationId));
    console.log(
      `✓ Collected ${summary.copied} files from ${summary.projects} projects${summary.missing ? ` (${summary.missing} missing)` : ''}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
