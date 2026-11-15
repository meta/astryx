// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file intl-defaults.test.mjs
 * @input A localtime link, a zone file and a timezone file in a temp folder,
 *   standing in for the host's, and an installed-looking CLI whose store keeps
 *   summaries
 * @output The kept answer equals Intl's, is read back while nothing it comes
 *   from has changed, and is asked again after any change to one of its
 *   inputs; where ICU reads more than the key covers, nothing is kept
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-intl-defaults-test-'),
    ),
  };
});

vi.mock('../fs/paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

/** @type {typeof import('./intl-defaults.mjs')} */
let intl;
const savedCache = process.env.XDG_CACHE_HOME;
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');
const ZONES = path.join(TEMP_ROOT, 'zoneinfo');
const LOCALTIME = path.join(TEMP_ROOT, 'etc', 'localtime');
const TIMEZONE_FILE = path.join(TEMP_ROOT, 'etc', 'timezone');

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** What Intl gives this process. */
const live = () => {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {locale: resolved.locale, timezone: resolved.timeZone};
};

/** A Linux host with no TZ and the temp files. */
const host = (/** @type {Record<string, string>} */ env = {}) => ({
  platform: 'linux',
  env,
  localtime: LOCALTIME,
  timezoneFile: TIMEZONE_FILE,
});

/** The kept answer's entry file and inode, or null. */
const kept = () => {
  for (const name of fs.readdirSync(STORE)) {
    const file = path.join(STORE, name);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (stored.summary && String(stored.key).includes('intl-defaults')) {
      return {ino: fs.statSync(file).ino, value: stored.value};
    }
  }
  return null;
};

/** @param {string} zone */
const zoneFile = zone => {
  const file = path.join(ZONES, zone);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `TZif ${zone}\n`);
  return file;
};

/** @param {string} target */
const pointLocaltime = target => {
  fs.rmSync(LOCALTIME, {force: true});
  fs.symlinkSync(target, LOCALTIME);
};

beforeAll(async () => {
  const cli = path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli');
  fs.mkdirSync(path.join(cli, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(cli, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'intl-defaults-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  fs.mkdirSync(path.dirname(LOCALTIME), {recursive: true});
  intl = await import('./intl-defaults.mjs');
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

describe('intlDefaults', () => {
  it('keeps what Intl gives, reads it back, and asks again after any change to a file it comes from', async () => {
    pointLocaltime(zoneFile('America/Los_Angeles'));
    // A second name for one zone file, as zone links are on many systems:
    // made now, so the file's own stamp is settled before the link moves.
    fs.mkdirSync(path.join(ZONES, 'US'), {recursive: true});
    fs.linkSync(zoneFile('America/New_York'), path.join(ZONES, 'US/Eastern'));
    await sleep(SETTLE_WAIT_MS);
    expect(intl.intlDefaults(host())).toEqual(live());
    const first = kept();
    expect(first?.value).toEqual(live());
    // Read back: the entry is not written again.
    expect(intl.intlDefaults(host())).toEqual(live());
    expect(kept()?.ino).toBe(first?.ino);

    /** @type {Array<[string, () => void]>} */
    const changes = [
      [
        'the link pointed at another zone',
        () => pointLocaltime(path.join(ZONES, 'America/New_York')),
      ],
      [
        'the link pointed at another name for the same zone file',
        () => pointLocaltime(path.join(ZONES, 'US/Eastern')),
      ],
      [
        'the zone file it reaches rewritten',
        () => {
          const file = path.join(ZONES, 'America/New_York');
          fs.writeFileSync(`${file}.new`, 'TZif changed\n');
          fs.renameSync(`${file}.new`, file);
        },
      ],
      [
        'a timezone file made',
        () => fs.writeFileSync(TIMEZONE_FILE, 'America/New_York\n'),
      ],
      [
        'the timezone file edited',
        () => fs.writeFileSync(TIMEZONE_FILE, 'Europe/Paris\n'),
      ],
    ];
    let previous = first?.ino;
    for (const [what, change] of changes) {
      change();
      await sleep(SETTLE_WAIT_MS);
      expect(intl.intlDefaults(host())).toEqual(live());
      const now = kept();
      expect({what, asked: now?.ino !== previous}).toEqual({what, asked: true});
      previous = now?.ino;
    }
  }, 60_000);

  it('files an answer under each environment value, Node and ICU version, and ICU flag it may depend on', () => {
    pointLocaltime(path.join(ZONES, 'America/Los_Angeles'));
    const base = intl.intlKey(host());
    expect(base).not.toBeNull();
    for (const name of [
      'TZ',
      'TZDIR',
      'LC_ALL',
      'LC_MESSAGES',
      'LC_CTYPE',
      'LANG',
      'LANGUAGE',
      'NODE_ICU_DATA',
    ]) {
      const value = name === 'TZ' ? 'Europe/Paris' : 'x';
      expect({name, same: intl.intlKey(host({[name]: value}))}).not.toEqual({
        name,
        same: base,
      });
    }
    for (const version of ['node', 'icu', 'tz', 'cldr', 'unicode']) {
      expect(
        intl.intlKey({
          ...host(),
          versions: {...process.versions, [version]: 'other'},
        }),
      ).not.toEqual(base);
    }
    expect(
      intl.intlKey({...host(), execArgv: ['--icu-data-dir=/elsewhere']}),
    ).not.toEqual(base);
    expect(
      intl.intlKey(host({NODE_OPTIONS: '--icu-data-dir=/elsewhere'})),
    ).not.toEqual(base);
    expect(intl.intlKey({...host(), arch: 'other'})).not.toEqual(base);
  });

  it('keeps nothing where ICU reads more than the key covers', () => {
    pointLocaltime(path.join(ZONES, 'America/Los_Angeles'));
    // Off Linux, ICU reads the system's settings.
    expect(intl.intlKey({...host(), platform: 'darwin'})).toBeNull();
    expect(intl.intlKey({...host(), platform: 'win32'})).toBeNull();
    // A TZ that is a path, a POSIX rule, or empty.
    for (const tz of [':/etc/localtime', 'EST5EDT,M3.2.0,M11.1.0', '']) {
      expect(intl.intlKey(host({TZ: tz}))).toBeNull();
    }
    // A localtime that is a copy, or a link outside a zoneinfo folder:
    // ICU then searches the zone files.
    fs.rmSync(LOCALTIME);
    fs.writeFileSync(LOCALTIME, 'TZif copy\n');
    expect(intl.intlKey(host())).toBeNull();
    pointLocaltime(path.join(TEMP_ROOT, 'elsewhere'));
    expect(intl.intlKey(host())).toBeNull();
    // Each still answers as Intl does.
    expect(intl.intlDefaults(host())).toEqual(live());
    expect(intl.intlDefaults({...host(), platform: 'darwin'})).toEqual(live());
  });
});
