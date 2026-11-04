// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set checks of `integration check` (AST-084 FR12, FR15):
 * every error and warning FR15 lists, read statically, and how `--strict`
 * treats the warnings.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  iconSetCoverage,
  iconSetIssues,
  suggestedIcons,
} from './icon-set-checks.mjs';
import {moduleExportOrigin} from './module-exports.mjs';
import {generatedTypesText} from './icon-set-writer.mjs';
import {integrationCheck} from '../../api/integration/check/check.mjs';
import {
  completeGlyphs,
  definitionSource,
  glyphsData,
  glyphsModules,
  writeIconPackage,
} from '../../test-utils/icon-set-fixture.mjs';
import {ICON_NAMES} from '../../authoring/doctypes/icon-set/icon-names.mjs';
import {rankIcons} from './icon-ranking.mjs';
import {astryxIconDefinitions} from './icon-definition-discovery.mjs';
import {discoverIconSetDirectory} from './icon-set-discovery.mjs';

/** The fixture package's one set, as discovery reads it. */
const readSet = () =>
  discoverIconSetDirectory(path.join(dir, 'icon-sets'), '@acme/glyphs').sets[0];

/** @type {string} */
let tmp;
/** @type {string} */
let dir;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-checks-'));
  dir = path.join(tmp, 'glyphs');
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** The findings about which icon definitions `map` covers. */
const COVERAGE = new Set(['icon_builtin_definition_missing']);

/**
 * What the checks could not judge in the last {@link issuesOf} call, by set.
 * @type {Map<string, import('./icon-set-checks.mjs').IconSetUnchecked[]>}
 */
let notChecked = new Map();

/**
 * The set's issues, leaving out the definition-coverage findings that the
 * small fixture set always has; `coverage: true` keeps them.
 * @param {import('../../test-utils/icon-set-fixture.mjs').IconPackageSpec} [spec]
 * @param {{coverage?: boolean}} [options]
 */
function issuesOf(spec = {}, {coverage = false} = {}) {
  writeIconPackage(dir, spec);
  notChecked = new Map();
  const issues = iconSetIssues(
    dir,
    {
      name: spec.name ?? '@acme/glyphs',
      iconSets: path.join(dir, 'icon-sets'),
    },
    notChecked,
  );
  return coverage ? issues : issues.filter(issue => !COVERAGE.has(issue.code));
}

/** @param {(data: any) => void} change */
function data(change) {
  const value = /** @type {any} */ ({...glyphsData(), module: '@acme/glyphs'});
  change(value);
  return value;
}

/** @param {Record<string, string>} changes */
function modules(changes) {
  return {...glyphsModules(), ...changes};
}

