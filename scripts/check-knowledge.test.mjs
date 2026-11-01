// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {
  composeKnowledgeSchemas,
  collectConcernMatches,
  collectGlobalReviewMatches,
  discoverKnowledgeRecords,
  extractKnowledgeClaims,
  matchesPathPattern,
  parseAnatomyThemingBlock,
  parseDesignDecisionsBlock,
  parseKnowledgeDocument,
  parsePathApplicabilityBlock,
  parseReviewApplicabilityBlock,
  routeGlobalReviewBaselinesAtRevision,
  validateAnatomyThemingMap,
  validateDesignDecisionsBlock,
  validateDelegations,
  validateKnowledgeRoot,
  validatePathApplicability,
  validateReviewApplicability,
  validateSchemaEvolution,
} from './check-knowledge.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const roots = [];

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-knowledge-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'docs/schemas/knowledge'), {recursive: true});
  fs.mkdirSync(path.join(root, 'docs/templates'), {recursive: true});
  fs.cpSync(
    path.join(repoRoot, 'docs/templates/knowledge'),
    path.join(root, 'docs/templates/knowledge'),
    {recursive: true},
  );
  for (const version of ['v1.json', 'v2.json', 'v3.json', 'v4.json']) {
    fs.copyFileSync(
      path.join(repoRoot, `docs/schemas/knowledge/${version}`),
      path.join(root, `docs/schemas/knowledge/${version}`),
    );
  }
  for (const relative of [
    'docs/specs',
    'docs/families',
    'docs/architecture',
    'docs/themes',
    'packages/core/src',
    'packages/lab/src',
    'packages/charts/src',
    'packages/richtext/src',
    'packages/vega/src',
  ]) {
    fs.mkdirSync(path.join(root, relative), {recursive: true});
  }
  for (const relative of [
    'packages/themes/neutral',
    'packages/themes/duplicate',
  ]) {
    fs.mkdirSync(path.join(root, relative), {recursive: true});
  }
  fs.mkdirSync(path.join(root, '.github'), {recursive: true});
  for (const ownerFile of ['DESIGNOWNERS', 'ENGOWNERS']) {
    fs.copyFileSync(
      path.join(repoRoot, `.github/${ownerFile}`),
      path.join(root, `.github/${ownerFile}`),
    );
  }
  return root;
}

function addSchemaVersion(root, version) {
  const latest = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/schemas/knowledge/v1.json'), 'utf8'),
  );
  latest.schemaVersion = version;
  fs.writeFileSync(
    path.join(root, `docs/schemas/knowledge/v${version}.json`),
    `${JSON.stringify(latest, null, 2)}\n`,
  );
}

function componentRecord(overrides = {}) {
  const values = {
    schema_version: '3',
    template_version: '1',
    kind: 'component',
    id: 'component:Button',
    authority: 'draft',
    archive_reason: 'null',
    superseded_by: 'null',
    approved_by: 'null',
    approved_at: 'null',
    owners: '[owner]',
    review_triggers: '[behavior]',
    verified_by: '[Button.test.tsx]',
    modules: '[]',
    families: '[family:actions]',
    design_specs: '[design:actions]',
    architecture: '[architecture:components]',
    contributing: '[contributing:api]',
    system_specs: '[]',
    ...overrides,
  };
  const frontmatter = Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const sections = [
    'Intent',
    'Compatibility and migration',
    'Ownership boundary',
    'Public concepts',
    'Behavioral and layout contract',
    'Accessibility contract',
    'Design relationships',
    'Family and system relationships',
    'Verification map',
    'Decision log',
    'Open questions',
    'Content boundary',
  ]
    .map(section => `## ${section}\n\nBody.`)
    .join('\n\n');
  return `---\n${frontmatter}\n---\n\n# Button component contract\n\n${sections}\n`;
}

function moduleRecord(overrides = {}) {
  const values = {
    schema_version: '3',
    template_version: '1',
    kind: 'module',
    id: 'module:Button/useButtonThing',
    authority: 'draft',
    archive_reason: 'null',
    superseded_by: 'null',
    approved_by: 'null',
    approved_at: 'null',
    owners: '[owner]',
    review_triggers: '[public-api,behavior,accessibility]',
    verified_by: '[useButtonThing.test.ts]',
    parent_component: 'component:Button',
    references: '[]',
    ...overrides,
  };
  const frontmatter = Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const sections = [
    'Intent',
    'Compatibility and migration',
    'Ownership boundary',
    'Public API and concepts',
    'Behavioral contract',
    'Accessibility contract',
    'Design relationships',
    'Parent and system relationships',
    'Verification map',
    'Decision log',
    'Open questions',
    'Content boundary',
  ]
    .map(section => `## ${section}\n\nBody.`)
    .join('\n\n');
  return `---\n${frontmatter}\n---\n\n# Button module contract\n\n${sections}\n`;
}

function themeRecord(overrides = {}) {
  const values = {
    schema_version: '2',
    template_version: '1',
    kind: 'theme',
    id: 'theme:neutral',
    authority: 'draft',
    approved_by: 'null',
    approved_at: 'null',
    review_triggers: '[tokens]',
    verified_by: '[theme.test.ts]',
    package: "'@astryxdesign/theme-neutral'",
    source_theme: 'packages/themes/neutral/src/neutralTheme.ts',
    references: '[architecture:theme-test]',
    ...overrides,
  };
  const frontmatter = Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const sections = [
    'Intent and audience',
    'Inheritance and base',
    'Portable token overrides',
    'Theme-local role definitions',
    'Tonal palette definitions',
    'Component and state mappings',
    'Compatibility and migration',
    'Accessibility and contrast evidence',
    'Build and artifact contract',
    'Verification map',
    'Decision log',
    'Open questions',
    'Content boundary',
  ]
    .map(section => `## ${section}\n\nBody.`)
    .join('\n\n');
  return `---\n${frontmatter}\n---\n\n# Neutral theme specification\n\n${sections}\n`;
}

function systemSpecRecord(overrides = {}) {
  const values = {
    schema_version: '4',
    template_version: '1',
    kind: 'system-spec',
    id: 'spec:AST-900',
    authority: 'current',
    archive_reason: 'null',
    superseded_by: 'null',
    approved_by: 'cixzhang',
    approved_at: '2026-08-31',
    phase: 'accepted',
    owners: '[cixzhang]',
    affects_architecture: '[]',
    affects_families: '[]',
    affects_contributing: '[]',
    affects_consumer_docs: '[]',
    ...overrides,
  };
  const frontmatter = Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const sections = [
    'Intent',
    'Non-goals',
    'Requirements',
    'Current-state impact',
    'Verification',
    'Decision log',
    'Open questions',
  ]
    .map(section => `## ${section}\n\nBody.`)
    .join('\n\n');
  return `---\n${frontmatter}\n---\n\n# Fixture system spec\n\n${sections}\n`;
}

function writeSystemSpec(root, directoryName, record) {
  const directory = path.join(root, `docs/specs/${directoryName}`);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'spec.md'), record);
}

function writeCurrentArchitecture(root) {
  const template = fs.readFileSync(
    path.join(root, 'docs/templates/knowledge/architecture.md'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, 'docs/architecture/theme-test.md'),
    template
      .replace('id: architecture:<surface>', 'id: architecture:theme-test')
      .replace('authority: draft', 'authority: current')
      .replace('approved_by: null', 'approved_by: cixzhang')
      .replace('approved_at: null', 'approved_at: 2026-08-31'),
  );
}

function anatomyThemingBlock(mapping) {
  return `### Theming anatomy\n\n<!-- anatomy-theming:v1 -->\n\`\`\`json\n${JSON.stringify(mapping, null, 2)}\n\`\`\``;
}

function withAnatomyTheming(record, mapping) {
  return record.replace(
    '## Design relationships\n\nBody.',
    `## Design relationships\n\nBody.\n\n${anatomyThemingBlock(mapping)}`,
  );
}

function writeButtonDoc(directory) {
  const content = `export const docs = {
  name: 'Button',
  displayName: 'Button',
  category: 'Actions',
  keywords: ['button'],
  props: [],
  usage: {
    anatomy: [
      {name: 'Root', required: true, description: 'Painted surface.'},
      {name: 'Label', required: true, description: 'Visible label.'},
      {name: 'Icon', required: false, description: 'Shared icon.'},
      {name: 'Content', required: false, description: 'Consumer content.'},
    ],
    description: 'A button triggers an action. Use it for a discrete action.',
    bestPractices: [],
  },
  theming: {
    targets: [{className: 'astryx-button'}],
  },
};\n`;
  fs.writeFileSync(path.join(directory, 'Button.doc.mjs'), content);
  return content;
}

