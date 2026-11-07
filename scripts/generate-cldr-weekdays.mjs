// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Generates the weekday header names that Calendar and the DateInput bottom
 * sheet show, one row of seven names per locale.
 *
 * A locale gets its CLDR stand-alone abbreviated names when every one of the
 * seven is at most four user-perceived characters, and its stand-alone short
 * names otherwise. Longer names do not fit the day column. One width is chosen
 * per locale, so a header row never mixes the two.
 *
 * The runtime package consumes only the checked-in TypeScript output. Raw CLDR
 * data stays in root development dependencies and is read only by this script.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {format, resolveConfig} from 'prettier';

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'packages', 'core', 'locales');
const OUTPUT_FILE = path.join(
  REPO_ROOT,
  'packages',
  'core',
  'src',
  'Calendar',
  'weekdayHeaderNames.generated.ts',
);
const CLDR_DATES_ROOT = path.dirname(
  require.resolve('cldr-dates-full/package.json'),
);
const CLDR_CORE_ROOT = path.dirname(require.resolve('cldr-core/package.json'));
const CLDR_MAIN_DIR = path.join(CLDR_DATES_ROOT, 'main');
const CLDR_DATES_PACKAGE = readJson(path.join(CLDR_DATES_ROOT, 'package.json'));
const CLDR_CORE_PACKAGE = readJson(path.join(CLDR_CORE_ROOT, 'package.json'));
const PARENT_LOCALES = readJson(
  path.join(CLDR_CORE_ROOT, 'supplemental', 'parentLocales.json'),
).supplemental.parentLocales.parentLocale;
const LIKELY_SUBTAGS = readJson(
  path.join(CLDR_CORE_ROOT, 'supplemental', 'likelySubtags.json'),
).supplemental.likelySubtags;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const MAX_ABBREVIATED_LENGTH = 4;
const graphemes = new Intl.Segmenter('en', {granularity: 'grapheme'});
const EXCLUDED_LOCALE_FILES = new Set(['en.json', 'pseudo.json']);

if (CLDR_DATES_PACKAGE.version !== CLDR_CORE_PACKAGE.version) {
  throw new Error(
    `CLDR package version mismatch: cldr-dates-full=${CLDR_DATES_PACKAGE.version}, cldr-core=${CLDR_CORE_PACKAGE.version}`,
  );
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Return canonical shipped locale tags, with English added explicitly. */
export function getShippedLocales() {
  const locales = fs
    .readdirSync(LOCALES_DIR, {withFileTypes: true})
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        !EXCLUDED_LOCALE_FILES.has(entry.name),
    )
    .map(entry => entry.name.slice(0, -'.json'.length));

  locales.push('en');
  return locales
    .map(locale => {
      try {
        return new Intl.Locale(locale).baseName;
      } catch (error) {
        throw new Error(
          `Invalid locale filename ${locale}.json: ${error.message}`,
        );
      }
    })
    .sort(compareStrings);
}

function findLikelySubtag(parsed) {
  const candidates = [
    parsed.baseName,
    parsed.region && `${parsed.language}-${parsed.region}`,
    parsed.script && `${parsed.language}-${parsed.script}`,
    parsed.language,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (LIKELY_SUBTAGS[candidate]) {
      return LIKELY_SUBTAGS[candidate];
    }
  }
  return null;
}

/** Resolve a supported tag to a concrete locale payload in cldr-dates-full. */
export function resolveCldrSourceLocale(locale, availableLocales) {
  if (availableLocales.has(locale)) {
    return locale;
  }

  const visited = new Set([locale]);
  let parent = PARENT_LOCALES[locale];
  while (parent && parent !== 'root' && parent !== 'und') {
    if (visited.has(parent)) {
      throw new Error(`CLDR parent-locale cycle while resolving ${locale}`);
    }
    if (availableLocales.has(parent)) {
      return parent;
    }
    visited.add(parent);
    parent = PARENT_LOCALES[parent];
  }

  const parsed = new Intl.Locale(locale);
  const likelySubtag = findLikelySubtag(parsed);
  if (likelySubtag) {
    const likely = new Intl.Locale(likelySubtag);
    if (likely.script) {
      const languageScript = `${parsed.language}-${likely.script}`;
      if (availableLocales.has(languageScript)) {
        return languageScript;
      }
    }
  }

  if (availableLocales.has(parsed.language)) {
    return parsed.language;
  }

  throw new Error(
    `cldr-dates-full ${CLDR_DATES_PACKAGE.version} has no usable Gregorian locale data for ${locale}`,
  );
}

