// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Everything that can fail `astryx integration check --strict`.
 *
 * Builds run `integration check --strict`, so what fails it is a contract: a
 * new check, or a new failure code, joins only in a minor release that names
 * it. The list
 * beside this file, integration-check-failures.json, names every check, every
 * field of a check's result that is counted, every code a failure can carry,
 * and every comparison a check carries, read here from the code:
 * - `checks`: the checks `integration check` runs, in order;
 * - `results`: per check, the fields of its result besides its identity, read
 *   from a run against a package with every kind of root;
 * - `codes`: every issue code the checks' modules can raise (scanned in each
 *   module the command imports), the codes a conflict, a package with no
 *   manifest, or a skipped comparison carries, and every finding code a
 *   comparison declares;
 * - `reports`: each comparison a check carries, with the code its skip has.
 * Adding to any of them fails this test until the list changes, so a new way
 * to fail a build always shows up in review.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  CONFLICT_CODES,
  INTEGRATION_CHECKS,
  NO_MANIFEST_CODE,
  integrationCheck,
  isCheckReport,
  skippedCode,
} from '../api/integration/check/check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..');
const LIST = path.join(HERE, 'integration-check-failures.json');
const ENTRY = path.join(CLI, 'api', 'integration', 'check', 'check.mjs');

/**
 * Modules the command imports whose codes cannot fail it, with why.
 * @type {Record<string, string>}
 */
const NOT_SCANNED = {
  // Only `integration verify` compares a packed tarball with the source.
  'foundation/integrations/contribution-inventory.mjs':
    'its codes come from comparing a packed tarball, which only integration verify does',
};

/** The authoring schemas: their codes are the schema library's, not issues. */
const AUTHORING = `authoring${path.sep}`;

/** @type {{checks: string[], results: Record<string, string[]>, codes: string[], reports: Record<string, string>}} */
const list = JSON.parse(fs.readFileSync(LIST, 'utf8'));

/**
 * Every CLI module `entry` reaches through static relative imports, docs and
 * tests aside.
 * @param {string} entry
 */
function reachableModules(entry) {
  const IMPORT =
    /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      let target = path.resolve(path.dirname(file), match[1] ?? match[2]);
      if (!fs.existsSync(target) && fs.existsSync(`${target}.mjs`)) {
        target = `${target}.mjs`;
      }
      if (
        !target.startsWith(CLI + path.sep) ||
        !/\.(?:mjs|js)$/.test(target) ||
        /\.(?:doc|test)\.mjs$/.test(target) ||
        !fs.existsSync(target)
      ) {
        continue;
      }
      queue.push(target);
    }
  }
  return [...seen];
}

/**
 * The issue codes and finding codes one module can raise: a `code:` it
 * writes (or its fallback), each code in the first argument of `issueError`
 * and `issueWarning` under any name it imports them as (both branches of a
 * conditional), the code an error list is added under, the members of a
 * `code` property typed as a union of codes, and the members of a
 * finding-kind union whose members are all snake-case codes.
 * @param {string} text
 */
function codesIn(text) {
  const codes = new Set();
  const constants = new Map(
    [
      ...text.matchAll(
        /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*'([a-z][a-z0-9_]*)'/g,
      ),
    ].map(m => [m[1], m[2]]),
  );
  const raisers = ['issueError', 'issueWarning'];
  for (const m of text.matchAll(/\bissue(?:Error|Warning)\s+as\s+(\w+)/g)) {
    raisers.push(m[1]);
  }
  const raise = new RegExp(`\\b(?:${raisers.join('|')})\\(([^,]*),`, 'g');
  for (const m of text.matchAll(raise)) {
    for (const each of m[1].matchAll(
      /'([a-z][a-z0-9_]*)'|\b([A-Z][A-Z0-9_]*)\b/g,
    )) {
      const code = each[1] ?? constants.get(each[2]);
      if (code) codes.add(code);
    }
  }
  for (const m of text.matchAll(/@property\s+\{([^}]*)\}\s+code\b/g)) {
    const members = [...m[1].matchAll(/'([^']*)'/g)].map(each => each[1]);
    if (
      members.length > 0 &&
      members.every(member => /^[a-z]+(?:_[a-z]+)+$/.test(member))
    ) {
      for (const member of members) codes.add(member);
    }
  }
  for (const m of text.matchAll(/\bcode:\s*'([a-z][a-z0-9_]*)'/g))
    codes.add(m[1]);
  for (const m of text.matchAll(
    /\bcode:\s*[^,\n}]*?\?\?\s*'([a-z][a-z0-9_]*)'/g,
  )) {
    codes.add(m[1]);
  }
  for (const m of text.matchAll(
    /\baddErrors\([^;]*?'([a-z][a-z0-9_]*)'\s*\)/g,
  )) {
    codes.add(m[1]);
  }
  for (const m of text.matchAll(
    /@typedef\s+\{([^}]*)\}\s+\w*(?:Kind|Problem)\b/g,
  )) {
    const members = [...m[1].matchAll(/'([^']*)'/g)].map(each => each[1]);
    if (
      members.length > 0 &&
      members.every(member => /^[a-z]+(?:_[a-z]+)+$/.test(member))
    ) {
      for (const member of members) codes.add(member);
    }
  }
  return codes;
}

/** @type {string} */
let pkg;
/** @type {import('../api/integration/integration-check.type.mjs').IntegrationCheckCommandResponse} */
let result;