describe('iconSetIssues', () => {
  it('a set that matches its package has no issues', () => {
    expect(issuesOf()).toEqual([]);
  });

  it('follows re-exports, renames, and export * to the declaring file', () => {
    writeIconPackage(dir);
    expect(
      moduleExportOrigin(path.join(dir, 'index.js'), 'TrashSolidIcon'),
    ).toEqual({
      file: path.join(dir, 'icons', 'trash.js'),
      name: 'TrashSolidIcon',
    });
  });

  it('an invalid data file is an error', () => {
    const issues = issuesOf({data: data(d => (d.icons[1].id = 'x'))});
    expect(issues).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(issues[0].message).toMatch(/duplicate id "x"/);
  });

  it('an export or variant export the module lacks is an error', () => {
    const issues = issuesOf({
      data: data(d => {
        d.icons[3].export = 'HouseIcon';
        d.icons[2].variants[0].export = 'TrashFilledIcon';
      }),
    });
    expect(issues.map(issue => issue.code)).toEqual([
      'icon_export_missing',
      'icon_export_missing',
    ]);
    const messages = issues.map(issue => issue.message).join('\n');
    expect(messages).toContain('HouseIcon');
    expect(messages).toContain('TrashFilledIcon');
  });

  it('a type-only export is not a runtime export', () => {
    const issues = issuesOf({
      modules: modules({
        'icons/home.js': '',
        'index.js': glyphsModules()['index.js'].replace(
          "export {HomeIcon} from './icons/home.js';",
          'export type HomeIcon = unknown;',
        ),
      }),
    });
    expect(issues).toEqual([
      expect.objectContaining({code: 'icon_export_missing'}),
    ]);
  });

  it('a match with an unknown confidence or naming the set itself is an error', () => {
    const unknown = issuesOf({
      data: data(
        d =>
          (d.icons[0].matches = [
            {set: 'heroicons', export: 'XMarkIcon', confidence: 'maybe'},
          ]),
      ),
    });
    expect(unknown).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(unknown[0].message).toMatch(/confidence/);
    fs.rmSync(dir, {recursive: true});
    const self = issuesOf({
      data: data(
        d =>
          (d.icons[0].matches = [
            {set: 'glyphs', export: 'XIcon', confidence: 'exact'},
          ]),
      ),
    });
    expect(self).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(self[0].message).toMatch(/names this set itself/);
    fs.rmSync(dir, {recursive: true});
    const valid = issuesOf({
      data: data(
        d =>
          (d.icons[0].matches = [
            {
              set: 'heroicons',
              export: 'XMarkIcon',
              variant: 'outline',
              confidence: 'exact',
            },
          ]),
      ),
    });
    expect(valid).toEqual([]);
  });

  it('a module that does not resolve from the package is an error', () => {
    const issues = issuesOf({
      data: data(d => (d.icons[0].module = '@acme/glyphs/solid')),
    });
    // It is not a public entry of the package either.
    expect(issues.map(issue => issue.code).sort()).toEqual([
      'icon_export_missing',
      'icon_module_not_public',
    ]);
    expect(
      issues.find(issue => issue.code === 'icon_export_missing')?.message,
    ).toMatch(/does not resolve/);
  });

  describe('the icon export contract', () => {
    it('an icon read from a module other than the package or its exports subpaths is an error', () => {
      const issues = issuesOf({
        data: data(d => (d.icons[0].module = 'upstream-icons')),
      });
      expect(issues).toContainEqual(
        expect.objectContaining({
          code: 'icon_module_not_public',
          severity: 'error',
        }),
      );
    });

    it('a module public only through a pattern subpath is public; a subpath no key matches is not', () => {
      /** @param {Record<string, string>} exports @param {string} module */
      const contractIssues = (exports, module) => {
        writeIconPackage(dir, {
          data: data(d => (d.icons[0].module = module)),
          modules: modules({
            'dist/outline.js': "export {XIcon} from '../icons/x.js';\n",
          }),
        });
        const pkgFile = path.join(dir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
        pkg.exports = exports;
        fs.writeFileSync(pkgFile, JSON.stringify(pkg));
        return iconSetIssues(dir, {
          name: '@acme/glyphs',
          iconSets: path.join(dir, 'icon-sets'),
        }).filter(issue => issue.code === 'icon_module_not_public');
      };
      expect(
        contractIssues(
          {'.': './index.js', './*': './dist/*.js'},
          '@acme/glyphs/outline',
        ),
      ).toEqual([]);
      expect(
        contractIssues(
          {'.': './index.js', './icons/*': './dist/*.js'},
          '@acme/glyphs/outline',
        ),
      ).toEqual([
        expect.objectContaining({
          code: 'icon_module_not_public',
          severity: 'error',
        }),
      ]);
    });

    it('an export not named <Name>Icon warns', () => {
      const issues = issuesOf({
        data: data(d => (d.icons[3].export = 'House')),
        modules: modules({
          'icons/home.js': 'export function House() { return null; }\n',
          'index.js': glyphsModules()['index.js'].replace(
            "export {HomeIcon} from './icons/home.js';",
            "export {House} from './icons/home.js';",
          ),
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({
          code: 'icon_export_name',
          severity: 'warning',
        }),
      ]);
    });

    it('an export that is a value, not a component, is an error', () => {
      const issues = issuesOf({
        modules: modules({
          'icons/home.js': "export const HomeIcon = {path: 'M3 11'};\n",
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({
          code: 'icon_not_component',
          severity: 'error',
        }),
      ]);
    });

    it('follows `export *` from an installed package, and lists an export behind a re-export it cannot follow as not checked', () => {
      const upstream = path.join(dir, 'node_modules', 'upstream-icons');
      fs.mkdirSync(upstream, {recursive: true});
      fs.writeFileSync(
        path.join(upstream, 'package.json'),
        JSON.stringify({
          name: 'upstream-icons',
          version: '1.0.0',
          exports: {'.': './index.js'},
        }),
      );
      fs.writeFileSync(
        path.join(upstream, 'index.js'),
        'export function HomeIcon() { return null; }\n',
      );
      const followed = issuesOf({
        modules: modules({
          'index.js': glyphsModules()['index.js'].replace(
            "export {HomeIcon} from './icons/home.js';",
            "export * from 'upstream-icons';",
          ),
        }),
      });
      expect(followed).toEqual([]);
      const missing = issuesOf({
        modules: modules({
          'index.js': glyphsModules()['index.js'].replace(
            "export {HomeIcon} from './icons/home.js';",
            "export * from 'not-installed';",
          ),
        }),
      });
      // The reader cannot judge it, so it is not checked, never an issue.
      expect(missing).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {
          icon: 'home',
          reason: expect.stringContaining(
            're-exports everything from "not-installed"',
          ),
        },
      ]);
    });

    it('lists an export whose module is an exports target not built yet as not checked, and still fails an export the built file lacks', () => {
      const unbuilt = issuesOf({
        name: '@acme/glyphs',
        data: data(d => {
          d.icons[0].module = '@acme/glyphs/extra';
        }),
      });
      const pkgFile = path.join(dir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
      pkg.exports = {...pkg.exports, './extra': './dist/extra.js'};
      fs.writeFileSync(pkgFile, JSON.stringify(pkg));
      notChecked = new Map();
      const before = iconSetIssues(
        dir,
        {name: '@acme/glyphs', iconSets: path.join(dir, 'icon-sets')},
        notChecked,
      ).filter(issue => !COVERAGE.has(issue.code));
      expect(unbuilt.some(issue => issue.code === 'icon_export_missing')).toBe(
        true,
      );
      expect(
        before.filter(issue => issue.code === 'icon_export_missing'),
      ).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {
          icon: 'x',
          reason: expect.stringContaining(
            'exports target ./dist/extra.js is not there yet',
          ),
        },
      ]);
      // Built without the export: a real miss, an error.
      fs.mkdirSync(path.join(dir, 'dist'), {recursive: true});
      fs.writeFileSync(path.join(dir, 'dist', 'extra.js'), 'export {};\n');
      notChecked = new Map();
      const built = iconSetIssues(
        dir,
        {name: '@acme/glyphs', iconSets: path.join(dir, 'icon-sets')},
        notChecked,
      );
      expect(built).toContainEqual(
        expect.objectContaining({
          code: 'icon_export_missing',
          severity: 'error',
        }),
      );
      expect(notChecked.get('glyphs')).toBeUndefined();
    });

    it('fails only an export the reader proves absent; an export it cannot follow is not checked', () => {
      // Bound to a default import: present, but not followed to its declaration.
      const viaDefault = issuesOf({
        modules: modules({
          'icons/trash-default.js':
            'export default function Trash(props) { return null; }\n',
          'icons/trash.js':
            "import Trash from './trash-default.js';\nexport {Trash as TrashIcon};\nexport function TrashSolidIcon(props) { return null; }\n",
        }),
      });
      expect(viaDefault).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {
          icon: 'trash',
          reason: expect.stringContaining(
            'from a default import of "./trash-default.js"',
          ),
        },
      ]);
      // Imported from a package that does not resolve.
      const viaMissing = issuesOf({
        modules: modules({
          'icons/trash.js':
            "import {TrashIcon} from 'not-installed';\nexport {TrashIcon};\nexport function TrashSolidIcon(props) { return null; }\n",
        }),
      });
      expect(viaMissing).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {
          icon: 'trash',
          reason: expect.stringContaining(
            'imported from "not-installed", which does not resolve from the package',
          ),
        },
      ]);
      // A built file that truly lacks the export: an error.
      const lacking = issuesOf({
        modules: modules({
          'icons/trash.js':
            'export function TrashSolidIcon(props) { return null; }\n',
        }),
      });
      expect(lacking).toEqual([
        expect.objectContaining({
          code: 'icon_export_missing',
          severity: 'error',
        }),
      ]);
      expect(notChecked.get('glyphs')).toBeUndefined();
    });

    it('an adapter behind a re-export the reader cannot follow is not checked; one proved absent is an error', () => {
      const adapter = {module: './src/adapt.js', export: 'adapt'};
      const unfollowed = issuesOf({
        data: data(d => {
          d.adapter = adapter;
        }),
        modules: modules({
          'src/adapt.js': "export * from 'not-installed';\n",
        }),
      });
      expect(unfollowed).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {
          adapter: 'adapt',
          reason: expect.stringContaining('"not-installed"'),
        },
      ]);
      const absent = issuesOf({
        data: data(d => {
          d.adapter = adapter;
        }),
        modules: modules({'src/adapt.js': 'export function other() {}\n'}),
      });
      expect(absent).toEqual([
        expect.objectContaining({
          code: 'icon_export_missing',
          message: expect.stringContaining('its adapter "adapt"'),
        }),
      ]);
    });

    it('a generated module or adapter the data names must exist', () => {
      const issues = issuesOf({
        data: data(d => {
          d.generated = './icon-sets/glyphs/glyphs.generated.js';
          d.adapter = {module: './src/adapt.js', export: 'adapt'};
        }),
      });
      expect(issues.map(issue => issue.code)).toEqual([
        'icon_export_missing',
        'icon_export_missing',
      ]);
    });
  });

  describe('theme map (FR12)', () => {
    it('an extra key is an error', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js': glyphsModules()['theme.js'].replace(
            '};',
            '  menu: XIcon,\n};',
          ),
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      expect(issues[0].message).toMatch(/has "menu", which "map" does not map/);
    });

    it('a missing key is an error', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nexport const themeIcons = {close: XIcon};\n",
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      expect(issues[0].message).toMatch(/has no "search"/);
    });

    it('wrong artwork is an error, an aliased import of the right artwork is not', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nimport {HomeIcon} from './icons/home.js';\nexport const themeIcons = {close: XIcon, search: HomeIcon};\n",
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      expect(issues[0].message).toMatch(/maps "search" to other artwork/);
    });

    it('reads JSX elements as the artwork they render', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nimport {SearchIcon} from './icons/search.js';\nexport const themeIcons = {close: <XIcon />, search: <SearchIcon />};\n",
        }),
      });
      expect(issues).toEqual([]);
    });

    it('reads createElement and jsx calls as the artwork they render, and lists an entry it cannot read as not checked', () => {
      const read = issuesOf({
        modules: modules({
          'theme.js':
            "import {createElement} from 'react';\nimport {jsx as _jsx} from 'react/jsx-runtime';\nimport {XIcon} from './icons/x.js';\nimport {SearchIcon} from './icons/search.js';\nexport const themeIcons = {close: createElement(XIcon, {}), search: _jsx(SearchIcon, {})};\n",
        }),
      });
      expect(read).toEqual([]);
      const unread = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nconst pick = icon => icon;\nexport const themeIcons = {close: XIcon, search: pick(XIcon)};\n",
        }),
      });
      expect(unread).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {
          entry: 'search',
          reason: expect.stringContaining('the static reader cannot read'),
        },
      ]);
    });

    it('follows a const alias of an icon before comparing; one it cannot follow is not checked', () => {
      const aliased = issuesOf({
        modules: modules({
          'icons/x.js':
            "import {XMark} from './x-mark.js';\nexport const XIcon = XMark;\n",
          'icons/x-mark.js': 'export function XMark(props) { return null; }\n',
          'theme.js':
            "import {XMark} from './icons/x-mark.js';\nimport {SearchIcon as Magnifier} from './icons/search.js';\nexport const themeIcons = {close: XMark, search: Magnifier};\n",
        }),
      });
      expect(aliased).toEqual([]);
      expect(notChecked.get('glyphs')).toBeUndefined();
      // An alias of another component is still a proven mismatch.
      const other = issuesOf({
        modules: modules({
          'icons/x.js':
            "import {XMark} from './x-mark.js';\nexport const XIcon = XMark;\n",
          'icons/x-mark.js':
            'export function XMark(props) { return null; }\nexport function Other(props) { return null; }\n',
          'theme.js':
            "import {Other} from './icons/x-mark.js';\nimport {SearchIcon as Magnifier} from './icons/search.js';\nexport const themeIcons = {close: Other, search: Magnifier};\n",
        }),
      });
      expect(other).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      // An alias of a member the reader cannot follow: not checked.
      const member = issuesOf({
        modules: modules({
          'icons/x.js':
            "import * as all from './x-mark.js';\nexport const XIcon = all.XMark;\n",
          'icons/x-mark.js': 'export function XMark(props) { return null; }\n',
          'theme.js':
            "import {XMark} from './icons/x-mark.js';\nimport {SearchIcon as Magnifier} from './icons/search.js';\nexport const themeIcons = {close: XMark, search: Magnifier};\n",
        }),
      });
      expect(member).toEqual([]);
      expect(notChecked.get('glyphs')).toEqual([
        {entry: 'close', reason: expect.stringContaining('alias')},
      ]);
    });

    it('a set that maps built-in definitions but has no themeMap is an error', () => {
      const issues = issuesOf({data: data(d => delete d.themeMap)});
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
    });

    it('a map built at runtime is left unchecked, not reported', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js': 'export const themeIcons = Object.fromEntries([]);\n',
        }),
      });
      expect(issues).toEqual([]);
    });
  });

  describe('upstream (warnings)', () => {
    /** @param {string} installed */
    const withUpstream = (installed, notice = true) => {
      const upstream = path.join(dir, 'node_modules', 'upstream-icons');
      fs.mkdirSync(upstream, {recursive: true});
      fs.writeFileSync(
        path.join(upstream, 'package.json'),
        JSON.stringify({name: 'upstream-icons', version: installed}),
      );
      return issuesOf({
        notice,
        dependencies: {'upstream-icons': '^1.0.0'},
        data: data(
          d => (d.source = {package: 'upstream-icons', version: '1.2.0'}),
        ),
      });
    };

    it('data generated from another upstream version warns', () => {
      expect(withUpstream('1.3.0')).toEqual([
        expect.objectContaining({
          code: 'icon_source_version_drift',
          severity: 'warning',
        }),
      ]);
      expect(withUpstream('1.2.0')).toEqual([]);
    });

    it('no license notice for a set with an upstream warns', () => {
      expect(withUpstream('1.2.0', false)).toEqual([
        expect.objectContaining({
          code: 'icon_license_notice_missing',
          severity: 'warning',
        }),
      ]);
    });
  });
});

