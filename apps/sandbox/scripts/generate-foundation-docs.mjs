#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Pre-generate resolved foundation docs as a JSON file for the sandbox.
 *
 * The CLI docs API uses dynamic imports and filesystem operations that
 * can't run in a browser bundle. This script resolves
 * token-refs at build time and writes a static JSON file.
 *
 * Run: node apps/sandbox/scripts/generate-foundation-docs.mjs
 */

import {writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {docs as docsApi} from '../../../packages/cli/api/docs/docs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../src/generated/foundationDocs.json');

const TOPICS = [
  'color',
  'spacing',
  'typography',
  'elevation',
  'shape',
  'motion',
];

/**
 * A topic split into a docs-tree namespace, read whole: its title and summary,
 * and every guide's sections below it in tree order, as
 * `astryx docs <topic> --depth all --detail full` returns them. The same shape
 * as the flat topic's read, so the preview keeps rendering it.
 * @param {string} topic
 */
async function namespaceTopic(topic) {
  const res = await docsApi(topic, undefined, {depth: 'all', detail: 'full'});
  const sections = [];
  const walk = slots => {
    for (const slot of slots ?? []) {
      for (const child of slot.children) {
        if (child.kind === 'generic') sections.push(...(child.sections ?? []));
        else walk(child.slots);
      }
    }
  };
  walk(res.data.slots);
  return {
    name: topic,
    title: res.data.title,
    description: res.data.summary,
    sections,
  };
}

async function main() {
  const result = {};
  for (const topic of TOPICS) {
    const res = await docsApi(topic);
    if (res.type === 'docs.detail') {
      result[topic] = res.data;
    } else if (res.type === 'docs.node' && res.data.kind === 'namespace') {
      result[topic] = await namespaceTopic(topic);
    } else {
      throw new Error(`astryx docs ${topic} returned ${res.type}, not a topic.`);
    }
  }
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  const kb = (Buffer.byteLength(JSON.stringify(result)) / 1024).toFixed(1);
  console.log(`✓ Generated ${OUTPUT} (${TOPICS.length} topics, ${kb} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