function reviewApplicabilityBlock(triggers, scope = 'global') {
  return `<!-- review-applicability:v1 -->\n\`\`\`json\n${JSON.stringify(
    {scope, triggers},
    null,
    2,
  )}\n\`\`\``;
}

function withReviewApplicability(record, triggers, scope = 'global') {
  const lines = record.split('\n');
  const titleIndex = lines.findIndex(line => line.startsWith('# '));
  lines.splice(
    titleIndex + 1,
    0,
    '',
    reviewApplicabilityBlock(triggers, scope),
  );
  return lines.join('\n');
}

function withSystemClaims(record) {
  return record.replace(
    '## Requirements\n\nBody.',
    '## Requirements\n\n- **FR1 — Public API stays stable.** Callers keep the same contract.\n\n- **FR2 — Evidence stays scoped.** Tests prove only this claim.',
  );
}

function commitFixture(root, message) {
  execFileSync('git', ['init', '-q'], {cwd: root});
  execFileSync('git', ['config', 'user.name', 'Fixture'], {cwd: root});
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], {
    cwd: root,
  });
  execFileSync('git', ['add', '.'], {cwd: root});
  execFileSync('git', ['commit', '-q', '-m', message], {cwd: root});
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

describe('global review applicability', () => {
  const currentRecord = withSystemClaims(systemSpecRecord());

  it('parses explicit trigger-to-claim routing', () => {
    const record = withReviewApplicability(currentRecord, {
      'public-api': ['FR1'],
      testing: ['FR2'],
    });
    const parsed = parseReviewApplicabilityBlock(record);
    expect(parsed.problems).toEqual([]);
    expect(parsed.config).toEqual({
      scope: 'global',
      triggers: {'public-api': ['FR1'], testing: ['FR2']},
    });
    expect(extractKnowledgeClaims(record)).toEqual(
      new Map([
        ['FR1', 'Public API stays stable.'],
        ['FR2', 'Evidence stays scoped.'],
      ]),
    );
    expect(validateReviewApplicability(parsed.config, record)).toEqual([]);
  });

  it.each([
    [
      'global routing without claims',
      {scope: 'global', triggers: {'public-api': []}},
      /non-empty claim list/,
    ],
    [
      'a stale claim reference',
      {scope: 'global', triggers: {'public-api': ['FR99']}},
      /references missing claim "FR99"/,
    ],
    [
      'a duplicate trigger and claim pair',
      {scope: 'global', triggers: {'public-api': ['FR1', 'FR1']}},
      /repeats claim "FR1"/,
    ],
    [
      'a malformed trigger',
      {scope: 'global', triggers: {'Public API': ['FR1']}},
      /must use lower-kebab-case/,
    ],
    [
      'an unsupported trigger',
      {scope: 'global', triggers: {'unknown-area': ['FR1']}},
      /is not a supported semantic trigger/,
    ],
    [
      'an unsupported scope',
      {scope: 'component', triggers: {'public-api': ['FR1']}},
      /scope must be "global"/,
    ],
  ])('rejects %s', (_name, config, expected) => {
    expect(
      validateReviewApplicability(config, currentRecord).join('\n'),
    ).toMatch(expected);
  });

  it('rejects duplicate JSON object keys before parsing can overwrite them', () => {
    const record = currentRecord.replace(
      '# Fixture system spec',
      '# Fixture system spec\n\n<!-- review-applicability:v1 -->\n```json\n{"scope":"global","triggers":{"public-api":["FR1"],"public-api":["FR2"]}}\n```',
    );
    expect(parseReviewApplicabilityBlock(record).problems.join('\n')).toMatch(
      /repeats JSON field "public-api"/,
    );
  });

  it('keeps the same key in two different objects', () => {
    const record = currentRecord.replace(
      '# Fixture system spec',
      '# Fixture system spec\n\n<!-- review-applicability:v1 -->\n```json\n{"scope":"global","concerns":{"a":{"names":["x"],"claims":["FR1"]},"b":{"names":["y"],"claims":["FR2"]}}}\n```',
    );
    const parsed = parseReviewApplicabilityBlock(record);
    expect(parsed.problems).toEqual([]);
    expect(validateReviewApplicability(parsed.config, record)).toEqual([]);
  });

  it('accepts a concerns map with or without triggers', () => {
    const concerns = {
      'slot-presence': {
        names: ['isRenderable'],
        patterns: ["typeof [\\w.]+ !== 'boolean'"],
        claims: ['FR1'],
      },
    };
    expect(
      validateReviewApplicability({scope: 'global', concerns}, currentRecord),
    ).toEqual([]);
    expect(
      validateReviewApplicability(
        {scope: 'global', triggers: {'public-api': ['FR2']}, concerns},
        currentRecord,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'neither triggers nor concerns',
      {scope: 'global'},
      /triggers, concerns, or both/,
    ],
    [
      'an unknown block key',
      {
        scope: 'global',
        concerns: {a: {names: ['x'], claims: ['FR1']}},
        extra: 1,
      },
      /and nothing else/,
    ],
    [
      'an empty concerns map',
      {scope: 'global', concerns: {}},
      /at least one concern/,
    ],
    [
      'a concern without names or patterns',
      {scope: 'global', concerns: {a: {claims: ['FR1']}}},
      /at least one name or pattern/,
    ],
    [
      'a concern name that is not an identifier',
      {
        scope: 'global',
        concerns: {a: {names: ['is renderable'], claims: ['FR1']}},
      },
      /not an identifier/,
    ],
    [
      'an invalid pattern',
      {scope: 'global', concerns: {a: {patterns: ['('], claims: ['FR1']}}},
      /invalid pattern/,
    ],
    [
      'a concern claim the record lacks',
      {scope: 'global', concerns: {a: {names: ['x'], claims: ['FR99']}}},
      /references missing claim "FR99"/,
    ],
    [
      'an unknown concern key',
      {
        scope: 'global',
        concerns: {a: {names: ['x'], claims: ['FR1'], owner: 'y'}},
      },
      /claims with names, patterns, or both/,
    ],
  ])('rejects concerns with %s', (_name, config, expected) => {
    expect(
      validateReviewApplicability(config, currentRecord).join('\n'),
    ).toMatch(expected);
  });

  it('routes each claim whose concern matches an added line, with the evidence', () => {
    const record = {
      path: 'docs/specs/AST-900/spec.md',
      content: currentRecord.replace(
        '# Fixture system spec',
        `# Fixture system spec\n\n<!-- review-applicability:v1 -->\n\n\`\`\`json\n${JSON.stringify(
          {
            scope: 'global',
            concerns: {
              'slot-presence': {
                names: ['isRenderable'],
                patterns: ["typeof [\\w.]+ !== 'boolean'"],
                claims: ['FR1'],
              },
              'unrelated-concern': {names: ['useScrollLock'], claims: ['FR2']},
            },
          },
        )}\n\`\`\`\n`,
      ),
    };
    const added = [
      {
        file: 'packages/core/src/Badge/Badge.tsx',
        line: 3,
        text: 'const x = 1;',
      },
      {
        file: 'packages/core/src/Badge/Badge.tsx',
        line: 4,
        text: "  const hasLabel = label !== '' && label != null && typeof label !== 'boolean';",
      },
      {
        file: 'packages/core/src/Badge/Badge.tsx',
        line: 5,
        text: 'isRenderableish(x);',
      },
    ];
    const matches = collectConcernMatches([record], added, null);
    expect(matches).toEqual([
      expect.objectContaining({
        recordId: 'spec:AST-900',
        concern: 'slot-presence',
        claimId: 'FR1',
        claim: 'Public API stays stable.',
        utilities: ['isRenderable'],
        evidence: [
          expect.objectContaining({
            line: 4,
            matched: "typeof label !== 'boolean'",
          }),
        ],
      }),
    ]);
    expect(matches[0].matchReason).toContain('(shared: isRenderable)');
    expect(collectConcernMatches([record], [], null)).toEqual([]);
  });

  it('keeps the canonical claim title when a verification table repeats its id', () => {
    const record = `${currentRecord}\n| Contract | Verification |\n| --- | --- |\n| FR1 | A test file, not the claim. |\n`;
    expect(extractKnowledgeClaims(record).get('FR1')).toBe(
      'Public API stays stable.',
    );
  });

  it('does not treat a verification-table reference as a claim definition', () => {
    const record = withReviewApplicability(
      `${currentRecord.replace(
        '- **FR1 — Public API stays stable.** Callers keep the same contract.\n\n',
        '',
      )}\n| Contract | Verification |\n| --- | --- |\n| FR1 | A test file, not the claim. |\n`,
      {'public-api': ['FR1']},
    );
    const parsed = parseReviewApplicabilityBlock(record);
    expect(
      validateReviewApplicability(parsed.config, record).join('\n'),
    ).toMatch(/references missing claim "FR1"/);
  });

  it('keeps legacy records with no applicability block valid', async () => {
    const root = fixtureRoot();
    writeSystemSpec(root, 'AST-900', currentRecord);
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('fails knowledge validation for malformed global routing', async () => {
    const root = fixtureRoot();
    writeSystemSpec(
      root,
      'AST-900',
      withReviewApplicability(currentRecord, {'public-api': ['FR99']}),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /references missing claim "FR99"/,
    );
  });

  it('routes only matching claims from current records', () => {
    const record = withReviewApplicability(currentRecord, {
      'public-api': ['FR1'],
      testing: ['FR2'],
    });
    const matches = collectGlobalReviewMatches(
      [{path: 'docs/specs/AST-900/spec.md', content: record}],
      ['public-api'],
      'a'.repeat(40),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      recordId: 'spec:AST-900',
      path: 'docs/specs/AST-900/spec.md',
      trigger: 'public-api',
      claimId: 'FR1',
      claim: 'Public API stays stable.',
      authorityCommit: 'a'.repeat(40),
    });
    expect(matches[0].matchReason).toContain('public-api');
    expect(matches[0].matchReason).toContain('spec:AST-900/FR1');
    expect(matches[0].recordDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('omits nonmatching and draft records', () => {
    const current = withReviewApplicability(currentRecord, {
      'public-api': ['FR1'],
    });
    const draft = withReviewApplicability(
      currentRecord.replace('authority: current', 'authority: draft'),
      {testing: ['FR2']},
    );
    expect(
      collectGlobalReviewMatches(
        [
          {path: 'docs/specs/AST-900/spec.md', content: current},
          {path: 'docs/specs/AST-901/spec.md', content: draft},
        ],
        ['testing'],
        'b'.repeat(40),
      ),
    ).toEqual([]);
  });

  it('pins routing to the reviewed head base and rejects self-authorization', () => {
    const root = fixtureRoot();
    writeSystemSpec(root, 'AST-900', currentRecord);
    const baseWithoutRouting = commitFixture(
      root,
      'base without global routing',
    );
    execFileSync(
      'git',
      ['update-ref', 'refs/remotes/origin/main', baseWithoutRouting],
      {cwd: root},
    );

    fs.writeFileSync(
      path.join(root, 'docs/specs/AST-900/spec.md'),
      withReviewApplicability(currentRecord, {'public-api': ['FR1']}),
    );
    execFileSync('git', ['add', '.'], {cwd: root});
    execFileSync('git', ['commit', '-q', '-m', 'head adds global routing'], {
      cwd: root,
    });
    const proposedHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();

    expect(
      routeGlobalReviewBaselinesAtRevision(
        root,
        baseWithoutRouting,
        proposedHead,
        ['public-api'],
      ),
    ).toEqual([]);
    expect(() =>
      routeGlobalReviewBaselinesAtRevision(root, proposedHead, proposedHead, [
        'public-api',
      ]),
    ).toThrow(/review head must differ/);

    execFileSync(
      'git',
      ['update-ref', 'refs/remotes/origin/main', proposedHead],
      {
        cwd: root,
      },
    );
    expect(() =>
      routeGlobalReviewBaselinesAtRevision(root, proposedHead, proposedHead, [
        'public-api',
      ]),
    ).toThrow(/review head must differ/);

    fs.writeFileSync(path.join(root, 'README.md'), '# Reviewed change\n');
    execFileSync('git', ['add', '.'], {cwd: root});
    execFileSync('git', ['commit', '-q', '-m', 'later review head'], {
      cwd: root,
    });
    const laterHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    expect(
      routeGlobalReviewBaselinesAtRevision(root, proposedHead, laterHead, [
        'public-api',
      ]),
    ).toHaveLength(1);
    expect(() =>
      routeGlobalReviewBaselinesAtRevision(
        root,
        baseWithoutRouting,
        laterHead,
        ['public-api'],
      ),
    ).toThrow(/origin\/main merge base/);
  });

  it('sorts multiple matches deterministically', () => {
    const first = withReviewApplicability(
      withSystemClaims(systemSpecRecord({id: 'spec:AST-902'})),
      {testing: ['FR2'], 'public-api': ['FR1']},
    );
    const second = withReviewApplicability(
      withSystemClaims(systemSpecRecord({id: 'spec:AST-901'})),
      {'public-api': ['FR1']},
    );
    const matches = collectGlobalReviewMatches(
      [
        {path: 'docs/specs/AST-902/spec.md', content: first},
        {path: 'docs/specs/AST-901/spec.md', content: second},
      ],
      ['testing', 'public-api'],
      'c'.repeat(40),
    );
    expect(
      matches.map(row => `${row.recordId}:${row.trigger}:${row.claimId}`),
    ).toEqual([
      'spec:AST-901:public-api:FR1',
      'spec:AST-902:public-api:FR1',
      'spec:AST-902:testing:FR2',
    ]);
  });
});

describe('schema evolution', () => {
  it('tracks latest schema versions per kind', () => {
    const raw = new Map([
      [
        1,
        {
          schema: {schemaVersion: 1, kinds: {component: {marker: 'v1'}}},
          schemaPath: 'v1.json',
        },
      ],
      [
        2,
        {
          schema: {
            schemaVersion: 2,
            extends: 1,
            kinds: {theme: {marker: 'v2'}},
          },
          schemaPath: 'v2.json',
        },
      ],
      [
        3,
        {
          schema: {
            schemaVersion: 3,
            extends: 2,
            kinds: {component: {marker: 'v3'}},
          },
          schemaPath: 'v3.json',
        },
      ],
    ]);
    const {schemas, latestKindVersions} = composeKnowledgeSchemas(raw);
    expect(schemas.get(2).schema.kinds.component.marker).toBe('v1');
    expect(schemas.get(2).schema.kinds.theme.marker).toBe('v2');
    expect(latestKindVersions.get('theme')).toBe(2);
    expect(latestKindVersions.get('component')).toBe(3);
  });

  it('allows appending a higher schema version', () => {
    expect(
      validateSchemaEvolution(
        new Map([['docs/schemas/knowledge/v1.json', 'one']]),
        new Map([
          ['docs/schemas/knowledge/v1.json', 'one'],
          ['docs/schemas/knowledge/v2.json', 'two'],
        ]),
      ),
    ).toEqual([]);
  });

  it('rejects rewriting or deleting a published schema version', () => {
    expect(
      validateSchemaEvolution(
        new Map([
          ['docs/schemas/knowledge/v1.json', 'one'],
          ['docs/schemas/knowledge/v2.json', 'two'],
        ]),
        new Map([['docs/schemas/knowledge/v1.json', 'changed']]),
      ).join('\n'),
    ).toMatch(/immutable.*append-only/s);
  });
});

describe('component-local design decisions', () => {
  const row =
    '| DD1 | Keep the label visually quiet. | Preserve primary-action emphasis. | Default label | Theme token substitutions may preserve contrast. |';
  const block = `${[
    '### Design decisions',
    '',
    '<!-- design-decisions:v1 -->',
    '',
    '| ID | Decision | Intent or reason | Applies to | Allowed variation |',
    '| --- | --- | --- | --- | --- |',
    row,
  ].join('\n')}\n`;

  it('parses a valid optional table under Design relationships', () => {
    const parsed = parseDesignDecisionsBlock(
      `## Design relationships\n\nBody.\n\n${block}\n### Theming anatomy\n`,
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].id).toBe('DD1');
    expect(validateDesignDecisionsBlock(parsed)).toEqual([]);
  });

  it('keeps absence valid and permits header-only template guidance', () => {
    expect(
      validateDesignDecisionsBlock(
        parseDesignDecisionsBlock('## Design relationships\n\nBody.\n'),
      ),
    ).toEqual([]);
    const headerOnly = parseDesignDecisionsBlock(
      `## Design relationships\n\n${block.replace(`\n${row}`, '')}`,
    );
    expect(
      validateDesignDecisionsBlock(headerOnly, {allowHeaderOnly: true}),
    ).toEqual([]);
  });

  it('keeps the optional header-only table in component and module templates', () => {
    for (const template of ['component-spec.md', 'module-spec.md']) {
      const parsed = parseDesignDecisionsBlock(
        fs.readFileSync(
          path.join(repoRoot, 'docs/templates/knowledge', template),
          'utf8',
        ),
        template,
      );
      expect(parsed.present, template).toBe(true);
      expect(parsed.rows, template).toEqual([]);
      expect(
        validateDesignDecisionsBlock(parsed, {allowHeaderOnly: true}),
        template,
      ).toEqual([]);
    }
  });

  it('rejects malformed, empty, and duplicate authored rows', () => {
    const malformed = block
      .replace('Intent or reason', 'Rationale')
      .replace(row, `${row}\n${row.replace('DD1', 'bad')}`);
    const parsed = parseDesignDecisionsBlock(
      `## Design relationships\n\n${malformed}`,
      'Button.spec.md',
    );
    expect(validateDesignDecisionsBlock(parsed).join('\n')).toMatch(
      /columns must be exactly.*must match DD1/s,
    );
  });
});

describe('component theming anatomy metadata', () => {
  const contract = {
    anatomy: ['Root', 'Label', 'Icon', 'Content'],
    targets: ['button'],
  };
  const valid = {
    Root: {target: 'button'},
    Label: {inherits: 'button'},
    Icon: {delegatesTo: {owner: 'component:Icon', target: 'icon'}},
    Content: {
      none: {reason: 'intentional: The consumer owns this content.'},
    },
  };

  it('parses the optional versioned JSON block under Design relationships', () => {
    expect(
      parseAnatomyThemingBlock(
        `## Design relationships\n\n${anatomyThemingBlock(valid)}`,
      ).mapping,
    ).toEqual(valid);
    expect(parseAnatomyThemingBlock('## Design relationships\n').mapping).toBe(
      null,
    );
  });

  it('rejects the structured block outside its existing level-two section', () => {
    expect(
      parseAnatomyThemingBlock(
        `## Public concepts\n\n${anatomyThemingBlock(valid)}`,
      ).problems.join('\n'),
    ).toMatch(/subsection of "Design relationships"/);
  });

  it('accepts exactly one complete disposition per documented anatomy part', () => {
    expect(validateAnatomyThemingMap(valid, contract)).toEqual([]);
  });

  it('accepts every classified none reason', () => {
    for (const classification of [
      'intentional',
      'reachability-gap',
      'unsettled',
    ]) {
      expect(
        validateAnatomyThemingMap(
          {
            ...valid,
            Content: {
              none: {reason: `${classification}: Current factual state.`},
            },
          },
          contract,
        ),
      ).toEqual([]);
    }
  });

  it.each([
    [
      'multiple dispositions',
      {...valid, Root: {target: 'button', inherits: 'button'}},
      /exactly one/,
    ],
    [
      'missing delegated owner',
      {...valid, Icon: {delegatesTo: {target: 'icon'}}},
      /requires exactly owner and target/,
    ],
    [
      'missing delegated target',
      {...valid, Icon: {delegatesTo: {owner: 'component:Icon'}}},
      /requires exactly owner and target/,
    ],
    [
      'missing none reason',
      {...valid, Content: {none: {}}},
      /requires a non-empty reason/,
    ],
    [
      'unclassified none reason',
      {...valid, Content: {none: {reason: 'The consumer owns this content.'}}},
      /must start with intentional:, reachability-gap:, or unsettled:/,
    ],
    [
      'prefixed target',
      {...valid, Root: {target: 'astryx-button'}},
      /omit the "astryx-" prefix/,
    ],
    [
      'non-kebab target',
      {...valid, Root: {target: 'Button_Root'}},
      /use kebab-case/,
    ],
  ])('rejects %s', (_name, mapping, expected) => {
    expect(validateAnatomyThemingMap(mapping, contract).join('\n')).toMatch(
      expected,
    );
  });

  it('requires exact anatomy names and coverage of current local targets', () => {
    const result = validateAnatomyThemingMap(
      {
        Label: {inherits: 'button'},
        Icon: {delegatesTo: {owner: 'component:Icon', target: 'icon'}},
        Content: {none: {reason: 'intentional: Consumer owned.'}},
        Unknown: {none: {reason: 'unsettled: Not real.'}},
      },
      contract,
    ).join('\n');
    expect(result).toMatch(/missing Root/);
    expect(result).toMatch(/unknown Unknown/);
    expect(result).toMatch(/current target "button" has no anatomy entry/);
  });

  it('validates an opted-in spec without changing consumer doc bytes', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    const consumerDoc = writeButtonDoc(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      withAnatomyTheming(componentRecord(), {
        ...valid,
        Icon: {none: {reason: 'intentional: Fixture-owned icon.'}},
      }),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
    expect(
      fs.readFileSync(path.join(directory, 'Button.doc.mjs'), 'utf8'),
    ).toBe(consumerDoc);
  });

  it('keeps the block optional while existing specs migrate', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'Button.spec.md'), componentRecord());
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });
});

describe('component delegation ownership', () => {
  const canonicalTargets = [
    {component: 'Button', key: 'button'},
    {component: 'Icon', key: 'icon'},
    {component: 'Indicator', key: 'radio'},
    {component: 'RadioList', key: 'radio'},
    {component: 'Table', key: 'table-header'},
  ];
  const valid = {
    filePath: 'packages/core/src/Example/Example.spec.md',
    anatomy: 'Icon',
    owner: 'component:Icon',
    target: 'icon',
  };

  it('rejects an unknown owner with the complete delegation location', () => {
    const problems = validateDelegations(
      [{...valid, owner: 'component:Missing'}],
      canonicalTargets,
    ).join('\n');
    expect(problems).toContain(valid.filePath);
    expect(problems).toContain('theming anatomy "Icon".delegatesTo');
    expect(problems).toContain('owner "component:Missing"');
    expect(problems).toContain('target "icon"');
  });

  it('rejects a missing active target under an existing owner', () => {
    const problems = validateDelegations(
      [{...valid, target: 'glyph'}],
      canonicalTargets,
    ).join('\n');
    expect(problems).toContain('target "glyph"');
    expect(problems).toContain('owned by "component:Icon"');
    expect(problems).toContain('active targets for that owner: "icon"');
  });

  it('accepts a parent-owned member target only under its canonical owner', () => {
    expect(
      validateDelegations(
        [
          {
            ...valid,
            anatomy: 'Header',
            owner: 'component:Table',
            target: 'table-header',
          },
        ],
        canonicalTargets,
      ),
    ).toEqual([]);
    const problems = validateDelegations(
      [
        {
          ...valid,
          anatomy: 'Header',
          owner: 'component:TableHeader',
          target: 'table-header',
        },
      ],
      canonicalTargets,
    ).join('\n');
    expect(problems).toContain('"component:TableHeader"');
    expect(problems).toContain('target "table-header"');
    expect(problems).toContain(
      'canonical owner for target "table-header": "component:Table"',
    );
  });

  it('does not accept a target merely because unrelated owners share its name', () => {
    expect(
      validateDelegations(
        [
          {...valid, owner: 'component:Indicator', target: 'radio'},
          {...valid, owner: 'component:RadioList', target: 'radio'},
        ],
        canonicalTargets,
      ),
    ).toEqual([]);
    expect(
      validateDelegations(
        [{...valid, owner: 'component:Button', target: 'radio'}],
        canonicalTargets,
      ).join('\n'),
    ).toMatch(
      /radio.*component:Button.*button.*component:Indicator.*component:RadioList/,
    );
  });

  it('accepts a target owned by a member of an active family', () => {
    const families = new Map([
      [
        'family:actions',
        {
          filePath: 'docs/families/actions.md',
          members: ['component:Button', 'component:Icon'],
        },
      ],
    ]);
    expect(
      validateDelegations(
        [{...valid, owner: 'family:actions'}],
        canonicalTargets,
        families,
      ),
    ).toEqual([]);
  });

  it('rejects an unknown or inactive family owner', () => {
    const problems = validateDelegations(
      [{...valid, owner: 'family:missing'}],
      canonicalTargets,
      new Map(),
    ).join('\n');
    expect(problems).toContain('owner "family:missing"');
    expect(problems).toContain('active family record');
    expect(problems).toContain('target "icon"');
  });

  it('rejects a family target that none of its members owns', () => {
    const families = new Map([
      [
        'family:actions',
        {
          filePath: 'docs/families/actions.md',
          members: ['component:Button'],
        },
      ],
    ]);
    const problems = validateDelegations(
      [{...valid, owner: 'family:actions'}],
      canonicalTargets,
      families,
    ).join('\n');
    expect(problems).toContain('target "icon"');
    expect(problems).toContain('family:actions');
    expect(problems).toContain('docs/families/actions.md');
    expect(problems).toContain(
      'canonical owner for target "icon": "component:Icon"',
    );
  });

  it('matches shared target names only to members of the named family', () => {
    const families = new Map([
      [
        'family:selection',
        {
          filePath: 'docs/families/selection.md',
          members: ['component:Indicator'],
        },
      ],
      [
        'family:actions',
        {
          filePath: 'docs/families/actions.md',
          members: ['component:Button'],
        },
      ],
    ]);
    expect(
      validateDelegations(
        [{...valid, owner: 'family:selection', target: 'radio'}],
        canonicalTargets,
        families,
      ),
    ).toEqual([]);
    const problems = validateDelegations(
      [{...valid, owner: 'family:actions', target: 'radio'}],
      canonicalTargets,
      families,
    ).join('\n');
    expect(problems).toContain('family:actions');
    expect(problems).toContain('"component:Indicator", "component:RadioList"');
  });

  it.each([
    ['draft', {}],
    [
      'current',
      {
        authority: 'current',
        approved_by: 'cixzhang',
        approved_at: '2026-08-30',
      },
    ],
  ])(
    'rejects an invalid delegation from an active %s record end to end',
    async (authority, overrides) => {
      const root = fixtureRoot();
      const directory = path.join(root, 'packages/core/src/Button');
      fs.mkdirSync(directory);
      writeButtonDoc(directory);
      fs.writeFileSync(
        path.join(directory, 'Button.spec.md'),
        withAnatomyTheming(componentRecord(overrides), {
          Root: {target: 'button'},
          Label: {inherits: 'button'},
          Icon: {
            delegatesTo: {
              owner:
                authority === 'draft' ? 'component:Missing' : 'family:missing',
              target: 'icon',
            },
          },
          Content: {
            none: {reason: 'intentional: Consumer-owned content.'},
          },
        }),
      );

      const problems = (await validateKnowledgeRoot(root)).join('\n');
      expect(problems).toContain('theming anatomy "Icon".delegatesTo');
      expect(problems).toContain(
        authority === 'draft' ? 'component:Missing' : 'family:missing',
      );
    },
  );

  it('does not validate delegations from archived records', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    writeButtonDoc(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      withAnatomyTheming(
        componentRecord({
          authority: 'archived',
          archive_reason: 'historical',
        }),
        {
          Root: {target: 'button'},
          Label: {inherits: 'button'},
          Icon: {
            delegatesTo: {owner: 'family:missing', target: 'icon'},
          },
          Content: {
            none: {reason: 'intentional: Consumer-owned content.'},
          },
        },
      ),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('accepts every authored delegation in the existing records', async () => {
    expect(await validateKnowledgeRoot(repoRoot)).toEqual([]);
  }, 60_000);
});

describe('knowledge validation', () => {
  it('parses only top-level frontmatter and level-two sections', () => {
    const document = parseKnowledgeDocument(
      '---\nschema_version: 1\nowners:\n  [\n    one,\n    two,\n  ]\n---\n\n## Intent\n',
    );
    expect(document.frontmatter.get('schema_version')).toBe(1);
    expect(document.frontmatter.get('owners')).toEqual(['one', 'two']);
    expect(document.sections).toEqual(['Intent']);
  });

  it('accepts aligned templates with no records', async () => {
    expect(await validateKnowledgeRoot(fixtureRoot())).toEqual([]);
  });

  it('uses the reader-first projection only in architecture, component, and module templates', () => {
    const readerFirstTemplates = new Map([
      [
        'architecture.md',
        [
          'Governing contract',
          'System behavior',
          'End-user impact',
          'Builder impact',
          'Compatibility/readiness',
          'Review checks',
          'Governing rules',
        ],
      ],
      [
        'component-spec.md',
        [
          'Public contract',
          'Behavior',
          'End-user impact',
          'Builder impact',
          'Compatibility/readiness',
          'Review checks',
          'Governing rules',
        ],
      ],
      [
        'module-spec.md',
        [
          'Public contract',
          'Behavior',
          'End-user impact',
          'Builder impact',
          'Compatibility/readiness',
          'Review checks',
          'Governing rules',
        ],
      ],
    ]);

    for (const [fileName, projectionRows] of readerFirstTemplates) {
      const content = fs.readFileSync(
        path.join(repoRoot, 'docs/templates/knowledge', fileName),
        'utf8',
      );
      expect(parseKnowledgeDocument(content).sections[0]).toBe(
        'Contract at a glance',
      );
      for (const row of projectionRows) {
        expect(
          content
            .split('\n')
            .some(line => line.trimStart().startsWith(`| ${row} `)),
        ).toBe(true);
      }
      expect(content).toContain(
        'This table is a review projection; the body below is authoritative.',
      );
    }

    for (const fileName of [
      'design-spec.md',
      'family-contract.md',
      'implementation-plan.md',
      'system-spec.md',
      'theme-spec.md',
    ]) {
      const content = fs.readFileSync(
        path.join(repoRoot, 'docs/templates/knowledge', fileName),
        'utf8',
      );
      expect(parseKnowledgeDocument(content).sections).not.toContain(
        'Contract at a glance',
      );
    }
  });

  it('accepts an optional reader-first projection in an older record', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord().replace(
        '## Intent',
        '## Contract at a glance\n\nProjection.\n\n## Intent',
      ),
    );
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects a structural template change without a schema update', async () => {
    const root = fixtureRoot();
    const template = path.join(
      root,
      'docs/templates/knowledge/component-spec.md',
    );
    fs.appendFileSync(template, '\n## Undeclared section\n');
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /template section order must exactly match the schema plus its allowed editorial sections/,
    );
  });

  it('rejects a schema whose filename and declared version disagree', async () => {
    const root = fixtureRoot();
    const schemaPath = path.join(root, 'docs/schemas/knowledge/v1.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    schema.schemaVersion = 2;
    fs.writeFileSync(schemaPath, `${JSON.stringify(schema)}\n`);
    await expect(validateKnowledgeRoot(root)).rejects.toThrow(
      /declares schemaVersion 2/,
    );
  });

  it('accepts a draft component record on the current schema', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'Button.spec.md'), componentRecord());
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('accepts a draft component record in a flat component package', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/vega/src');
    fs.writeFileSync(
      path.join(directory, 'index.ts'),
      "export {VegaChart} from './VegaChart';\n",
    );
    fs.writeFileSync(
      path.join(directory, 'VegaChart.tsx'),
      'export function VegaChart() {}\n',
    );
    fs.writeFileSync(
      path.join(directory, 'VegaChart.spec.md'),
      componentRecord({id: 'component:VegaChart'}),
    );
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects a flat-package spec with no matching public component', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/charts/src');
    fs.writeFileSync(
      path.join(directory, 'index.ts'),
      "export {Chart} from './Chart';\n",
    );
    fs.writeFileSync(
      path.join(directory, 'Chart.tsx'),
      'export function Chart() {}\n',
    );
    fs.writeFileSync(
      path.join(directory, 'Ghost.spec.md'),
      componentRecord({id: 'component:Ghost'}),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /must match a public named export and TSX module/,
    );
  });

  it('accepts a flat-package module beneath its declared parent component', async () => {
    const root = fixtureRoot();
    const source = path.join(root, 'packages/charts/src');
    const modulePath = path.join(source, 'Chart/plugins/useChartThing.spec.md');
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(source, 'index.ts'),
      "export {Chart} from './Chart';\n",
    );
    fs.writeFileSync(
      path.join(source, 'Chart.tsx'),
      'export function Chart() {}\n',
    );
    fs.writeFileSync(
      path.join(source, 'Chart.spec.md'),
      componentRecord({
        id: 'component:Chart',
        modules: '[module:Chart/useChartThing]',
      }),
    );
    fs.writeFileSync(
      modulePath,
      moduleRecord({
        id: 'module:Chart/useChartThing',
        parent_component: 'component:Chart',
      }),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects a flat-package module beneath a different path root', async () => {
    const root = fixtureRoot();
    const source = path.join(root, 'packages/charts/src');
    const modulePath = path.join(source, 'Ghost/plugins/useChartThing.spec.md');
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(source, 'index.ts'),
      "export {Chart} from './Chart';\n",
    );
    fs.writeFileSync(
      path.join(source, 'Chart.tsx'),
      'export function Chart() {}\n',
    );
    fs.writeFileSync(
      path.join(source, 'Chart.spec.md'),
      componentRecord({
        id: 'component:Chart',
        modules: '[module:Chart/useChartThing]',
      }),
    );
    fs.writeFileSync(
      modulePath,
      moduleRecord({
        id: 'module:Chart/useChartThing',
        parent_component: 'component:Chart',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /flat-package module module:Chart\/useChartThing must live under packages\/charts\/src\/Chart\//,
    );
  });

  it('accepts a flat public member record backed by the root consumer doc', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/NavMenu');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'NavMenu.doc.mjs'),
      "export const docs = {name: 'NavHeadingMenu'};\n",
    );
    fs.writeFileSync(
      path.join(directory, 'NavHeadingMenu.spec.md'),
      componentRecord({id: 'component:NavHeadingMenu'}),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('accepts a flat public member record backed by a full inline consumer entry', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Table');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Table.doc.mjs'),
      `export const docs = {
  name: 'Table',
  components: [{name: 'TableRow', description: 'A public row.', props: []}],
};\n`,
    );
    fs.writeFileSync(
      path.join(directory, 'TableRow.spec.md'),
      componentRecord({id: 'component:TableRow'}),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects a flat component record unrelated to its component root', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    const parentDoc = writeButtonDoc(directory).replace(
      '  usage: {',
      "  components: [{name: 'Wrong', projection: {anatomy: []}}],\n  usage: {",
    );
    fs.writeFileSync(path.join(directory, 'Button.doc.mjs'), parentDoc);
    fs.writeFileSync(
      path.join(directory, 'Wrong.spec.md'),
      componentRecord({id: 'component:Wrong'}),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /flat component record component:Wrong must match component root "Button" or an exact public component entry/,
    );
  });

  it('discovers a nested module beside its flat parent and ignores non-record trees', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    const modulePath = path.join(
      componentDirectory,
      'plugins/thing/useButtonThing.spec.md',
    );
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Button/useButtonThing]'}),
    );
    fs.writeFileSync(modulePath, moduleRecord());

    const ignored = [
      '__fixtures__/fixture.spec.md',
      '__generated__/generated.spec.md',
      '__tests__/test.spec.md',
      '.hidden/hidden.spec.md',
      '.hidden.spec.md',
      'fixtures/fixture.spec.md',
      'generated/generated.spec.md',
      'node_modules/dependency.spec.md',
      'plugins/thing/snapshot.generated.spec.md',
    ];
    for (const relative of ignored) {
      const ignoredPath = path.join(componentDirectory, relative);
      fs.mkdirSync(path.dirname(ignoredPath), {recursive: true});
      fs.writeFileSync(ignoredPath, moduleRecord());
    }
    const topLevelIgnored = path.join(
      root,
      'packages/core/src/__tests__/TopLevel.spec.md',
    );
    fs.mkdirSync(path.dirname(topLevelIgnored), {recursive: true});
    fs.writeFileSync(topLevelIgnored, moduleRecord());

    const discovered = discoverKnowledgeRecords(root).map(filePath =>
      path.relative(root, filePath).split(path.sep).join('/'),
    );
    expect(discovered).toContain('packages/core/src/Button/Button.spec.md');
    expect(discovered).toContain(
      'packages/core/src/Button/plugins/thing/useButtonThing.spec.md',
    );
    for (const relative of ignored) {
      expect(discovered).not.toContain(`packages/core/src/Button/${relative}`);
    }
    expect(discovered).not.toContain(
      'packages/core/src/__tests__/TopLevel.spec.md',
    );
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects a nested component record instead of treating it as a module', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    const nestedPath = path.join(componentDirectory, 'notes/Extra.spec.md');
    fs.mkdirSync(path.dirname(nestedPath), {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord(),
    );
    fs.writeFileSync(nestedPath, componentRecord({id: 'component:Extra'}));

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /nested records use kind: module/,
    );
  });

  it('rejects a direct-child module record', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(componentDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Button/useButtonThing]'}),
    );
    fs.writeFileSync(
      path.join(componentDirectory, 'useButtonThing.spec.md'),
      moduleRecord(),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /module records must be nested beneath their component root/,
    );
  });

  it('rejects missing parent links and orphan module records', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    const modulePath = path.join(
      componentDirectory,
      'plugins/orphan/useOrphan.spec.md',
    );
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Button/useMissing]'}),
    );
    fs.writeFileSync(
      modulePath,
      moduleRecord({
        id: 'module:Button/useOrphan',
        parent_component: 'component:Button',
      }),
    );

    const problems = (await validateKnowledgeRoot(root)).join('\n');
    expect(problems).toMatch(
      /modules reference module:Button\/useMissing does not resolve/,
    );
    expect(problems).toMatch(/module module:Button\/useOrphan is orphaned/);
  });

  it('rejects mismatched parent declarations and component roots', async () => {
    const root = fixtureRoot();
    const buttonDirectory = path.join(root, 'packages/core/src/Button');
    const otherDirectory = path.join(root, 'packages/core/src/Other');
    const modulePath = path.join(
      otherDirectory,
      'plugins/thing/useButtonThing.spec.md',
    );
    fs.mkdirSync(buttonDirectory, {recursive: true});
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(buttonDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Other/useButtonThing]'}),
    );
    fs.writeFileSync(
      path.join(otherDirectory, 'Other.spec.md'),
      componentRecord({
        id: 'component:Other',
        modules: '[module:Other/useButtonThing]',
      }),
    );
    fs.writeFileSync(
      modulePath,
      moduleRecord({
        id: 'module:Other/useButtonThing',
        parent_component: 'component:Other',
      }),
    );

    const problems = (await validateKnowledgeRoot(root)).join('\n');
    expect(problems).toMatch(
      /Button\.spec\.md: modules reference module:Other\/useButtonThing, but that module declares parent_component "component:Other"/,
    );
    expect(problems).toMatch(/must live in the same component root/);
  });

  it('requires parent_component to resolve to a component record', async () => {
    const root = fixtureRoot();
    const familyTemplate = fs.readFileSync(
      path.join(root, 'docs/templates/knowledge/family-contract.md'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'docs/families/not-a-component.md'),
      familyTemplate.replace(
        'id: family:<family-name>',
        'id: component:Button',
      ),
    );
    const modulePath = path.join(
      root,
      'packages/core/src/Button/plugins/thing/useButtonThing.spec.md',
    );
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(modulePath, moduleRecord());

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /parent_component component:Button must resolve to a component record, not family/,
    );
  });

  it('requires parent module links to resolve to module records', async () => {
    const root = fixtureRoot();
    const familyTemplate = fs.readFileSync(
      path.join(root, 'docs/templates/knowledge/family-contract.md'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'docs/families/actions.md'),
      familyTemplate.replace('family:<family-name>', 'family:actions'),
    );
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(componentDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[family:actions]'}),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /modules reference family:actions must resolve to a module record, not family/,
    );
  });

  it('rejects duplicate module links and duplicate module ids', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(componentDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({
        modules: '[module:Button/useButtonThing,module:Button/useButtonThing]',
      }),
    );
    for (const owner of ['first', 'second']) {
      const modulePath = path.join(
        componentDirectory,
        `plugins/${owner}/useButtonThing.spec.md`,
      );
      fs.mkdirSync(path.dirname(modulePath), {recursive: true});
      fs.writeFileSync(modulePath, moduleRecord());
    }

    const problems = (await validateKnowledgeRoot(root)).join('\n');
    expect(problems).toMatch(/duplicate id module:Button\/useButtonThing/);
    expect(problems).toMatch(
      /modules contains duplicate reference module:Button\/useButtonThing/,
    );
  });

  it('requires module ids and filenames to encode the same public name', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    const modulePath = path.join(
      componentDirectory,
      'plugins/thing/WrongName.spec.md',
    );
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Button/useButtonThing]'}),
    );
    fs.writeFileSync(modulePath, moduleRecord());

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /module filename must be useButtonThing\.spec\.md/,
    );
  });

  it('validates module anatomy only against the module consumer doc', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    const modulePath = path.join(
      componentDirectory,
      'plugins/thing/useButtonThing.spec.md',
    );
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Button/useButtonThing]'}),
    );
    fs.writeFileSync(
      path.join(componentDirectory, 'useButtonThing.doc.mjs'),
      `export const docs = {
  name: 'useButtonThing',
  usage: {
    anatomy: [
      {name: 'Generated control', required: true, description: 'Generated UI.'},
    ],
  },
  theming: {
    targets: [{className: 'astryx-button-thing'}],
  },
};\n`,
    );
    fs.writeFileSync(
      modulePath,
      withAnatomyTheming(moduleRecord(), {
        'Generated control': {target: 'button-thing'},
      }),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('never validates a module map against parent aggregate anatomy', async () => {
    const root = fixtureRoot();
    const componentDirectory = path.join(root, 'packages/core/src/Button');
    const modulePath = path.join(
      componentDirectory,
      'plugins/thing/useButtonThing.spec.md',
    );
    fs.mkdirSync(path.dirname(modulePath), {recursive: true});
    const parentDoc = writeButtonDoc(componentDirectory).replace(
      '  usage: {',
      "  components: [{name: 'useButtonThing'}],\n  usage: {",
    );
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.doc.mjs'),
      parentDoc,
    );
    fs.writeFileSync(
      path.join(componentDirectory, 'Button.spec.md'),
      componentRecord({modules: '[module:Button/useButtonThing]'}),
    );
    fs.writeFileSync(
      modulePath,
      withAnatomyTheming(moduleRecord(), {Root: {target: 'button'}}),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /no exact consumer doc entry for module useButtonThing/,
    );
  });

  it('discovers only the exact canonical package-local theme record without placement errors', async () => {
    const root = fixtureRoot();
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord(),
    );
    fs.writeFileSync(
      path.join(root, 'docs/themes/README.md'),
      '# Guidance only\n',
    );

    const discovered = discoverKnowledgeRecords(root).map(filePath =>
      path.relative(root, filePath),
    );
    expect(discovered).toContain('packages/themes/neutral/neutral.spec.md');
    expect(discovered).not.toContain('docs/themes/README.md');
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it.each([
    [
      'docs guidance directory',
      'docs/themes/neutral.md',
      /theme records must be placed at packages\/themes\/<theme>\/<theme>\.spec\.md/,
    ],
    [
      'wrong package filename',
      'packages/themes/neutral/Theme.spec.md',
      /theme record must be placed exactly at packages\/themes\/neutral\/neutral\.spec\.md/,
    ],
    [
      'nested package path',
      'packages/themes/neutral/subdir/neutral.spec.md',
      /theme record must be placed exactly at packages\/themes\/neutral\/neutral\.spec\.md/,
    ],
  ])(
    'rejects a theme-shaped record in the %s',
    async (_name, relative, error) => {
      const root = fixtureRoot();
      const absolute = path.join(root, relative);
      fs.mkdirSync(path.dirname(absolute), {recursive: true});
      fs.writeFileSync(absolute, themeRecord());

      const discovered = discoverKnowledgeRecords(root).map(filePath =>
        path.relative(root, filePath),
      );
      expect(discovered).toContain(relative);
      expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(error);
    },
  );

  it('accepts derived repo-owner approval on a current theme record', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'rubyycheung',
        approved_at: '2026-08-31',
      }),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('does not inherit v1 approvalOwners for theme approval', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    for (const ownerFile of ['ENGOWNERS', 'DESIGNOWNERS']) {
      const filePath = path.join(root, `.github/${ownerFile}`);
      fs.writeFileSync(
        filePath,
        fs.readFileSync(filePath, 'utf8').replace(/@cixzhang\b/g, ''),
      );
    }
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'cixzhang',
        approved_at: '2026-08-31',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /approved_by to name an authorized owner/,
    );
  });

  it('accepts an ENGOWNER approval on a current theme record', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'czarandy',
        approved_at: '2026-08-31',
      }),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects a scalar references field on a current theme', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'rubyycheung',
        approved_at: '2026-08-31',
        references: 'spec:AST-006',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /references must be a list/,
    );
  });

  it('does not let a self-declared theme owner approve a current record', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        additional_owners: '[self-declared-owner]',
        approved_by: 'self-declared-owner',
        approved_at: '2026-08-31',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /approved_by to name an authorized owner/,
    );
  });

  it('rejects an unresolved reference from a current theme record', async () => {
    const root = fixtureRoot();
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'rubyycheung',
        approved_at: '2026-08-31',
        references: '[architecture:missing]',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /references reference architecture:missing does not resolve/,
    );
  });

  it('rejects an unresolved typed reference list from a current theme', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'rubyycheung',
        approved_at: '2026-08-31',
        references: '[spec:missing]',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /references reference spec:missing does not resolve/,
    );
  });

  it('rejects a current theme that relies on a draft deciding spec', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    const specDirectory = path.join(root, 'docs/specs/AST-006');
    fs.mkdirSync(specDirectory);
    const systemTemplate = fs.readFileSync(
      path.join(root, 'docs/templates/knowledge/system-spec.md'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(specDirectory, 'spec.md'),
      systemTemplate.replace('id: spec:AST-000', 'id: spec:AST-006'),
    );
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'rubyycheung',
        approved_at: '2026-08-31',
        references: '[spec:AST-006]',
      }),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /current records may not rely on non-current spec:AST-006/,
    );
  });

  it('accepts a current theme list reference to a current deciding spec', async () => {
    const root = fixtureRoot();
    writeCurrentArchitecture(root);
    writeSystemSpec(root, 'AST-006', systemSpecRecord({id: 'spec:AST-006'}));
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({
        authority: 'current',
        approved_by: 'rubyycheung',
        approved_at: '2026-08-31',
        references: '[spec:AST-006]',
      }),
    );

    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('rejects duplicate theme ids', async () => {
    const root = fixtureRoot();
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord(),
    );
    fs.writeFileSync(
      path.join(root, 'packages/themes/duplicate/duplicate.spec.md'),
      themeRecord(),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /duplicate id theme:neutral/,
    );
  });

  it('rejects a theme id outside the package-theme-name format', async () => {
    const root = fixtureRoot();
    fs.writeFileSync(
      path.join(root, 'packages/themes/neutral/neutral.spec.md'),
      themeRecord({id: 'theme:Neutral Theme'}),
    );

    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /id must match/,
    );
  });

  it('rejects duplicate authority fields', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord().replace(
        'authority: draft',
        'authority: draft\nauthority: "current"',
      ),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /duplicate authority fields|duplicate frontmatter field authority/,
    );
  });

  describe('repository owner eligibility', () => {
    const records = [
      ['architecture', 'architecture.md', 'docs/architecture/approval.md'],
      [
        'component',
        'component-spec.md',
        'packages/core/src/Button/Button.spec.md',
      ],
      [
        'module',
        'module-spec.md',
        'packages/core/src/Button/hooks/useButtonThing.spec.md',
      ],
      ['family', 'family-contract.md', 'docs/families/approval.md'],
      ['system-spec', 'system-spec.md', 'docs/specs/AST-900/spec.md'],
      ['design', 'design-spec.md', 'docs/design/approval.md'],
      ['theme', 'theme-spec.md', 'packages/themes/neutral/neutral.spec.md'],
    ];

    function writeApprovalRecord(root, templateName, filePath, approvedBy) {
      const template = fs.readFileSync(
        path.join(root, 'docs/templates/knowledge', templateName),
        'utf8',
      );
      const content = template
        .replace('authority: draft', 'authority: current')
        .replace('approved_by: null', `approved_by: ${approvedBy}`)
        .replace('approved_at: null', 'approved_at: 2026-10-13');
      fs.mkdirSync(path.dirname(path.join(root, filePath)), {recursive: true});
      fs.writeFileSync(path.join(root, filePath), content);
    }

    function approvalProblems(problems, filePath) {
      return problems.filter(problem =>
        problem.startsWith(`${filePath}: current records require approved_by`),
      );
    }

    it.each(records)(
      'accepts an ENGOWNER for %s records',
      async (_kind, templateName, filePath) => {
        const root = fixtureRoot();
        writeApprovalRecord(root, templateName, filePath, 'nynexman4464');
        expect(
          approvalProblems(await validateKnowledgeRoot(root), filePath),
        ).toEqual([]);
      },
    );

    it.each(records)(
      'does not inherit the legacy schema approver list for %s',
      async (_kind, templateName, filePath) => {
        const root = fixtureRoot();
        for (const ownerFile of ['ENGOWNERS', 'DESIGNOWNERS']) {
          const ownerPath = path.join(root, '.github', ownerFile);
          fs.writeFileSync(
            ownerPath,
            fs.readFileSync(ownerPath, 'utf8').replace(/@cixzhang\b/g, ''),
          );
        }
        writeApprovalRecord(root, templateName, filePath, 'cixzhang');
        expect(
          approvalProblems(await validateKnowledgeRoot(root), filePath),
        ).toHaveLength(1);
      },
    );

    it.each(records)(
      'limits DESIGNOWNER eligibility to design/theme for %s',
      async (kind, templateName, filePath) => {
        const root = fixtureRoot();
        writeApprovalRecord(root, templateName, filePath, 'rubyycheung');
        expect(
          approvalProblems(await validateKnowledgeRoot(root), filePath),
        ).toHaveLength(kind === 'design' || kind === 'theme' ? 0 : 1);
      },
    );
  });

  it('requires explicit approval for a current record', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({authority: 'current'}),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /require approved_by/,
    );
  });

  it('rejects an unauthorized current approval claim', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({
        authority: 'current',
        approved_by: 'someone-else',
        approved_at: '2026-08-30',
      }),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /authorized owner/,
    );
  });

  it('accepts a current record with an authorized dated approval', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({
        authority: 'current',
        approved_by: 'cixzhang',
        approved_at: '2026-08-30',
      }),
    );
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('requires a replacement for a superseded archive', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({authority: 'archived', archive_reason: 'superseded'}),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /require superseded_by/,
    );
  });

  it('rejects a record claiming a future template version', async () => {
    const root = fixtureRoot();
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({template_version: '8'}),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /template_version 8 is newer than 7/,
    );
  });

  it('rejects active records on an old schema', async () => {
    const root = fixtureRoot();
    addSchemaVersion(root, 0);
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({schema_version: '0'}),
    );
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /active component records must use latest schema_version 3 for that kind/,
    );
  });

  it('allows archived records to retain an older available schema', async () => {
    const root = fixtureRoot();
    addSchemaVersion(root, 0);
    const directory = path.join(root, 'packages/core/src/Button');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'Button.spec.md'),
      componentRecord({
        schema_version: '0',
        authority: 'archived',
        archive_reason: 'historical',
      }),
    );
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('accepts a DESIGNOWNER approval claim on a current design record', async () => {
    const root = fixtureRoot();
    const template = fs.readFileSync(
      path.join(root, 'docs/templates/knowledge/design-spec.md'),
      'utf8',
    );
    const record = template
      .replace('id: design:<surface>', 'id: design:button')
      .replace('authority: draft', 'authority: current')
      .replace('approved_by: null', 'approved_by: rubyycheung')
      .replace('approved_at: null', 'approved_at: 2026-08-30');
    fs.mkdirSync(path.join(root, 'docs/design'), {recursive: true});
    fs.writeFileSync(path.join(root, 'docs/design/button.md'), record);
    expect((await validateKnowledgeRoot(root)).join('\n')).not.toMatch(
      /approved_by to name an authorized owner/,
    );
  });

  it('requires current design records to reference current architecture', async () => {
    const root = fixtureRoot();
    const template = fs.readFileSync(
      path.join(root, 'docs/templates/knowledge/design-spec.md'),
      'utf8',
    );
    const record = template
      .replace('id: design:<surface>', 'id: design:button')
      .replace('authority: draft', 'authority: current')
      .replace('approved_by: null', 'approved_by: cixzhang')
      .replace('approved_at: null', 'approved_at: 2026-08-30')
      .replace(
        'architecture: [architecture:<surface>]',
        'architecture: [architecture:missing]',
      );
    fs.mkdirSync(path.join(root, 'docs/design'), {recursive: true});
    fs.writeFileSync(path.join(root, 'docs/design/button.md'), record);
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /architecture reference architecture:missing does not resolve/,
    );
  });

  it('rejects duplicate logical ids', async () => {
    const root = fixtureRoot();
    for (const name of ['Button', 'Action']) {
      const directory = path.join(root, `packages/core/src/${name}`);
      fs.mkdirSync(directory);
      fs.writeFileSync(
        path.join(directory, `${name}.spec.md`),
        componentRecord(),
      );
    }
    expect((await validateKnowledgeRoot(root)).join('\n')).toMatch(
      /duplicate id component:Button/,
    );
  });
});