describe('icon definitions (map)', () => {
  it('every built-in definition missing from map is an error; the optional ones are listed, never issues, with a suggestion only when an icon id is its name or a word', () => {
    const issues = issuesOf({}, {coverage: true});
    const builtIn = issues.filter(
      issue => issue.code === 'icon_builtin_definition_missing',
    );
    // close and search are mapped; every other built-in is not.
    expect(builtIn).toHaveLength(ICON_NAMES.length - 2);
    expect(builtIn.every(issue => issue.severity === 'error')).toBe(true);
    // Each names the command that maps it, never a hand edit of the data.
    const error = builtIn.find(issue => issue.message.includes('"error"'));
    expect(error?.message).toContain(
      '`astryx experimental icon map error <icon id>`',
    );
    expect(error?.message).not.toContain('add it to "map"');
    // A find hint names a search only when that search finds icons.
    for (const issue of builtIn) {
      const query =
        /icons matching "([^"]+)": `astryx experimental icon \1 --set glyphs`/u.exec(
          issue.message,
        );
      if (query) {
        expect(rankIcons([readSet()], query[1]).length).toBeGreaterThan(0);
      } else {
        expect(issue.message).toContain(
          'no icon in the set has its name or words',
        );
      }
    }
    // An issue is only ever an error or a warning.
    expect(
      issues.every(issue => ['error', 'warning'].includes(issue.severity)),
    ).toBe(true);
    expect(issues.some(issue => /"delete"|"home"/.test(issue.message))).toBe(
      false,
    );
    const [coverage] = iconSetCoverage({
      name: '@acme/glyphs',
      iconSets: path.join(dir, 'icon-sets'),
    });
    expect(coverage.set).toBe('glyphs');
    const names = coverage.unmappedDefinitions.map(each => each.name);
    expect(names).toContain('delete');
    expect(names).toContain('home');
    // Built-in definitions are issues, not listed here.
    expect(names).not.toContain('calendar');
    expect(
      coverage.unmappedDefinitions.find(each => each.name === 'delete'),
    ).toMatchObject({
      description: expect.any(String),
      words: expect.any(Array),
    });
    // `delete` names no icon, but one of its words is the trash icon's id.
    expect(coverage.suggestions).toContainEqual({
      definition: 'delete',
      icon: 'trash',
    });
    expect(coverage.suggestions).toContainEqual({
      definition: 'home',
      icon: 'home',
    });
    // Nothing in the set draws a calendar: no suggestion.
    expect(
      coverage.suggestions.some(each => each.definition === 'calendar'),
    ).toBe(false);
    expect(
      builtIn.find(issue => issue.message.includes('"calendar"')),
    ).toBeDefined();
  });

  it('a set mapping every built-in definition has no error', () => {
    const {data: complete, modules: completeModules} = completeGlyphs();
    const issues = issuesOf(
      {data: {...complete, module: '@acme/glyphs'}, modules: completeModules},
      {coverage: true},
    );
    expect(issues.filter(issue => issue.severity === 'error')).toEqual([]);
  });

  it("a map key that is neither Astryx's definition nor the set's own is an error", () => {
    const issues = issuesOf({data: data(d => (d.map.orbit = 'home'))});
    expect(issues).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(issues[0].message).toMatch(
      /map "orbit" \(icon "home"\) is not an icon definition\. Declare it in definitions\/orbit\.doc\.mjs/,
    );
  });

  it("the set's own definitions: mapped is fine, unmapped warns with a suggestion, and one Astryx has warns", () => {
    const issues = issuesOf({
      data: data(d => (d.map.orbit = 'home')),
      definitions: {
        orbit: definitionSource('orbit'),
        garbage: definitionSource('garbage', {words: ['bin', 'trash']}),
        // The trash icon has the word garbage, so it is a suggestion; `tra`
        // only starts its id, so that is not. Never part of a word.
        rubbish: definitionSource('rubbish', {words: ['garbage', 'tra']}),
        delete: definitionSource('delete'),
      },
    });
    expect(issues.map(issue => issue.code).sort()).toEqual([
      'icon_definition_shadowed',
      'icon_definition_unused',
      'icon_definition_unused',
    ]);
    const unused = issues.filter(
      issue => issue.code === 'icon_definition_unused',
    );
    const garbage = unused.find(issue => issue.message.includes('"garbage"'));
    expect(garbage?.message).toContain(
      'astryx experimental icon map garbage trash',
    );
    const rubbish = unused.find(issue => issue.message.includes('"rubbish"'));
    expect(rubbish?.message).toContain(
      'Suggested: astryx experimental icon map rubbish trash.',
    );
    const [coverage] = iconSetCoverage({
      name: '@acme/glyphs',
      iconSets: path.join(dir, 'icon-sets'),
    });
    expect(coverage.suggestions).toContainEqual({
      definition: 'garbage',
      icon: 'trash',
    });
    expect(coverage.suggestions).toContainEqual({
      definition: 'rubbish',
      icon: 'trash',
    });
    expect(
      issues.find(issue => issue.code === 'icon_definition_shadowed')?.message,
    ).toContain('Astryx now has');
  });

  it('a definition file that does not read makes the set invalid', () => {
    const issues = issuesOf({
      definitions: {orbit: definitionSource('Orbit')},
    });
    expect(issues).toEqual([
      expect.objectContaining({code: 'invalid_icon_set'}),
    ]);
  });
});

