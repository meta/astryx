// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Regenerates `src/EmojiPicker/emojiData.ts`, the emoji EmojiPicker lists by
 * default, from the English dataset of emojibase-data (MIT; built from Unicode
 * CLDR), a development dependency of this package:
 *
 *   pnpm -F @astryxdesign/lab generate:emoji-data
 *
 * Emoji newer than MAX_EMOJI_VERSION are left out: many systems still draw
 * them as empty boxes. Skin-tone variants and the component group (skin tones,
 * hair styles) are left out too; each emoji appears once, in its CLDR group,
 * in CLDR order.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {format, resolveConfig} from 'prettier';

const require = createRequire(import.meta.url);
const PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const OUTPUT_FILE = path.join(
  PACKAGE_DIR,
  'src',
  'EmojiPicker',
  'emojiData.ts',
);
const DATA_ROOT = path.dirname(require.resolve('emojibase-data/package.json'));

const MAX_EMOJI_VERSION = 15;

/** CLDR's group names, in sentence case; group 2 is the component group. */
const GROUP_NAMES = new Map([
  [0, 'Smileys & emotion'],
  [1, 'People & body'],
  [3, 'Animals & nature'],
  [4, 'Food & drink'],
  [5, 'Travel & places'],
  [6, 'Activities'],
  [7, 'Objects'],
  [8, 'Symbols'],
  [9, 'Flags'],
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const sentenceCase = text => text.charAt(0).toUpperCase() + text.slice(1);

const dataPackage = readJson(path.join(DATA_ROOT, 'package.json'));
const data = readJson(path.join(DATA_ROOT, 'en', 'data.json'));

const groups = new Map([...GROUP_NAMES.keys()].map(group => [group, []]));
for (const emoji of [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
  const members = groups.get(emoji.group);
  if (members == null || (emoji.version ?? 0) > MAX_EMOJI_VERSION) {
    continue;
  }
  const name = sentenceCase(emoji.label);
  const nameWords = new Set(name.toLowerCase().split(/[\s:,]+/));
  const keywords = (emoji.tags ?? []).filter(tag => !nameWords.has(tag));
  members.push([emoji.emoji, name, keywords.join(' ')]);
}

const quote = value => JSON.stringify(value);
const body = [...groups]
  .map(
    ([group, emojis]) =>
      `{name: ${quote(GROUP_NAMES.get(group))}, emojis: [${emojis
        .map(
          ([emoji, name, keywords]) =>
            `[${quote(emoji)}, ${quote(name)}, ${quote(keywords)}]`,
        )
        .join(',\n')}]}`,
  )
  .join(',\n');

const source = `// Copyright (c) Meta Platforms, Inc. and affiliates.
// @${'generated'} by packages/lab/scripts/generate-emoji-data.mjs from
// emojibase-data ${dataPackage.version} (MIT, built from Unicode CLDR). Do not edit by hand.

/** One emoji: the character, its CLDR name, and its other CLDR keywords. */
export type EmojiDatum = readonly [emoji: string, name: string, keywords: string];

/** A CLDR emoji group, in CLDR order. */
export interface EmojiDatumGroup {
  readonly name: string;
  readonly emojis: readonly EmojiDatum[];
}

export const EMOJI_GROUPS: readonly EmojiDatumGroup[] = [
${body}
];
`;

const config = (await resolveConfig(OUTPUT_FILE)) ?? {};
const formatted = await format(source, {...config, filepath: OUTPUT_FILE});
fs.writeFileSync(OUTPUT_FILE, formatted);
const count = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
console.log(
  `Wrote ${count} emoji in ${groups.size} groups to ${path.relative(PACKAGE_DIR, OUTPUT_FILE)}`,
);