describe('path-applicability:v1', () => {
  it('matches ** across whole segments, * and ? within one segment', () => {
    const cases = [
      ['apps/docsite/**', 'apps/docsite/src/a.ts', true],
      ['apps/docsite/**', 'apps/docsite', false],
      ['apps/docsite/**', 'apps/docsite-old/a.ts', false],
      [
        'packages/**/*.doc.mjs',
        'packages/core/src/Button/Button.doc.mjs',
        true,
      ],
      ['packages/**/*.doc.mjs', 'packages/Button.doc.mjs', true],
      [
        'packages/**/*.doc.mjs',
        'packages/core/src/Button/Button.doc.zh.mjs',
        false,
      ],
      ['packages/*/src/index.ts', 'packages/core/src/index.ts', true],
      ['packages/*/src/index.ts', 'packages/core/nested/src/index.ts', false],
      ['scripts/check-?.mjs', 'scripts/check-a.mjs', true],
      ['scripts/check-?.mjs', 'scripts/check-ab.mjs', false],
      ['docs/a.b.md', 'docs/aXb.md', false],
      ['README.md', 'README.md', true],
      ['README.md', 'packages/core/README.md', false],
    ];
    for (const [pattern, filePath, expected] of cases) {
      expect([
        pattern,
        filePath,
        matchesPathPattern(pattern, filePath),
      ]).toEqual([pattern, filePath, expected]);
    }
  });

  it('accepts a valid block and rejects malformed, unsafe, repeated, or stale patterns', () => {
    const files = ['apps/docsite/src/a.ts', 'README.md'];
    const content = [
      '# Record',
      '',
      '<!-- path-applicability:v1 -->',
      '',
      '```json',
      '{"paths": ["apps/docsite/**", "README.md"]}',
      '```',
    ].join('\n');
    const parsed = parsePathApplicabilityBlock(content, 'r.md');
    expect(parsed.problems).toEqual([]);
    expect(validatePathApplicability(parsed.config, 'r.md', files)).toEqual([]);

    const problems = config => validatePathApplicability(config, 'r.md', files);
    expect(problems({paths: []})).toEqual([
      'r.md: path-applicability:v1 requires a non-empty paths list.',
    ]);
    expect(problems({paths: ['README.md'], scope: 'global'})).toEqual([
      'r.md: path-applicability:v1 requires exactly paths.',
    ]);
    expect(
      problems({
        paths: [
          'README.md',
          'README.md',
          '/abs/**',
          'a/../b',
          'a/b**',
          '**',
          'docs/{a,b}.md',
          'apps/missing/**',
          '**/*',
          '**/**',
          '**/?*',
          '*/src/a.ts',
        ],
      }),
    ).toEqual([
      'r.md: path-applicability:v1 pattern "README.md" is repeated.',
      'r.md: path-applicability:v1 pattern "/abs/**" must be repository-relative with no empty, "." or ".." segments.',
      'r.md: path-applicability:v1 pattern "a/../b" must be repository-relative with no empty, "." or ".." segments.',
      'r.md: path-applicability:v1 pattern "a/b**" may use ** only as a whole segment.',
      'r.md: path-applicability:v1 pattern "**" covers the whole repository; name the paths.',
      'r.md: path-applicability:v1 pattern "docs/{a,b}.md" may use only letters, digits, _ . @ - / and the wildcards * ** ?.',
      'r.md: path-applicability:v1 pattern "apps/missing/**" matches no repository file.',
      'r.md: path-applicability:v1 pattern "**/*" must start with a literal path segment; a leading wildcard covers the whole repository.',
      'r.md: path-applicability:v1 pattern "**/**" must start with a literal path segment; a leading wildcard covers the whole repository.',
      'r.md: path-applicability:v1 pattern "**/?*" must start with a literal path segment; a leading wildcard covers the whole repository.',
      'r.md: path-applicability:v1 pattern "*/src/a.ts" must start with a literal path segment; a leading wildcard covers the whole repository.',
    ]);
    expect(
      validatePathApplicability({paths: ['apps/**']}, 'r.md', [
        'apps/a.ts',
        'apps/b/c.ts',
      ]),
    ).toEqual([
      'r.md: path-applicability:v1 pattern "apps/**" matches every repository file; name the paths.',
    ]);
    expect(
      validatePathApplicability({paths: ['apps/missing/**']}, 'r.md', null),
    ).toEqual([]);
  });

  it('reports duplicate blocks through the shared overlay parser', () => {
    const block =
      '<!-- path-applicability:v1 -->\n```json\n{"paths": ["README.md"]}\n```\n';
    expect(
      parsePathApplicabilityBlock(`${block}\n${block}`, 'r.md').problems,
    ).toEqual(['r.md: duplicate path-applicability:v1 blocks.']);
  });
});