describe('integration check over an icon set', () => {
  it('an error fails the run; a warning fails only under --strict', async () => {
    const complete = completeGlyphs();
    writeIconPackage(dir, {
      notice: false,
      modules: complete.modules,
      data: {
        ...complete.data,
        module: '@acme/glyphs',
        source: {package: 'upstream-icons', version: '1.2.0'},
      },
    });
    const loose = await integrationCheck({cwd: dir});
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(loose.data.failed).toBe(false);
    expect(strict.data.failed).toBe(true);
    expect(JSON.stringify(strict.data)).toContain(
      'icon_license_notice_missing',
    );

    fs.rmSync(dir, {recursive: true});
    writeIconPackage(dir, {data: data(d => (d.icons[0].export = 'Nope'))});
    const broken = await integrationCheck({cwd: dir});
    expect(broken.data.failed).toBe(true);
    expect(JSON.stringify(broken.data)).toContain('icon_export_missing');
  }, 60_000);

  it('a set that maps every built-in definition passes --strict: other unmapped Astryx definitions are listed, not issues', async () => {
    const complete = completeGlyphs();
    writeIconPackage(dir, {
      modules: complete.modules,
      data: {...complete.data, module: '@acme/glyphs'},
    });
    const strict = await integrationCheck({cwd: dir, strict: true});
    // The fixture has no TypeScript, so only that skipped work remains.
    expect(
      strict.data.failures.filter(each => each.code !== 'doc_types_skipped'),
    ).toEqual([]);
    expect(strict.data.warnings).toBe(0);
    const validate = strict.data.checks.find(each => each.check === 'validate');
    const listed = /** @type {any} */ (validate).response.data.iconSets;
    expect(listed[0].unmappedDefinitions.length).toBeGreaterThan(0);
    expect(JSON.stringify(strict.data)).not.toContain('"severity":"info"');
    // `--next` counts only notes marked `next`; the icon-set lists are not
    // notes, so it fails no more than `--strict` does.
    const ahead = await integrationCheck({cwd: dir, strict: true, next: true});
    expect(
      ahead.data.failures.filter(each => each.code !== 'doc_types_skipped'),
    ).toEqual([]);
  }, 60_000);
});