/**
 * Select the smallest useful CLDR locale set for shipped catalogs.
 *
 * Intl.Locale canonicalizes BCP-47 aliases. CLDR's explicit parents and likely
 * scripts live in cldr-core supplemental data, so the generator uses those to
 * resolve concrete cldr-dates-full payloads (notably zh-TW -> zh-Hant). Every
 * shipped locale contributes its language fallback; an exact entry is emitted
 * only when CLDR publishes it or its resolved values differ from the language.
 * Runtime lookup mirrors this as exact locale -> language -> English.
 */
export function getGeneratedLocaleSources() {
  const availableLocales = new Set(fs.readdirSync(CLDR_MAIN_DIR));
  const sources = new Map();

  for (const locale of getShippedLocales()) {
    const parsed = new Intl.Locale(locale);
    const languageSource = resolveCldrSourceLocale(
      parsed.language,
      availableLocales,
    );
    const exactSource = resolveCldrSourceLocale(locale, availableLocales);

    sources.set(parsed.language, languageSource);
    if (
      availableLocales.has(parsed.baseName) ||
      JSON.stringify(selectWeekdayHeaderNames(exactSource)) !==
        JSON.stringify(selectWeekdayHeaderNames(languageSource))
    ) {
      sources.set(parsed.baseName, exactSource);
    }
  }

  if (!sources.has('en')) {
    throw new Error('The generated locale set must include English');
  }

  return Object.fromEntries(
    [...sources].sort(([left], [right]) => compareStrings(left, right)),
  );
}

export function getGeneratedLocales() {
  return Object.keys(getGeneratedLocaleSources());
}

/**
 * Read one CLDR locale's Gregorian stand-alone weekdays in one width
 * (`short` or `abbreviated`), Sunday first.
 */
export function readStandaloneWeekdays(locale, width) {
  const file = path.join(CLDR_MAIN_DIR, locale, 'ca-gregorian.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing Gregorian CLDR data for ${locale}: ${path.relative(REPO_ROOT, file)}`,
    );
  }

  const document = readJson(file);
  const localeData = document.main?.[locale];
  const days =
    localeData?.dates?.calendars?.gregorian?.days?.['stand-alone']?.[width];

  if (!days || typeof days !== 'object') {
    throw new Error(
      `Missing dates.calendars.gregorian.days["stand-alone"].${width} for ${locale} in ${path.relative(REPO_ROOT, file)}`,
    );
  }

  return DAY_KEYS.map(day => {
    const value = days[day];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `Missing stand-alone-${width} value for ${locale}.${day} in ${path.relative(REPO_ROOT, file)}`,
      );
    }
    return value;
  });
}

export function graphemeLength(text) {
  return [...graphemes.segment(text)].length;
}

/** Pick the header width for one CLDR locale: abbreviated when all seven fit. */
export function selectWeekdayHeaderNames(locale) {
  const abbreviated = readStandaloneWeekdays(locale, 'abbreviated');
  return abbreviated.every(name => graphemeLength(name) <= MAX_ABBREVIATED_LENGTH)
    ? abbreviated
    : readStandaloneWeekdays(locale, 'short');
}

export function generateWeekdayData() {
  return Object.fromEntries(
    Object.entries(getGeneratedLocaleSources()).map(([locale, source]) => [
      locale,
      selectWeekdayHeaderNames(source),
    ]),
  );
}

export async function renderGeneratedFile() {
  const data = generateWeekdayData();
  const source = `// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n/**\n * @generated by scripts/generate-cldr-weekdays.mjs from Unicode CLDR ${CLDR_DATES_PACKAGE.version}.\n * Do not edit by hand. Run \`pnpm generate:cldr-weekdays\` instead.\n */\n\nexport type WeekdayHeaderNames = readonly [\n  string,\n  string,\n  string,\n  string,\n  string,\n  string,\n  string,\n];\n\nexport const weekdayHeaderNamesByLocale = ${JSON.stringify(data)} as const satisfies Readonly<\n  Record<string, WeekdayHeaderNames>\n>;\n`;

  const prettierConfig = await resolveConfig(OUTPUT_FILE);
  return format(source, {...prettierConfig, filepath: OUTPUT_FILE});
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const expected = await renderGeneratedFile();
  const localeCount = Object.keys(generateWeekdayData()).length;

  if (check) {
    const actual = fs.existsSync(OUTPUT_FILE)
      ? fs.readFileSync(OUTPUT_FILE, 'utf8')
      : '';
    if (actual !== expected) {
      console.error(
        '✗ Calendar CLDR weekday data is stale. Run `pnpm generate:cldr-weekdays` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `✓ Calendar CLDR weekday data matches ${localeCount} generated locale entries`,
    );
    return;
  }

  fs.writeFileSync(OUTPUT_FILE, expected);
  console.log(
    `Generated ${path.relative(REPO_ROOT, OUTPUT_FILE)} with ${localeCount} locale entries`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
