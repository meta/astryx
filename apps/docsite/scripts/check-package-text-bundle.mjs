#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fails the build when a browser script holds a package's README or
 * changelog text.
 *
 * The text is megabytes. Server routes render it, and no page's scripts need
 * it. A client module that imports it adds it to each page that loads the
 * module's chunk, and nothing reports that. After `next build`, a script
 * under `.next/static/chunks` that holds most of the sampled lines of a text
 * fails this check.
 */

import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLES_PER_TEXT = 10;
// A shorter line is often a heading or a phrase that other pages also use.
const MIN_LINE_LENGTH = 40;
// A minifier keeps these characters of a string as they are. It can escape a
// quote, a backslash or a dollar sign, and a character outside ASCII.
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/u;
const ESCAPABLE_CHARACTER = /["'`\\$]/u;

/**
 * Lines of a text that a script holds unchanged when it holds the text,
 * spread over the whole text.
 * @param {string} text
 * @returns {string[]}
 */
export function sampleLines(text) {
  const lines = [
    ...new Set(
      text
        .split('\n')
        .map(line => line.trim())
        .filter(
          line =>
            line.length >= MIN_LINE_LENGTH &&
            PRINTABLE_ASCII.test(line) &&
            !ESCAPABLE_CHARACTER.test(line),
        ),
    ),
  ];
  if (lines.length <= SAMPLES_PER_TEXT) return lines;
  const step = lines.length / SAMPLES_PER_TEXT;
  return Array.from(
    {length: SAMPLES_PER_TEXT},
    (_, index) => lines[Math.floor(index * step)],
  );
}

/**
 * The README and the changelog of each package, with the sampled lines.
 * @param {{name: string, readme: string | null, changelog: string | null}[]} packageText
 * @returns {{label: string, samples: string[]}[]}
 */
export function sampledTexts(packageText) {
  return packageText.flatMap(({name, readme, changelog}) =>
    [
      {label: `${name} README`, text: readme},
      {label: `${name} changelog`, text: changelog},
    ].flatMap(({label, text}) => {
      const samples = text == null ? [] : sampleLines(text);
      // One line cannot tell a text from a page that quotes it.
      return samples.length > 1 ? [{label, samples}] : [];
    }),
  );
}

/**
 * Each text that a script holds, as one line of a report.
 * @param {{label: string, samples: string[]}[]} texts
 * @param {{path: string, source: string}[]} scripts
 * @returns {string[]}
 */
export function textsInScripts(texts, scripts) {
  return scripts.flatMap(({path, source}) =>
    texts.flatMap(({label, samples}) => {
      const held = samples.filter(sample => source.includes(sample)).length;
      // A page can share a sentence with a README. More than half of the
      // sampled lines in one script is the text itself.
      return held > samples.length / 2
        ? [`${label} (${held} of ${samples.length} sampled lines) in ${path}`]
        : [];
    }),
  );
}

/**
 * Checks the scripts of one build. Throws when a script holds a text, and
 * when there is no script or no text to check.
 * @param {{chunksRoot: string, textPath: string}} build
 * @returns {string} the result, for the build log
 */
export function checkPackageTextBundle({chunksRoot, textPath}) {
  if (!existsSync(chunksRoot)) {
    throw new Error(`${chunksRoot} is missing: run next build first.`);
  }
  const scripts = readdirSync(chunksRoot, {recursive: true, encoding: 'utf8'})
    .filter(file => file.endsWith('.js'))
    .map(path => ({
      path,
      source: readFileSync(join(chunksRoot, path), 'utf8'),
    }));
  if (scripts.length === 0) {
    throw new Error(`No browser script found under ${chunksRoot}`);
  }
  const texts = sampledTexts(JSON.parse(readFileSync(textPath, 'utf8')));
  if (texts.length === 0) {
    throw new Error(`No README or changelog text to check in ${textPath}`);
  }
  const found = textsInScripts(texts, scripts);
  if (found.length > 0) {
    throw new Error(
      `A browser script holds package README or changelog text. Only server modules may import src/lib/packageText.ts:\n${found
        .map(line => `- ${line}`)
        .join('\n')}`,
    );
  }
  return `Package text bundle check passed: ${scripts.length} browser scripts hold none of ${texts.length} README and changelog texts`;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(
    checkPackageTextBundle({
      chunksRoot: join(appRoot, '.next', 'static', 'chunks'),
      textPath: join(appRoot, 'src', 'generated', 'packageText.json'),
    }),
  );
}
