// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The locale and time zone this process's Intl uses by default, as a
 *   run's debug record names them, kept between runs while nothing they come
 *   from has changed.
 * @input The environment values, Node's versions and the files the ICU
 *   library reads to choose them.
 * @output `intlDefaults()`: `{locale, timezone}`, each a string or null;
 *   `intlKey()`, what a kept answer is filed under.
 * @position The CLI hands it to the debug recorder (clients/cli/index.mjs),
 *   whose environment snapshot (debug/event.mjs captureEnv) asks it once a
 *   run, only when a handler takes the record. A process's first Intl call
 *   loads ICU's data, which costs more than the rest of a short run's
 *   snapshot, so on Linux the answer is kept beside the kept gathers
 *   (fs/gather-cache.mjs persistedSummary) while every input ICU reads for it
 *   is unchanged.
 */

import * as fs from 'node:fs';
import {persistedSummary} from '../fs/gather-cache.mjs';
import {fileStamp, resolvedNow, withoutRecording} from '../fs/read-record.mjs';
import {intlNow} from './intl-now.mjs';

/** The link ICU reads the host's time zone from, where TZ names none. */
const LOCALTIME = '/etc/localtime';

/** The file some systems also name the time zone in. */
const TIMEZONE_FILE = '/etc/timezone';

/**
 * The environment values ICU reads for the default locale and time zone, and
 * for where its data and the zone files are.
 */
const ENV_NAMES = [
  'TZ',
  'TZDIR',
  'LC_ALL',
  'LC_MESSAGES',
  'LC_CTYPE',
  'LANG',
  'LANGUAGE',
  'NODE_ICU_DATA',
];

/** A time zone name as TZ can hold one: no path, no POSIX rule. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u;

/**
 * The host's values and files, which tests replace.
 * @typedef {{platform?: string, arch?: string, env?: Record<string, string | undefined>, versions?: Record<string, string | undefined>, execArgv?: string[], localtime?: string, timezoneFile?: string}} IntlHost
 */

/**
 * The options among `args` that name ICU, each with its value: the part after
 * `=`, or the next argument when the option holds no `=`.
 * @param {string[]} args
 * @returns {string[]}
 */
function icuOptions(args) {
  /** @type {string[]} */
  const options = [];
  for (const [at, arg] of args.entries()) {
    if (!arg.includes('icu')) continue;
    options.push(arg);
    const next = args[at + 1];
    if (!arg.includes('=') && next !== undefined && !next.startsWith('-')) {
      options.push(next);
    }
  }
  return options;
}

/**
 * What a kept answer depends on besides the files it is stamped by, or null
 * where none is kept: off Linux, where ICU reads system settings; with a TZ
 * that is a path or a POSIX rule; and where the localtime file is not a link
 * into a zoneinfo folder, as ICU then searches the zone files for one that
 * matches. ICU reads that link even with a TZ set, when the TZ is not a zone
 * it knows, and names the zone after the link's own text, so the text is
 * part of the key: two names can link to one zone file.
 * @param {IntlHost} [host]
 * @returns {unknown[] | null}
 */
export function intlKey({
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  versions = process.versions,
  execArgv = process.execArgv,
  localtime = LOCALTIME,
  timezoneFile = TIMEZONE_FILE,
} = {}) {
  if (platform !== 'linux') return null;
  const tz = env.TZ;
  if (tz !== undefined && !ZONE_NAME.test(tz)) return null;
  let link;
  try {
    link = withoutRecording(() => fs.readlinkSync(localtime));
  } catch {
    return null;
  }
  if (!link.includes('/zoneinfo/')) return null;
  const icuFlags = icuOptions([
    ...execArgv,
    ...(env.NODE_OPTIONS ?? '').split(/\s+/u),
  ]);
  return [
    platform,
    arch,
    versions.node ?? null,
    versions.icu ?? null,
    versions.tz ?? null,
    versions.cldr ?? null,
    versions.unicode ?? null,
    ENV_NAMES.map(name => env[name] ?? null),
    icuFlags,
    localtime,
    link,
    timezoneFile,
  ];
}

/**
 * The locale and time zone Intl gives this process by default. On Linux, the
 * answer a run kept while the key's values, where the localtime link points,
 * the zone file it reaches and the timezone file are all as they were; else
 * Intl's answer now, kept for the next run unless either part is missing.
 * @param {IntlHost} [host]
 * @returns {{locale: string | null, timezone: string | null}}
 */
export function intlDefaults(host = {}) {
  const key = intlKey(host);
  if (key == null) return intlNow();
  const localtime = host.localtime ?? LOCALTIME;
  const timezoneFile = host.timezoneFile ?? TIMEZONE_FILE;
  return persistedSummary(
    ['intl-defaults', ...key],
    () => {
      /** @type {[string, string][]} */
      const stamps = [
        [localtime, resolvedNow(localtime)],
        [localtime, fileStamp(localtime)],
        [timezoneFile, fileStamp(timezoneFile)],
      ];
      return {value: intlNow(), stamps};
    },
    {keep: value => value.locale != null && value.timezone != null},
  );
}