describe('modules that do not parse, and generated types', () => {
  it('a module that does not parse is one error, not a missing export per icon', () => {
    const issues = issuesOf({
      modules: modules({
        'index.js': "export {XIcon} from './icons/x.js';\nexport {SearchIcon\n",
      }),
    });
    expect(issues).toEqual([
      expect.objectContaining({code: 'icon_module_invalid', severity: 'error'}),
    ]);
    expect(issues[0].message).toContain('index.js does not parse');
  });

  it("a generated module's declaration file that is missing or stale is an error", () => {
    const generated = './icon-sets/glyphs/glyphs.generated.js';
    const withGenerated = data(d => (d.generated = generated));
    const setup = (/** @type {string | null} */ types) => {
      fs.rmSync(dir, {recursive: true, force: true});
      writeIconPackage(dir, {data: withGenerated});
      const file = path.join(dir, generated);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, "export {XIcon} from '../../icons/x.js';\n");
      if (types != null) {
        fs.writeFileSync(file.replace(/\.js$/u, '.d.ts'), types);
      }
      return iconSetIssues(dir, {
        name: '@acme/glyphs',
        iconSets: path.join(dir, 'icon-sets'),
      });
    };
    const codes = (/** @type {any[]} */ issues) =>
      issues
        .map(issue => issue.code)
        .filter(code => code === 'icon_generated_types_mismatch');
    expect(codes(setup(null))).toEqual(['icon_generated_types_mismatch']);
    expect(codes(setup('export {};\n'))).toEqual([
      'icon_generated_types_mismatch',
    ]);
    expect(
      codes(
        setup(generatedTypesText(["export {XIcon} from '../../icons/x.js';"])),
      ),
    ).toEqual([]);
  });
});