describe('INV25 record reachability', () => {
  function gitFixture(root) {
    execFileSync('git', ['init', '-q'], {cwd: root});
    execFileSync('git', ['add', '-A'], {cwd: root});
  }

  it('fails a current record no tracked non-record path reaches, and passes once a pattern reaches it', async () => {
    const root = fixtureRoot();
    writeSystemSpec(root, 'AST-900', systemSpecRecord());
    fs.mkdirSync(path.join(root, 'apps/site'), {recursive: true});
    fs.writeFileSync(path.join(root, 'apps/site/index.md'), '# Site\n');
    gitFixture(root);
    expect(await validateKnowledgeRoot(root)).toEqual([
      'docs/specs/AST-900/spec.md: current record spec:AST-900 is not reached from any repository path that is not itself a record (INV25). Link it through placement, applies_to, verified_by, a membership or consumer-doc id, a cited spec number, or a path-applicability:v1 block.',
    ]);

    fs.writeFileSync(
      path.join(root, 'docs/specs/AST-900/spec.md'),
      systemSpecRecord().replace(
        '# Fixture system spec\n',
        '# Fixture system spec\n\n<!-- path-applicability:v1 -->\n\n```json\n{"paths": ["apps/site/**"]}\n```\n',
      ),
    );
    gitFixture(root);
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('skips reachability when the root has no tracked file list', async () => {
    const root = fixtureRoot();
    writeSystemSpec(root, 'AST-900', systemSpecRecord());
    expect(await validateKnowledgeRoot(root)).toEqual([]);
  });

  it('runs from the command line without deadlocking on its own import', () => {
    const output = execFileSync(
      process.execPath,
      [path.join(repoRoot, 'scripts/check-knowledge.mjs')],
      {cwd: repoRoot, encoding: 'utf8'},
    );
    expect(output).toContain('Knowledge templates and records are aligned.');
  });
});
