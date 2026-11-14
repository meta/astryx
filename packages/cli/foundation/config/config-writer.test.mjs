// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `setConfigString` and `setConfigValues` (the writer behind
 * `astryx experimental icon use`): a key written beside a spread could
 * replace what the spread sets, so a config whose object on the path spreads
 * another is refused and left as it was; a plain literal is written, and an
 * existing literal object keeps its other keys; several fields are set and
 * removed in one write.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {setConfigString, setConfigValues} from './config-writer.mjs';

/** @type {string} */
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-config-writer-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}\n');
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} text */
const writeConfig = text =>
  fs.writeFileSync(path.join(dir, 'astryx.config.mjs'), text);
const readConfig = () =>
  fs.readFileSync(path.join(dir, 'astryx.config.mjs'), 'utf-8');

describe('setConfigString beside a spread', () => {
  it('refuses a default export that spreads another object, and leaves it as it was', () => {
    const before = `import base from './base.mjs';

export default {
  ...base,
  integrations: [],
};
`;
    writeConfig(before);
    expect(() =>
      setConfigString(dir, 'experimental.iconSet', 'glyphs'),
    ).toThrow(
      /its default export spreads another object \(`\.\.\.`\).*Set "experimental\.iconSet: 'glyphs'" in it yourself/u,
    );
    expect(readConfig()).toBe(before);
  });

  it('refuses an experimental object that spreads another, and leaves it as it was', () => {
    const before = `const shared = {xle: {components: ['./xle']}};

export default {
  experimental: {...shared},
};
`;
    writeConfig(before);
    expect(() =>
      setConfigString(dir, 'experimental.iconSet', 'glyphs'),
    ).toThrow(/its "experimental" object spreads another object/u);
    expect(readConfig()).toBe(before);
  });

  it('writes a plain literal', () => {
    writeConfig('export default {\n  integrations: [],\n};\n');
    const result = setConfigString(dir, 'experimental.iconSet', 'glyphs');
    expect(result).toMatchObject({created: false, changed: true});
    const text = readConfig();
    expect(text).toContain('integrations: []');
    expect(text).toMatch(/experimental: \{\s*iconSet: 'glyphs'/u);
  });

  it('adds iconSet inside an existing literal experimental object, keeping its other keys', () => {
    writeConfig(
      "export default {\n  experimental: {\n    xle: {components: ['./xle']},\n  },\n};\n",
    );
    setConfigString(dir, 'experimental.iconSet', 'glyphs');
    const text = readConfig();
    expect(text).toContain("xle: {components: ['./xle']}");
    expect(text).toContain("iconSet: 'glyphs'");
    expect(text.match(/experimental:/gu)).toHaveLength(1);
  });
});

describe('setConfigValues', () => {
  it('creates a config with every field, nested objects shared', () => {
    fs.rmSync(path.join(dir, 'astryx.config.mjs'), {force: true});
    const result = setConfigValues(dir, [
      ['experimental.iconSet', ['glyphs', 'lines']],
      ['experimental.iconVariant', 'filled'],
      ['experimental.xle.unused', null],
    ]);
    expect(result).toMatchObject({
      created: true,
      changed: true,
      previous: [null, null, null],
    });
    expect(readConfig()).toBe(
      "export default {\n  experimental: {\n    iconSet: ['glyphs', 'lines'],\n    iconVariant: 'filled',\n  },\n};\n",
    );
  });

  it('sets one field and removes another in one write, reporting what each was', () => {
    writeConfig(
      "export default {\n  experimental: {\n    iconSet: 'glyphs',\n    iconVariant: 'filled',\n  },\n};\n",
    );
    const result = setConfigValues(dir, [
      ['experimental.iconSet', 'lines'],
      ['experimental.iconVariant', null],
    ]);
    expect(result).toMatchObject({
      changed: true,
      previous: ['glyphs', 'filled'],
    });
    const text = readConfig();
    expect(text).toContain("iconSet: 'lines'");
    expect(text).not.toContain('iconVariant');
  });

  it('writes nothing when every field already has its value, or is already gone', () => {
    const before =
      "export default {\n  experimental: {iconSet: 'glyphs'},\n};\n";
    writeConfig(before);
    const result = setConfigValues(dir, [
      ['experimental.iconSet', 'glyphs'],
      ['experimental.iconVariant', null],
      ['other.key', null],
    ]);
    expect(result).toMatchObject({
      changed: false,
      previous: ['glyphs', null, null],
    });
    expect(readConfig()).toBe(before);
  });

  it('refuses beside a spread, naming every edit, and writes none of them', () => {
    const before = 'const base = {};\nexport default {\n  ...base,\n};\n';
    writeConfig(before);
    expect(() =>
      setConfigValues(dir, [
        ['experimental.iconSet', 'glyphs'],
        ['experimental.iconVariant', null],
      ]),
    ).toThrow(
      /a written "experimental\.iconSet" or "experimental\.iconVariant" could replace\. Set "experimental\.iconSet: 'glyphs'" and remove "experimental\.iconVariant" in it yourself\./u,
    );
    expect(readConfig()).toBe(before);
  });
});