beforeAll(async () => {
  // Under the repository, so the components check resolves Core. Every kind
  // of root, so every field a check's result can carry is present.
  pkg = fs.mkdtempSync(path.join(process.cwd(), '.astryx-check-failures-'));
  const write = (/** @type {string} */ rel, /** @type {string} */ text) => {
    fs.mkdirSync(path.dirname(path.join(pkg, rel)), {recursive: true});
    fs.writeFileSync(path.join(pkg, rel), text);
  };
  write(
    'package.json',
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  write(
    'astryx.integration.mjs',
    "export default {components: './components', templates: './templates', docs: './docs'};\n",
  );
  write(
    'components/AcmeButton.doc.mjs',
    "export default {type: 'component', name: 'AcmeButton', displayName: 'Acme Button', description: 'A button.', props: []};\n",
  );
  write(
    'components/AcmeButton.tsx',
    'export function AcmeButton() { return null; }\n',
  );
  write(
    'templates/acme-page.doc.mjs',
    "export default {type: 'page', name: 'Acme page', displayName: 'Acme page', description: 'A page.'};\n",
  );
  write(
    'templates/acme-page.tsx',
    'export default function Fixture() { return null; }\n',
  );
  // The button's example, so the fixture draws no note.
  write(
    'templates/acme-button-showcase.doc.mjs',
    "export default {type: 'block', name: 'acme-button-showcase', displayName: 'Acme Button showcase', description: 'A button in use.', category: 'Acme - Actions', exampleFor: 'AcmeButton', isShowcase: true};\n",
  );
  write(
    'templates/acme-button-showcase.tsx',
    "import {AcmeButton} from '@acme/widgets';\nexport default function Showcase() { return <AcmeButton />; }\n",
  );
  write(
    'docs/acme-guide.doc.mjs',
    "export default {type: 'generic', name: 'acme-guide', title: 'Acme guide', description: 'A guide.', sections: [{title: 'One', content: [{type: 'prose', text: 'One.'}]}]};\n",
  );
  result = await integrationCheck({cwd: pkg, strict: true});
}, 60_000);

afterAll(() => {
  fs.rmSync(pkg, {recursive: true, force: true});
});

describe('what can fail integration check --strict', () => {
  it('runs the listed checks, in order', () => {
    expect([...INTEGRATION_CHECKS]).toEqual(list.checks);
    expect(result.data.checks.map(check => check.check)).toEqual(list.checks);
  });

  it('counts the listed fields of each check’s result', () => {
    /** @type {Record<string, string[]>} */
    const fields = {};
    for (const {check, response} of result.data.checks) {
      fields[check] = Object.keys(response.data)
        .filter(key => !['validated', 'name', 'version'].includes(key))
        .sort();
    }
    expect(
      fields,
      'A check’s result has a new field. If it can fail integration check, it is a new failure: list it (a minor-release change).',
    ).toEqual(
      Object.fromEntries(
        Object.entries(list.results).map(([check, keys]) => [
          check,
          [...keys].sort(),
        ]),
      ),
    );
  });

  it('lists each comparison a check carries, with the code its skip has', () => {
    /** @type {Record<string, string>} */
    const reports = {};
    for (const {response} of result.data.checks) {
      for (const [key, value] of Object.entries(response.data)) {
        if (isCheckReport(value)) reports[key] = skippedCode(key);
      }
    }
    expect(reports).toEqual(list.reports);
  });

  it('lists every code a failure can carry', () => {
    const codes = new Set([
      ...Object.values(CONFLICT_CODES),
      NO_MANIFEST_CODE,
      ...Object.values(list.reports),
    ]);
    for (const file of reachableModules(ENTRY)) {
      const rel = path.relative(CLI, file).split(path.sep).join('/');
      if (rel in NOT_SCANNED || file.startsWith(path.join(CLI, AUTHORING))) {
        continue;
      }
      for (const code of codesIn(fs.readFileSync(file, 'utf8'))) {
        codes.add(code);
      }
    }
    const found = [...codes].sort();
    const added = found.filter(code => !list.codes.includes(code));
    const removed = list.codes.filter(code => !codes.has(code));
    expect(
      added,
      'These codes can now fail integration check --strict. List them: a new failure code joins only in a minor release that names it.',
    ).toEqual([]);
    expect(
      removed,
      'Nothing raises these codes any more. Remove them from integration-check-failures.json.',
    ).toEqual([]);
  });

  it('reads the codes a module raises, under every name', () => {
    expect(
      [
        ...codesIn(
          [
            "import {issueError as error} from './x.mjs';",
            "const DUPLICATE = 'duplicate_thing';",
            "error('first_code', 'm'); issueWarning(DUPLICATE, 'm');",
            "error(found ? 'ternary_one' : 'ternary_two', 'm');",
            "/** @property {'typed_code_one' | 'typed_code_two'} code */",
            "issues.push({code: 'second_code', severity: 'warning'});",
            "x = {code: e.code ?? 'fallback_code'};",
            "addErrors(issues, errors, 'added_code');",
            "/** @typedef {'not_in_code' | 'type_mismatch'} DriftKind */",
            "/** @typedef {'page' | 'block'} TemplateKind */",
          ].join('\n'),
        ),
      ].sort(),
    ).toEqual([
      'added_code',
      'duplicate_thing',
      'fallback_code',
      'first_code',
      'not_in_code',
      'second_code',
      'ternary_one',
      'ternary_two',
      'type_mismatch',
      'typed_code_one',
      'typed_code_two',
    ]);
  });
});