// FR15's table is the whole list: a code the checks add, drop, or move to
// another severity fails here until the table says so.
describe('the codes and severities FR15 lists', () => {
  it('are exactly the codes this module raises, at the same severity', async () => {
    const checks = await import('./icon-set-checks.mjs');
    const source = fs.readFileSync(
      new URL('./icon-set-checks.mjs', import.meta.url),
      'utf8',
    );
    /** @type {Record<string, string>} */
    const constants = Object.fromEntries(
      Object.entries(checks).filter(
        ([name, value]) =>
          /^(?:ICON_|INVALID_ICON_SET$)/u.test(name) &&
          typeof value === 'string' &&
          /^(?:icon_|invalid_icon_set$)/u.test(value),
      ),
    );
    /** @type {Record<string, string>} */
    const raised = {};
    for (const [, kind, name] of source.matchAll(
      /issue(Error|Warning)\(\s*([A-Z_]+)\b/gu,
    )) {
      const code = constants[name];
      expect(code, `${name} is a code constant`).toBeTypeOf('string');
      const severity = kind.toLowerCase();
      expect(raised[code] ?? severity, `${code} has one severity`).toBe(
        severity,
      );
      raised[code] = severity;
    }
    expect(Object.keys(constants).length).toBeGreaterThan(10);
    expect(Object.keys(raised).sort()).toEqual(Object.values(constants).sort());

    const spec = fs.readFileSync(
      new URL(
        '../../../../docs/specs/AST-084-icon-sets/spec.md',
        import.meta.url,
      ),
      'utf8',
    );
    const fr15 = spec.slice(spec.indexOf('**FR15 '), spec.indexOf('**FR16 '));
    /** @type {Record<string, string>} */
    const listed = {};
    for (const [, code, severity] of fr15.matchAll(
      /^\s*\| `([a-z_]+)`\s*\| (error|warning)\s*\|/gmu,
    )) {
      listed[code] = severity;
    }
    expect(listed).toEqual(raised);
  });
});

describe('suggestions join a plural only to its singular', () => {
  /**
   * @param {string[]} ids
   * @param {{name: string, words?: string[]}} doc
   */
  const suggest = (ids, {name, words = []}) =>
    suggestedIcons(
      {data: {icons: ids.map(id => ({id, words: id.split('-')})), map: {}}},
      {name, words},
    ).map(each => each.icon);

  it('never offers a grid of squares for stop, whose word is square', () => {
    expect(suggest(['squares-2x2'], {name: 'stop', words: ['square']})).toEqual(
      [],
    );
    expect(
      suggest(['squares-2x2', 'square'], {name: 'stop', words: ['square']}),
    ).toEqual(['square']);
  });

  it('meets a plural and its singular of the same word, either way', () => {
    expect(suggest(['squares'], {name: 'square'})).toEqual(['squares']);
    expect(suggest(['square'], {name: 'squares'})).toEqual(['square']);
    expect(suggest(['arrows'], {name: 'arrow'})).toEqual(['arrows']);
    expect(suggest(['arrow'], {name: 'arrows'})).toEqual(['arrow']);
  });

  it('never bridges a verb ending or a plural to a longer id', () => {
    // `drafting` is not `draft`; `users` does not start `user-plus`.
    expect(
      suggest(['drafting-compass'], {name: 'compose', words: ['draft']}),
    ).toEqual([]);
    expect(suggest(['user-plus', 'user-cog'], {name: 'users'})).toEqual([]);
    expect(suggest(['tool-case'], {name: 'wrench', words: ['tools']})).toEqual(
      [],
    );
  });
});

describe('suggestions from a definition word never bridge to another meaning', () => {
  const definitions = new Map(
    astryxIconDefinitions().definitions.map(({doc}) => [doc.name, doc]),
  );
  /** @param {string} name @param {string[]} ids */
  const suggest = (name, ids) =>
    suggestedIcons(
      {data: {icons: ids.map(id => ({id, words: id.split('-')})), map: {}}},
      /** @type {any} */ (definitions.get(name)),
    ).map(each => each.icon);

  it.each([
    ['creditCard', 'card-sim'],
    ['bolt', 'fast-forward'],
    ['archive', 'store'],
    ['mobile', 'device-tablet'],
    ['raiseHand', 'stop-circle'],
    ['star', 'bookmark-square'],
    ['database', 'table-cells'],
    ['redo', 'forward'],
    ['activity', 'monitor'],
    ['stop', 'square-square'],
    ['moreHorizontal', 'ellipsis-vertical'],
  ])('%s never suggests %s', (name, id) => {
    expect(suggest(name, [id])).toEqual([]);
  });

  it('still suggests a word with only a size, shape, or number after it', () => {
    expect(suggest('gridView', ['grid-2x2'])).toEqual(['grid-2x2']);
    expect(suggest('viewColumns', ['columns-3'])).toEqual(['columns-3']);
    expect(suggest('add', ['plus-circle'])).toEqual(['plus-circle']);
  });

  it('finds the glyph a library names in two words through the definition’s words', () => {
    expect(suggest('raiseHand', ['hand-raised'])).toEqual(['hand-raised']);
    expect(suggest('location', ['map-pin'])).toEqual(['map-pin']);
    expect(suggest('textCase', ['case-sensitive'])).toEqual(['case-sensitive']);
  });
});
