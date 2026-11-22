// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme made with the theme editor, shared with its saved state and
 * added with `theme add`: the receiver keeps editing it, and the editor's
 * next build updates the app copy the add wrote.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeAdd} from './add.mjs';
import {themeRemove} from '../remove/remove.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
} from '../../theme-edit/theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../../test-utils/base-theme-fixture.mjs';

// The renders are stood in for: this test is about the files the add and
// the editor write, not the rendered pages.
vi.mock('../../theme-edit/_preview.mjs', async importOriginal =>
  (await import('../../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let maker;
/** @type {string} */
let receiver;
/** @type {string} */
let bundle;

beforeAll(() => {
  maker = makeLinkedFixture('astryx-theme-add-editor-maker-', FIXTURE_PACKAGES);
  receiver = makeLinkedFixture(
    'astryx-theme-add-editor-receiver-',
    FIXTURE_PACKAGES,
  );
  for (const app of [maker, receiver]) writeFixtureBaseTheme(app, 'neutral');
  bundle = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-editor-bundle-'));
}, 120_000);

afterAll(() => {
  removeLinkedFixture(maker);
  removeLinkedFixture(receiver);
  fs.rmSync(bundle, {recursive: true, force: true});
});

it('an editor set after the add updates the app copy the add wrote', async () => {
  await themeEditNew('sunset', {cwd: maker});
  // (The bundle a builder shares: the editor's folder and its app copy.)
  fs.cpSync(path.join(maker, 'themes/sunset'), path.join(bundle, 'editor'), {
    recursive: true,
  });
  fs.cpSync(
    path.join(maker, 'src/themes/sunset'),
    path.join(bundle, 'app-copy'),
    {recursive: true},
  );

  const added = await themeAdd(bundle, {cwd: receiver});
  expect(added.data.copy?.workingFiles?.files).toContain(
    'sunset.settings.json',
  );
  // (The app copy's descriptor is the editor's own, so the copy is current
  // right after the add: the editor's check finds nothing to rewrite.)
  expect(
    fs.readFileSync(
      path.join(receiver, 'src/themes/sunset/sunsetTheme.doc.mjs'),
      'utf8',
    ),
  ).toBe(
    fs.readFileSync(
      path.join(maker, 'src/themes/sunset/sunsetTheme.doc.mjs'),
      'utf8',
    ),
  );

  const before = fs.readFileSync(
    path.join(receiver, 'src/themes/sunset/sunset.css'),
    'utf8',
  );
  const set = await themeEditSet('sunset', 'corners', 'pill', {cwd: receiver});
  expect(/** @type {any} */ (set.data).appCopyStale).toBeUndefined();
  expect(
    fs.readFileSync(
      path.join(receiver, 'src/themes/sunset/sunset.css'),
      'utf8',
    ),
  ).not.toBe(before);
}, 300_000);

it('a remove after an editor change keeps the copy whole, and a re-add names the files to clear first', async () => {
  // (The previous test's editor change rewrote the receiver's settings and
  // copy: the re-add would undo it, so it stops.)
  const removed = await themeRemove('sunset', {cwd: receiver});
  expect(removed.data.undo?.kept).toEqual(
    expect.arrayContaining(['sunset.css']),
  );
  expect(removed.data.undo?.removed).toEqual([]);
  expect(
    fs.existsSync(path.join(receiver, 'src/themes/sunset/.astryx-shared.json')),
  ).toBe(true);
  await expect(themeAdd(bundle, {cwd: receiver})).rejects.toThrow(
    /sunset\.css.*changed since.*delete/s,
  );
}, 300_000);

it('a re-add replaces the copy files the editor rebuilt from unchanged working files, and stops at a hand change', async () => {
  const app = makeLinkedFixture(
    'astryx-theme-add-editor-rebuilt-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(app, 'neutral');
  // (A shared copy whose stylesheet differs from what this editor builds.)
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-rebuilt-'));
  fs.cpSync(bundle, shared, {recursive: true});
  const sharedCss = path.join(shared, 'app-copy/sunset.css');
  fs.appendFileSync(sharedCss, '/* shared */\n');
  await themeAdd(shared, {cwd: app});
  const css = path.join(app, 'src/themes/sunset/sunset.css');
  // (The editor builds again, settings unchanged: the copy is its build.)
  await themeEditShow('sunset', {cwd: app});
  expect(fs.readFileSync(css, 'utf8')).not.toMatch(/shared/);
  await themeRemove('sunset', {cwd: app});
  const again = await themeAdd(shared, {cwd: app});
  expect(again.data.default).toBe('sunset');
  expect(fs.readFileSync(css, 'utf8')).toBe(fs.readFileSync(sharedCss, 'utf8'));
  // (A hand change to a built file is never replaced.)
  await themeEditShow('sunset', {cwd: app});
  fs.appendFileSync(css, '/* mine */\n');
  await themeRemove('sunset', {cwd: app});
  await expect(themeAdd(shared, {cwd: app})).rejects.toThrow(/sunset\.css/);
  fs.rmSync(css);
  await themeAdd(shared, {cwd: app});
  // (Nor are built files from an edited theme source.)
  const source = path.join(app, 'themes/sunset/sunset.theme.ts');
  const own = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(source, `${own}// mine\n`);
  await themeEditShow('sunset', {cwd: app});
  await themeRemove('sunset', {cwd: app});
  await expect(themeAdd(shared, {cwd: app})).rejects.toThrow(/changed since/);
  fs.writeFileSync(source, own);
  fs.rmSync(css);
  await themeAdd(shared, {cwd: app});
  // (A hand change to the copy's descriptor is never replaced.)
  await themeEditShow('sunset', {cwd: app});
  const doc = path.join(app, 'src/themes/sunset/sunsetTheme.doc.mjs');
  fs.writeFileSync(
    doc,
    fs
      .readFileSync(doc, 'utf8')
      .replace(/displayName: [^,]+,/, "displayName: 'Mine',"),
  );
  await themeRemove('sunset', {cwd: app});
  await expect(themeAdd(shared, {cwd: app})).rejects.toThrow(
    /sunsetTheme\.doc\.mjs/,
  );
  removeLinkedFixture(app);
  fs.rmSync(shared, {recursive: true, force: true});
}, 300_000);

it('a re-add replaces nothing while a working file is gone, or the build is not the one made from the working files now', async () => {
  /** A fresh app with the shared theme added and rebuilt by the editor. */
  const setUp = async (
    /** @type {(shared: string) => void} */ more = () => {},
  ) => {
    const app = makeLinkedFixture(
      'astryx-theme-add-editor-gate-',
      FIXTURE_PACKAGES,
    );
    writeFixtureBaseTheme(app, 'neutral');
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gate-'));
    fs.cpSync(bundle, shared, {recursive: true});
    fs.appendFileSync(
      path.join(shared, 'app-copy/sunset.css'),
      '/* shared */\n',
    );
    more(shared);
    await themeAdd(shared, {cwd: app});
    return {app, shared};
  };
  const done = (/** @type {{app: string, shared: string}} */ x) => {
    removeLinkedFixture(x.app);
    fs.rmSync(x.shared, {recursive: true, force: true});
  };
  // (A deleted working file is a change.)
  const a = await setUp();
  await themeEditShow('sunset', {cwd: a.app});
  fs.rmSync(path.join(a.app, 'themes/sunset/sunset.settings.json'));
  await themeRemove('sunset', {cwd: a.app});
  await expect(themeAdd(a.shared, {cwd: a.app})).rejects.toThrow(
    /sunset\.css.*changed since/s,
  );
  done(a);
  // (Nor a deleted palette file the add copied, with no color dial set.)
  const p = await setUp(shared =>
    fs.writeFileSync(path.join(shared, 'editor/palette.config.json'), '{}\n'),
  );
  await themeEditShow('sunset', {cwd: p.app});
  fs.rmSync(path.join(p.app, 'themes/sunset/palette.config.json'));
  await themeRemove('sunset', {cwd: p.app});
  await expect(themeAdd(p.shared, {cwd: p.app})).rejects.toThrow(
    /changed since/,
  );
  done(p);
  // (Settings put back after an editor change, without a build: the copy
  // is the build of the other settings.)
  const b = await setUp();
  const settings = path.join(b.app, 'themes/sunset/sunset.settings.json');
  const saved = fs.readFileSync(settings, 'utf8');
  await themeEditSet('sunset', 'corners', 'pill', {cwd: b.app});
  fs.writeFileSync(settings, saved);
  await themeRemove('sunset', {cwd: b.app});
  await expect(themeAdd(b.shared, {cwd: b.app})).rejects.toThrow(
    /changed since/,
  );
  done(b);
}, 300_000);

it('the stable add names no experimental command when it keeps editor state', async () => {
  // (spec:AST-017 FR27: stable output names no experimental surface.)
  const fresh = makeLinkedFixture(
    'astryx-theme-add-editor-fresh-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(fresh, 'neutral');
  const {status, stdout, stderr} = await runCli(
    ['theme', 'add', bundle],
    fresh,
  );
  removeLinkedFixture(fresh);
  expect(status, stdout + stderr).toBe(0);
  expect(stdout).toMatch(/Kept the shared theme's working files/);
  expect(stdout).not.toMatch(/experimental/);
}, 300_000);

it('the stable add names no experimental surface when it leaves editor state out', async () => {
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-editor-bad-'));
  fs.cpSync(bundle, broken, {recursive: true});
  fs.writeFileSync(
    path.join(broken, 'editor', 'sunset.settings.json'),
    JSON.stringify({name: 'sunset', settings: 'all of them'}),
  );
  const fresh = makeLinkedFixture(
    'astryx-theme-add-editor-bad-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(fresh, 'neutral');
  const {status, stdout, stderr} = await runCli(
    ['theme', 'add', broken, '--json'],
    fresh,
  );
  removeLinkedFixture(fresh);
  fs.rmSync(broken, {recursive: true, force: true});
  expect(status, stdout + stderr).toBe(0);
  expect(stdout).toMatch(/notCopied/);
  // (The reason, in the add's own words: the bundle's own folder names
  // aside, nothing names the editor or its commands.)
  const why = JSON.parse(stdout).data.copy.workingFiles.notCopied;
  expect(why).toMatch(/does not pass the settings checks/);
  expect(why).not.toMatch(/experimental|editor|--mode|\bset\b/);
}, 300_000);

it('carries a palette a newer CLI made exactly as saved: settings save, its colors stay', async () => {
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-kept-bundle-'));
  const app = makeLinkedFixture('astryx-theme-add-kept-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(app, 'neutral');
  try {
    await themeEditNew('harbor', {cwd: maker});
    await themeEditSet('harbor', 'accent', '#0069d6', {cwd: maker});
    const editor = path.join(maker, 'themes/harbor');
    // (The palette as a newer CLI saves it: its recipe named in the config,
    // the module and the receipt that names its bytes.)
    const recipe = 'astryx-oklch-v99';
    const config = path.join(editor, 'palette.config.json');
    fs.writeFileSync(
      config,
      JSON.stringify(
        {...JSON.parse(fs.readFileSync(config, 'utf-8')), recipe},
        null,
        2,
      ),
    );
    const module = path.join(editor, 'tokens/harbor.palette.ts');
    const saved = fs
      .readFileSync(module, 'utf-8')
      .replace(/^\/\/ Generated by \S+\./, `// Generated by ${recipe}.`);
    fs.writeFileSync(module, saved);
    const receipt = path.join(editor, 'tokens/harbor.palette.receipt.json');
    const crypto = await import('node:crypto');
    fs.writeFileSync(
      receipt,
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(receipt, 'utf-8')),
        recipe,
        candidateSha256: crypto
          .createHash('sha256')
          .update(saved)
          .digest('hex'),
      }),
    );
    fs.cpSync(editor, path.join(shared, 'editor'), {recursive: true});
    fs.cpSync(
      path.join(maker, 'src/themes/harbor'),
      path.join(shared, 'app-copy'),
      {recursive: true},
    );

    // (The newer CLI picked its own shade for one token: the copy shows the
    // palette's accent at stop 90 where this CLI would pick another.)
    const stop90 =
      /"accent": \{[\s\S]*?"light": \{[\s\S]*?"90": "(#[0-9a-f]{6})"/.exec(
        saved,
      )?.[1];
    expect(stop90).toBeTruthy();
    const sharedCss = path.join(shared, 'app-copy/harbor.css');
    fs.writeFileSync(
      sharedCss,
      fs
        .readFileSync(sharedCss, 'utf-8')
        .replace(
          /(--color-accent-muted\s*:\s*light-dark\()\s*#[0-9a-fA-F]+/,
          `$1${stop90}`,
        ),
    );

    const added = await themeAdd(shared, {cwd: app});
    expect(added.data.copy?.workingFiles).toMatchObject({
      keptPalette: recipe,
      files: expect.arrayContaining([
        'harbor.settings.json',
        'palette.config.json',
        'tokens/harbor.palette.ts',
        'tokens/harbor.palette.receipt.json',
      ]),
    });
    const kept = path.join(app, 'themes/harbor/tokens/harbor.palette.ts');
    expect(fs.readFileSync(kept, 'utf-8')).toBe(saved);

    // (A change that does not remake the colors saves, and every shade the
    // copy showed stays; one that does is refused with the recipe's words,
    // and the colors stay as saved.)
    const copyCss = path.join(app, 'src/themes/harbor/harbor.css');
    /** @param {string} css */
    const shades = css =>
      Object.fromEntries(
        [
          ...css.matchAll(
            /(--color-[\w-]+)\s*:\s*(light-dark\([^)]*\)|#[0-9a-fA-F]+)\s*;/g,
          ),
        ]
          .reverse()
          .map(m => [m[1], m[2].replace(/\s/g, '').toLowerCase()]),
      );
    const shown = shades(fs.readFileSync(copyCss, 'utf-8'));
    expect(shown['--color-accent-muted']).toMatch(
      new RegExp(`^light-dark\\(${stop90}`),
    );
    await themeEditSet('harbor', 'corners', 'square', {cwd: app});
    const after = shades(fs.readFileSync(copyCss, 'utf-8'));
    expect(
      Object.keys(shown).filter(k => k in after && after[k] !== shown[k]),
    ).toEqual([]);
    await expect(
      themeEditSet('harbor', 'accent', '#ff0000', {cwd: app}),
    ).rejects.toThrow(/astryx-oklch-v99 recipe, which this Astryx CLI/);
    expect(fs.readFileSync(kept, 'utf-8')).toBe(saved);

    // (A receipt that names other bytes stays behind; the module still
    // comes.)
    const otherReceipt = path.join(
      shared,
      'editor/tokens/harbor.palette.receipt.json',
    );
    fs.writeFileSync(
      otherReceipt,
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(otherReceipt, 'utf-8')),
        candidateSha256: '0'.repeat(64),
      }),
    );
    const fourth = makeLinkedFixture(
      'astryx-theme-add-kept4-',
      FIXTURE_PACKAGES,
    );
    writeFixtureBaseTheme(fourth, 'neutral');
    const unnamed = await themeAdd(shared, {cwd: fourth}).finally(() =>
      removeLinkedFixture(fourth),
    );
    expect(unnamed.data.copy?.workingFiles?.files).toContain(
      'tokens/harbor.palette.ts',
    );
    expect(unnamed.data.copy?.workingFiles?.files).not.toContain(
      'tokens/harbor.palette.receipt.json',
    );

    // (A module with anything past the generator's own form is code: the
    // theme is added without the editor state, and the add says why.)
    fs.writeFileSync(
      path.join(shared, 'editor/tokens/harbor.palette.ts'),
      `${saved}console.log('hi');\n`,
    );
    const other = makeLinkedFixture(
      'astryx-theme-add-kept2-',
      FIXTURE_PACKAGES,
    );
    writeFixtureBaseTheme(other, 'neutral');
    const refused = await themeAdd(shared, {cwd: other}).finally(() =>
      removeLinkedFixture(other),
    );
    expect(refused.data.copy?.workingFiles).toMatchObject({
      files: [],
      notCopied: expect.stringMatching(
        /not in the form the palette generator writes/,
      ),
    });
    // (Colors that are not a palette are not the generator's form either.)
    fs.writeFileSync(
      path.join(shared, 'editor/tokens/harbor.palette.ts'),
      saved.replace(
        /export const palette = [\s\S]* as const;/,
        'export const palette = null as const;',
      ),
    );
    const third = makeLinkedFixture(
      'astryx-theme-add-kept3-',
      FIXTURE_PACKAGES,
    );
    writeFixtureBaseTheme(third, 'neutral');
    const nulled = await themeAdd(shared, {cwd: third}).finally(() =>
      removeLinkedFixture(third),
    );
    expect(nulled.data.copy?.workingFiles).toMatchObject({
      files: [],
      notCopied: expect.stringMatching(
        /not in the form the palette generator writes/,
      ),
    });
  } finally {
    removeLinkedFixture(app);
    fs.rmSync(shared, {recursive: true, force: true});
  }
}, 240_000);
