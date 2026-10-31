// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hermetic integration authoring checks against the real Core catalogs.
 * @input Integration fixtures and the post-0.7 conflict projection.
 * @output Coverage for replacement validation and public diagnostics.
 * @position Unit coverage; the 0.6.x compatibility shape has its own fixture.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../foundation/discovery/template-conflict-release.mjs', () => ({
  expandedTemplateConflictSchemaActive: () => true,
}));
import * as fs from 'node:fs';
import * as path from 'node:path';
import {validateIntegration} from './validate-integration.mjs';
import {discoverCoreTemplates} from '../../foundation/discovery/template-adapter.mjs';
import {discoverOwnedComponents} from '../../foundation/discovery/component-discovery.mjs';
import {discoverBuiltinTopics} from '../../foundation/discovery/docs-discovery.mjs';
import {findCoreDir} from '../../foundation/fs/paths.mjs';
import {
  builtinGuideFiles,
  loadTopicModule,
} from '../../foundation/discovery/docs-discovery.mjs';
import {proseWords} from '../../foundation/discovery/copied-passages.mjs';
import {
  integrationComponentConflicts,
  integrationDocConflicts,
  integrationTemplateConflicts,
  shellArg,
} from './authoring-checks.mjs';

let tmpDir;

function writeIntegration({
  id,
  name,
  type = 'block',
  root = tmpDir,
  replacements,
  withSource = true,
}) {
  fs.mkdirSync(root, {recursive: true});
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(root, 'astryx.integration.mjs'),
    `export default {templates: './templates'};\n`,
  );
  const stem = path.join(root, 'templates', id);
  fs.mkdirSync(path.dirname(stem), {recursive: true});
  fs.writeFileSync(
    `${stem}.doc.mjs`,
    `export default {type: '${type}', name: ${JSON.stringify(name)}, description: 'fixture'${replacements?.[id] == null ? '' : `, replaces: ${JSON.stringify(replacements[id])}`}};\n`,
  );
  if (!withSource) return;
  fs.writeFileSync(
    `${stem}.tsx`,
    'export default function Fixture() { return null; }\n',
  );
}

function writeComponentIntegration(componentName) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    `export default {components: './components'};\n`,
  );
  fs.mkdirSync(path.join(tmpDir, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(tmpDir, 'components', `${componentName}.doc.mjs`),
    `export default {type: 'component', name: ${JSON.stringify(componentName)}, displayName: ${JSON.stringify(componentName)}, description: 'Fixture component.', props: []};\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'components', `${componentName}.tsx`),
    'export default function Fixture() { return null; }\n',
  );
}

function writeDocIntegration({name, replaces, extendsTopic}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    `export default {docs: './docs'};\n`,
  );
  fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
  const relationship =
    replaces != null
      ? `, replaces: ${JSON.stringify(replaces)}`
      : extendsTopic != null
        ? `, extends: ${JSON.stringify(extendsTopic)}`
        : '';
  fs.writeFileSync(
    path.join(tmpDir, 'docs', `${name}.doc.mjs`),
    `export default {type: 'generic', name: ${JSON.stringify(name)}, title: 'Fixture', description: 'Fixture topic.'${relationship}, sections: [{title: 'Overview', content: [{type: 'prose', text: 'Fixture.'}]}]};\n`,
  );
}

/**
 * A docs-only package with one generic topic per entry: its prose, and
 * optionally a code block and the Core topic it replaces.
 * @param {{name: string, text: string, code?: string, replaces?: string}[]} topics
 */
function writeTopics(topics) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    `export default {docs: './docs'};\n`,
  );
  fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
  for (const {name, text, code, replaces, extendsTopic} of topics) {
    const blocks = [{type: 'prose', text}];
    if (code != null) blocks.push({type: 'code', lang: 'text', code});
    const doc = {
      type: 'generic',
      name,
      title: 'Fixture',
      description: 'Fixture topic.',
      ...(replaces == null ? {} : {replaces}),
      ...(extendsTopic == null ? {} : {extends: extendsTopic}),
      sections: [{title: 'Overview', content: blocks}],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', `${name}.doc.mjs`),
      `export default ${JSON.stringify(doc)};\n`,
    );
  }
}

const PASSAGE =
  'Themes cannot style the layer that holds a menu or a popover, so a menu ' +
  'keeps the default surface color until the next release adds a token for it.';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-template-conflicts-'),
  );
  // The fixture is a package with its own TypeScript config, scoped to its
  // own files. Without one, the prop check reads the repository's root
  // config, as `tsc` would for a folder inside it, and compiles every
  // declaration in the repository for each check.
  fs.writeFileSync(
    path.join(tmpDir, 'tsconfig.json'),
    `${JSON.stringify({extends: '../tsconfig.json', include: ['**/*']})}\n`,
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integrationTemplateConflicts', () => {
  it('warns on an id shared with Core and gives the package-qualified command', async () => {
    const [core] = await discoverCoreTemplates();
    expect(core).toBeDefined();
    writeIntegration({
      id: core.dirName,
      name: 'Integration override',
      type: core.type,
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.type).toBe('integration.template-conflicts');
    expect(result.data.name).toBe('@acme/widgets');
    expect(result.data.issues).toEqual([]);
    expect(result.data.conflicts).toHaveLength(1);
    expect(result.data.conflicts[0]).toMatchObject({
      id: core.dirName,
      severity: 'warning',
      integrationPackage: '@acme/widgets',
      integrationName: 'Integration override',
    });
    expect(result.data.conflicts[0].message).toContain('Consider renaming');
    expect(result.data.conflicts[0].command).toContain(
      `template ${core.dirName} --package @acme/widgets`,
    );
  });

  it('does not flag a shared display name when the ids differ', async () => {
    const [core] = await discoverCoreTemplates();
    expect(core).toBeDefined();
    writeIntegration({
      id: 'integration-only-id',
      name: core.name,
      type: core.type,
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.conflicts).toEqual([]);
    expect(result.data.issues).toEqual([]);
  });

  it('loads an installed integration through the same conflict path', async () => {
    const [core] = await discoverCoreTemplates();
    expect(core).toBeDefined();
    const installed = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    writeIntegration({
      id: core.dirName,
      name: 'Installed override',
      type: core.type,
      root: installed,
    });

    const result = await integrationTemplateConflicts('@acme/widgets', {
      cwd: tmpDir,
    });

    expect(result.data.name).toBe('@acme/widgets');
    expect(result.data.conflicts.map(conflict => conflict.id)).toContain(
      core.dirName,
    );
  });

  it('classifies a valid replacement and points to the Core original', async () => {
    const core = (await discoverCoreTemplates()).find(
      template => template.type === 'page',
    );
    expect(core).toBeDefined();
    writeIntegration({
      id: 'acme-app-shell',
      name: 'Acme app shell',
      type: core.type,
      replacements: {'acme-app-shell': core.dirName},
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.issues).toEqual([]);
    expect(result.data.conflicts).toEqual([
      expect.objectContaining({
        id: 'acme-app-shell',
        severity: 'info',
        relationship: 'replaces',
        replaces: core.dirName,
      }),
    ]);
    expect(result.data.conflicts[0].command).toContain(
      `template ${core.dirName} --package @astryxdesign/core`,
    );
  });

  it('reports a replacement target that Core does not provide', async () => {
    writeIntegration({
      id: 'acme-app-shell',
      name: 'Acme app shell',
      type: 'page',
      replacements: {'acme-app-shell': 'missing-core-shell'},
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_template_replacement_target',
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports a replacement declared by a template that cannot be used', async () => {
    const [core] = await discoverCoreTemplates();
    expect(core).toBeDefined();
    writeIntegration({
      id: 'broken-template',
      name: 'Broken template',
      type: core.type,
      replacements: {'broken-template': core.dirName},
      withSource: false,
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          severity: 'error',
          message: expect.stringContaining('cannot be used'),
        }),
      ]),
    );
  });

  it('reports two templates that replace the same Core target as ambiguous', async () => {
    const [core] = await discoverCoreTemplates();
    expect(core).toBeDefined();
    const replacements = {
      'acme-app-shell-a': core.dirName,
      'acme-app-shell-b': core.dirName,
    };
    writeIntegration({
      id: 'acme-app-shell-a',
      name: 'Acme app shell A',
      type: core.type,
      replacements,
    });
    writeIntegration({
      id: 'acme-app-shell-b',
      name: 'Acme app shell B',
      type: core.type,
      replacements,
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ambiguous_template_replacement',
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports a replacement whose template kind differs from Core', async () => {
    const corePage = (await discoverCoreTemplates()).find(
      template => template.type === 'page',
    );
    expect(corePage).toBeDefined();
    writeIntegration({
      id: 'acme-app-shell',
      name: 'Acme app shell',
      type: 'block',
      replacements: {'acme-app-shell': corePage.dirName},
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_template_replacement',
          severity: 'error',
          message: expect.stringContaining('same type'),
        }),
      ]),
    );
  });

  it('does not recommend an impossible replacement for a different Core kind', async () => {
    const corePage = (await discoverCoreTemplates()).find(
      template => template.type === 'page',
    );
    expect(corePage).toBeDefined();
    writeIntegration({
      id: corePage.dirName,
      name: 'Acme block with a page id',
      type: 'block',
    });

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});
    const conflict = result.data.conflicts.find(
      item => item.id === corePage.dirName,
    );

    expect(conflict?.relationship).toBe('accidental');
    expect(conflict?.message).toContain(
      'cannot replace a different template kind',
    );
    expect(conflict?.message).toContain('Rename');
    expect(conflict?.message).not.toContain('set replaces');
  });

  it('shell-quotes unusual ids instead of allowing command substitution', () => {
    expect(shellArg('safe/id')).toBe('safe/id');
    expect(shellArg('my$thing')).toBe("'my$thing'");
    expect(shellArg("a'b")).toBe("'a'\\''b'");
    expect(shellArg('foo`id`')).toBe("'foo`id`'");
  });

  it('returns a malformed template once as an invalid_template issue', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {templates: './templates'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'templates', 'broken.doc.mjs'),
      `throw new Error('broken fixture');\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'templates', 'broken.tsx'),
      'export default function Broken() { return null; }\n',
    );

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});
    const invalid = result.data.issues.filter(
      issue => issue.code === 'invalid_template',
    );

    expect(result.data.conflicts).toEqual([]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].message).toContain('broken fixture');
  });

  it('returns structural issues instead of claiming a broken integration is clean', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {templates: './missing'};\n`,
    );

    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.conflicts).toEqual([]);
    expect(
      result.data.issues.some(issue => issue.code === 'missing_root'),
    ).toBe(true);
  });
});

describe('integrationComponentConflicts', () => {
  it('warns on a Core component name and gives the package-qualified command', async () => {
    const coreDir = findCoreDir(tmpDir);
    expect(coreDir).not.toBeNull();
    const [core] = discoverOwnedComponents(coreDir, []);
    expect(core).toBeDefined();
    writeComponentIntegration(core.name);

    const result = await integrationComponentConflicts(undefined, {
      cwd: tmpDir,
    });

    expect(result.type).toBe('integration.component-conflicts');
    expect(result.data.issues).toEqual([]);
    expect(result.data.conflicts).toEqual([
      expect.objectContaining({
        name: core.name,
        severity: 'warning',
        integrationPackage: '@acme/widgets',
        command: expect.stringContaining(
          `component ${core.name} --package @acme/widgets`,
        ),
      }),
    ]);
  });

  it('does not flag an integration-only component name', async () => {
    writeComponentIntegration('AcmeOnlyWidget');

    const result = await integrationComponentConflicts(undefined, {
      cwd: tmpDir,
    });

    expect(result.data.conflicts).toEqual([]);
    expect(result.data.issues).toEqual([]);
  });

  it("compares each component doc's props with the component's TypeScript props, as warnings", async () => {
    writeComponentIntegration('AcmeBadge');
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'AcmeBadge.doc.mjs'),
      `export default {type: 'component', name: 'AcmeBadge', displayName: 'AcmeBadge', description: 'Fixture component.', props: [{name: 'label', type: 'string', description: 'Text.', required: true}, {name: 'size', type: "'sm' | 'md'", description: 'Size.'}]};\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'components', 'AcmeBadge.tsx'),
      'export function AcmeBadge(props: {label: string; count?: number}) { return null; }\n',
    );

    const result = await integrationComponentConflicts(undefined, {
      cwd: tmpDir,
    });

    expect(result.data.issues).toEqual([]);
    expect(result.data.propDrift).toMatchObject({
      status: 'checked',
      components: 1,
      unchecked: [],
    });
    expect(
      result.data.propDrift?.findings.map(f => [f.prop, f.kind, f.severity]),
    ).toEqual([
      ['count', 'not_in_doc', 'warning'],
      ['size', 'not_in_code', 'warning'],
    ]);
  });

  it('leaves propDrift out when the package has no components root', async () => {
    writeDocIntegration({name: 'acme-setup'});

    const result = await integrationComponentConflicts(undefined, {
      cwd: tmpDir,
    });

    expect(result.data).not.toHaveProperty('propDrift');
  });
});

describe('integrationDocConflicts', () => {
  it('marks an explicit Core replacement as intentional', async () => {
    const [coreTopic] = Object.keys(discoverBuiltinTopics());
    expect(coreTopic).toBeDefined();
    writeDocIntegration({name: 'acme-setup', replaces: coreTopic});

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});

    expect(result.type).toBe('integration.doc-conflicts');
    expect(result.data.issues).toEqual([]);
    expect(result.data.findings).toEqual([
      expect.objectContaining({
        topic: 'acme-setup',
        severity: 'info',
        relationship: 'replaces',
        coreTopic,
      }),
    ]);
  });

  it('marks an explicit Core extension as intentional', async () => {
    const [coreTopic] = Object.keys(discoverBuiltinTopics());
    expect(coreTopic).toBeDefined();
    writeDocIntegration({name: 'acme-extra', extendsTopic: coreTopic});

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});

    expect(result.data.findings).toEqual([
      expect.objectContaining({
        topic: 'acme-extra',
        severity: 'info',
        relationship: 'extends',
        coreTopic,
      }),
    ]);
  });

  it('reports a same-name Core topic without a relationship as accidental', async () => {
    const [coreTopic] = Object.keys(discoverBuiltinTopics());
    expect(coreTopic).toBeDefined();
    writeDocIntegration({name: coreTopic});

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});

    expect(result.data.findings).toEqual([
      expect.objectContaining({
        topic: coreTopic,
        severity: 'error',
        relationship: 'accidental',
        coreTopic,
      }),
    ]);
    expect(result.data.findings[0].message).toContain(
      `replaces: '${coreTopic}'`,
    );
    expect(result.data.findings[0].message).toContain(
      `extends: '${coreTopic}'`,
    );
  });

  it('reports a Core name as accidental when replacing a different topic', async () => {
    const [replacedCore, nameCore] = Object.keys(discoverBuiltinTopics());
    expect(replacedCore).toBeDefined();
    expect(nameCore).toBeDefined();
    writeDocIntegration({name: nameCore, replaces: replacedCore});

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});

    expect(result.data.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: nameCore,
          severity: 'info',
          relationship: 'replaces',
          coreTopic: replacedCore,
        }),
        expect.objectContaining({
          topic: nameCore,
          severity: 'error',
          relationship: 'accidental',
          coreTopic: nameCore,
        }),
      ]),
    );
  });

  it('matches Core topic identity case-insensitively like docs lookup', async () => {
    const [coreTopic] = Object.keys(discoverBuiltinTopics());
    expect(coreTopic).toBeDefined();
    const mixedCase = coreTopic.toUpperCase();
    writeDocIntegration({name: mixedCase});

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});

    expect(result.data.findings).toEqual([
      expect.objectContaining({
        topic: mixedCase,
        severity: 'error',
        relationship: 'accidental',
        coreTopic,
      }),
    ]);
  });
});

describe('integrationDocConflicts copied passages', () => {
  const copied = (/** @type {any} */ result) => result.data.copiedPassages;

  it('lists a passage two of the package topics repeat, and warns about it', async () => {
    writeTopics([
      {name: 'acme-setup', text: `Read this first. ${PASSAGE}`},
      {name: 'acme-menus', text: `${PASSAGE} See the theme guide.`},
    ]);

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});
    const [issue, ...rest] = copied(result);
    expect(result.data.issues).toEqual([
      {code: 'copied_passage', severity: 'warning', message: issue.message},
    ]);

    expect(rest).toEqual([]);
    // The passage is about menus, so "acme-menus" keeps it.
    expect(issue).toMatchObject({
      topic: 'acme-setup',
      otherTopic: 'acme-menus',
      otherOwner: 'package',
      owner: 'acme-menus',
      section: 'Overview',
      line: 1,
      words: PASSAGE.split(' ').length,
      passages: 1,
    });
    expect(issue.message).toContain(`${PASSAGE.split(' ').length} words`);
    expect(issue.text).toBe(PASSAGE);
    expect(issue.message).toContain(`"${PASSAGE}"`);
    expect(issue.message).toContain(
      '"acme-menus" keeps it: its name, title or section fits the passage.',
    );
    expect(issue.message).toContain(
      'In "acme-setup", replace that whole passage, from its first word to its last, code ticks included, with {@link generic:acme-menus}.',
    );
  });

  it('reports a passage copied from a Core topic, except into the topic that replaces it', async () => {
    const [file] = builtinGuideFiles();
    const coreDoc = /** @type {any} */ (await loadTopicModule(file));
    const coreText = proseWords(coreDoc)
      .slice(0, 30)
      .map(each => each.word)
      .join(' ');

    writeTopics([{name: 'acme-copy', text: coreText}]);
    const [issue] = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );
    expect(issue.otherOwner).toBe('core');
    expect(issue.message).toContain(`the Core topic "${coreDoc.name}"`);
    expect(issue.owner).toBe(coreDoc.name);
    expect(issue.message).toContain(
      `code ticks included, with {@link @astryxdesign/cli:generic:${coreDoc.name}}.`,
    );

    fs.rmSync(path.join(tmpDir, 'docs'), {recursive: true, force: true});
    writeTopics([{name: 'acme-own', text: coreText, replaces: coreDoc.name}]);
    expect(
      copied(await integrationDocConflicts(undefined, {cwd: tmpDir})).filter(
        (/** @type {any} */ each) => each.message.includes(`"${coreDoc.name}"`),
      ),
    ).toEqual([]);
  });

  it('leaves out boilerplate that three topics share', async () => {
    writeTopics([
      {name: 'acme-fonts', text: PASSAGE},
      {name: 'acme-icons', text: PASSAGE},
      {name: 'acme-media', text: PASSAGE},
    ]);

    expect(
      copied(await integrationDocConflicts(undefined, {cwd: tmpDir})),
    ).toEqual([]);
  });

  it('leaves out a run of function words, which states no fact', async () => {
    const glue = 'and it is in the way that you can do it for them';
    writeTopics([
      {name: 'acme-a', text: `Start here. ${glue} first.`},
      {name: 'acme-b', text: `Then ${glue} again.`},
    ]);

    expect(
      copied(await integrationDocConflicts(undefined, {cwd: tmpDir})),
    ).toEqual([]);
  });

  it('leaves out a shared phrase under 10 words, and code', async () => {
    const short = PASSAGE.split(' ').slice(0, 9).join(' ');
    writeTopics([
      {name: 'acme-a', text: PASSAGE},
      {name: 'acme-b', text: short},
      {name: 'acme-c', text: 'Run it.', code: PASSAGE},
    ]);

    expect(
      copied(await integrationDocConflicts(undefined, {cwd: tmpDir})),
    ).toEqual([]);
  });
});

describe('integrationDocConflicts copied passages and extensions', () => {
  const copied = (/** @type {any} */ result) => result.data.copiedPassages;

  it('links to the page an extension shows on, not to the extension', async () => {
    writeTopics([
      {name: 'acme-menus', text: PASSAGE, extendsTopic: 'theme'},
      {name: 'acme-setup', text: `${PASSAGE} Then run setup.`},
    ]);

    const [issue] = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(issue).toMatchObject({topic: 'acme-setup', owner: 'acme-menus'});
    expect(issue.message).toContain(
      'with {@link @astryxdesign/cli:generic:theme}.',
    );
  });

  it('says to delete a copy in a topic that extends its owner', async () => {
    writeTopics([
      {name: 'acme-base', text: PASSAGE},
      {name: 'acme-more', text: PASSAGE, extendsTopic: 'acme-base'},
    ]);

    const [issue] = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(issue).toMatchObject({topic: 'acme-more', owner: 'acme-base'});
    expect(issue.message).toContain(
      '"acme-more" and "acme-base" show on the same page ("acme-base"): delete the passage from "acme-more"',
    );
    expect(issue.message).not.toContain('{@link');
  });

  it('compares pages without regard to case, and for two extensions of one page', async () => {
    writeTopics([
      {name: 'acme-colors', text: PASSAGE, extendsTopic: 'Theme'},
      {name: 'acme-menus', text: PASSAGE, extendsTopic: 'theme'},
    ]);

    const [issue] = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(issue.message).toContain('show on the same page ("theme")');
    expect(issue.message).not.toContain('{@link');
  });

  it('finds the line of the string that holds the copy, whatever it opens with', async () => {
    writeTopics([{name: 'acme-menus', text: PASSAGE}]);
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-setup',",
        "  title: 'Fixture',",
        "  description: 'Fixture topic.',",
        "  sections: [{title: 'Overview', content: [",
        "    {type: 'prose', text: '`acme` (the CLI) opens here, as {@link generic:acme-menus} says.'},",
        `    {type: 'prose', text: '\`acme\` (the CLI) opens here: ${PASSAGE}'},`,
        '  ]}],',
        '};',
        '',
      ].join('\n'),
    );

    const [issue] = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(issue).toMatchObject({topic: 'acme-setup', line: 8});
  });

  it('does not list a 9-word sentence that ends in a link', async () => {
    const sentence =
      'Theme tokens control every surface color, as explained in {@link generic:acme-theme}.';
    writeTopics([
      {name: 'acme-colors', text: `Colors first. ${sentence}`},
      {name: 'acme-menus', text: `Menus next. ${sentence}`},
    ]);

    expect(
      copied(await integrationDocConflicts(undefined, {cwd: tmpDir})),
    ).toEqual([]);
  });

  it('counts no function word toward which topic a passage fits', async () => {
    writeTopics([
      {name: 'acme-getting-started', text: `${PASSAGE} Then run setup.`},
      {name: 'acme-menus', text: PASSAGE},
    ]);
    // Titles that share only function words with the passage.
    for (const [name, title] of [
      ['acme-getting-started', 'Get started with the widgets'],
      ['acme-menus', 'Menus'],
    ]) {
      const file = path.join(tmpDir, 'docs', `${name}.doc.mjs`);
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace('"title":"Fixture"', `"title":"${title}"`),
      );
    }

    const [issue] = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(issue).toMatchObject({
      owner: 'acme-menus',
      topic: 'acme-getting-started',
    });
  });

  it('finds a copy after a lead-in three topics share', async () => {
    const lead =
      'Every package ships its integration docs as plain modules the CLI reads';
    writeTopics([
      {name: 'acme-menus', text: `${lead}. ${PASSAGE}`},
      {name: 'acme-setup', text: `${lead}. ${PASSAGE} Then run setup.`},
      {name: 'acme-other', text: `${lead}. Nothing else here is shared.`},
    ]);

    const found = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(found).toHaveLength(1);
    expect(found[0].text).toBe(PASSAGE);
  });

  it("links to a package topic that replaces Core's by its own name", async () => {
    writeTopics([
      {name: 'theme', text: PASSAGE, replaces: 'theme'},
      {name: 'acme-setup', text: `${PASSAGE} Then run setup.`},
    ]);

    const found = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    for (const each of found) {
      expect(each.message).not.toContain('@astryxdesign/cli:generic:theme');
    }
    expect(
      found.some((/** @type {any} */ each) =>
        each.message.includes('with {@link generic:theme}.'),
      ),
    ).toBe(true);
  });

  it('prints no link to a Core topic one of the package topics replaces', async () => {
    const [file] = builtinGuideFiles();
    const coreDoc = /** @type {any} */ (await loadTopicModule(file));
    const coreText = proseWords(coreDoc)
      .slice(0, 30)
      .map(each => each.word)
      .join(' ');
    writeTopics([
      {name: 'acme-own', text: 'Our version.', replaces: coreDoc.name},
      {name: 'acme-copy', text: coreText},
    ]);

    const found = copied(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    ).filter((/** @type {any} */ each) => each.owner === coreDoc.name);

    expect(found).toHaveLength(1);
    expect(found[0].message).toContain(
      `"acme-own" replaces the Core topic "${coreDoc.name}"`,
    );
    expect(found[0].message).not.toContain('{@link');
  });
});

describe('integrationDocConflicts fluff', () => {
  const fluff = (/** @type {any} */ result) => result.data.fluff;

  it('lists each padding phrase with its line and what to write instead', async () => {
    writeTopics([
      {
        name: 'acme-setup',
        text: 'In order to start, run the setup command once.',
      },
    ]);

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});
    const [hit, ...rest] = fluff(result);

    expect(rest).toEqual([]);
    expect(result.data.issues).toEqual([
      {code: 'doc_fluff', severity: 'warning', message: hit.message},
    ]);
    expect(hit).toMatchObject({
      topic: 'acme-setup',
      kind: 'phrase',
      phrase: 'in order to',
      section: 'Overview',
      file: 'docs/acme-setup.doc.mjs',
      line: 1,
      density: null,
    });
    expect(hit.message).toContain('Write "to" instead.');
  });

  it('finds each line within its own string, not in code or another field', async () => {
    writeTopics([]);
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-lines.doc.mjs'),
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-lines',",
        "  title: 'Fixture',",
        "  description: 'Build the package in order to publish it.',",
        "  sections: [{title: 'Overview', content: [",
        "    {type: 'code', lang: 'text', code: 'in order to build'},",
        "    {type: 'prose', text: 'Note that the build runs once per package and writes its output.'},",
        "    {type: 'prose', text: 'Run the build in order to refresh the generated files for the docs.'},",
        '  ]}],',
        '};',
        '',
      ].join('\n'),
    );

    const found = fluff(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    ).map((/** @type {any} */ each) => [each.phrase, each.line]);

    expect(found).toEqual([
      ['in order to', 5],
      ['note that', 8],
      ['in order to', 9],
    ]);
  });

  it('gives each use its own line in multi-line and concatenated strings', async () => {
    writeTopics([]);
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-multi.doc.mjs'),
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-multi',",
        "  title: 'Fixture',",
        "  description: 'Fixture topic.',",
        "  sections: [{title: 'Overview', content: [",
        "    {type: 'prose', text: `Build the package first.",
        'Run the build in order to refresh the files.',
        'Run it again in order to check them.`},',
        "    {type: 'prose', text: 'Publishing reads the built files ' +",
        "      'in order to ship them, so build before you publish.'},",
        '  ]}],',
        '};',
        '',
      ].join('\n'),
    );

    const found = fluff(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    ).map((/** @type {any} */ each) => each.line);

    expect(found).toEqual([8, 9, 11]);
  });

  it('finds the line of strings that open or end with code, links, quotes or escapes', async () => {
    writeTopics([]);
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-shapes.doc.mjs'),
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-shapes',",
        "  title: 'Fixture',",
        "  description: 'Fixture topic.',",
        "  sections: [{title: 'Overview', content: [",
        "    {type: 'prose', text: '`build` runs first, in order to check it.'},",
        "    {type: 'prose', text: '{@link generic:acme-shapes} runs it in order to ship.'},",
        "    {type: 'prose', text: '\"Build\" is a step you run in order to test (and ship).'},",
        "    {type: 'prose', text: '(Build) runs it once in order to publish the app\\'s files.'},",
        "    {type: 'prose', text: 'Run the build in order to check the files.'},",
        "    {type: 'prose', text: 'Run the build in order to publish the files.'},",
        '  ]}],',
        '};',
        '',
      ].join('\n'),
    );

    const found = fluff(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    ).map((/** @type {any} */ each) => each.line);

    expect(found).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('lists a long topic that is mostly glue, and not a dense one', async () => {
    const glue = Array.from(
      {length: 12},
      () =>
        'So that is why it is the one that you would want to use if you can.',
    ).join(' ');
    const dense = Array.from(
      {length: 8},
      (_, i) =>
        `Name codemod folder ${i} after the Core version whose upgrade runs it.`,
    ).join(' ');
    writeTopics([
      {name: 'acme-glue', text: glue},
      {name: 'acme-dense', text: dense},
    ]);

    const found = fluff(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(found.map((/** @type {any} */ each) => each.topic)).toEqual([
      'acme-glue',
    ]);
    expect(found[0]).toMatchObject({kind: 'density', phrase: null});
    expect(found[0].density).toBeLessThan(0.5);
    expect(found[0].message).toContain("Core's guides have a median of");
    expect(found[0].message).toContain('under the 50% floor');
  });
});

describe('integrationDocConflicts stray doc pointers', () => {
  const stray = (/** @type {any} */ result) => result.data.strayPointers;

  it('lists a pointer to a topic whose name holds an underscore or capitals', async () => {
    writeTopics([
      {name: 'acme_setup', text: 'Install it first.'},
      {name: 'AcmeGuide', text: 'Read on.'},
      {
        name: 'acme-menus',
        text: 'Set it up as `astryx docs acme_setup` says, then `astryx docs AcmeGuide`; flags such as `astryx docs -h` are not pointers.',
      },
    ]);

    const found = stray(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(found.map((/** @type {any} */ each) => each.link)).toEqual([
      '{@link generic:acme_setup}',
      '{@link generic:AcmeGuide}',
    ]);
  });

  it('links a pointer to an extension topic to the page it extends', async () => {
    writeTopics([
      {name: 'acme-theme', text: 'Acme colors.', extendsTopic: 'theme'},
      {name: 'acme-menus', text: 'Colors are in `astryx docs acme-theme`.'},
    ]);

    const [hit, ...rest] = stray(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(rest).toEqual([]);
    expect(hit).toMatchObject({
      topic: 'acme-menus',
      link: '{@link @astryxdesign/cli:generic:theme}',
    });
  });

  it('places a pointer-only list item on its own line, not an earlier summary or code block', async () => {
    writeTopics([{name: 'acme-menus', text: 'Menus.'}]);
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-setup',",
        "  title: 'Fixture',",
        "  summary: 'See `astryx docs acme-menus`.',",
        "  description: 'Fixture topic.',",
        "  sections: [{title: 'Overview', content: [",
        "    {type: 'code', lang: 'bash', code: 'astryx docs acme-menus'},",
        "    {type: 'list', style: 'unordered', items: ['`astryx docs acme-menus`']},",
        '  ]}],',
        '};',
        '',
      ].join('\n'),
    );

    const found = stray(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    ).filter((/** @type {any} */ each) => each.topic === 'acme-setup');

    // The summary's own pointer is listed too, at its line.
    expect(found.map((/** @type {any} */ each) => each.line)).toEqual([5, 9]);
  });

  it('lists a written pointer to a doc with the link that replaces it, and warns', async () => {
    writeTopics([
      {name: 'acme-setup', text: 'Install it first.'},
      {
        name: 'acme-menus',
        text: 'Set it up as `astryx docs acme-setup` says; the theme is in `astryx docs theme`.',
      },
    ]);

    const result = await integrationDocConflicts(undefined, {cwd: tmpDir});
    const [own, core, ...rest] = stray(result);

    expect(rest).toEqual([]);
    expect(own).toMatchObject({
      topic: 'acme-menus',
      section: 'Overview',
      file: 'docs/acme-menus.doc.mjs',
      line: 1,
      pointer: 'astryx docs acme-setup',
      link: '{@link generic:acme-setup}',
    });
    expect(own.message).toContain(
      'Replace `astryx docs acme-setup`, code ticks included, with {@link generic:acme-setup}',
    );
    expect(core.link).toBe('{@link @astryxdesign/cli:generic:theme}');
    expect(result.data.issues).toEqual([
      {code: 'stray_doc_pointer', severity: 'warning', message: own.message},
      {code: 'stray_doc_pointer', severity: 'warning', message: core.message},
    ]);
  });

  it('names a namespace doc by its kind', async () => {
    writeTopics([
      {name: 'acme-setup', text: 'Lay it out as `astryx docs layout` says.'},
    ]);

    const [hit] = stray(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    expect(hit.link).toBe('{@link @astryxdesign/cli:namespace:layout}');
  });

  it('finds each line in the string that holds the pointer, not in code', async () => {
    writeTopics([]);
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-lines.doc.mjs'),
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-lines',",
        "  title: 'Fixture',",
        "  description: 'Read `astryx docs theme` first.',",
        "  sections: [{title: 'Overview', content: [",
        "    {type: 'code', lang: 'bash', code: 'astryx docs theme'},",
        "    {type: 'prose', text: 'The colors your package sets show up in `astryx docs theme` for every app.'},",
        '  ]}],',
        '};',
        '',
      ].join('\n'),
    );

    const found = stray(
      await integrationDocConflicts(undefined, {cwd: tmpDir}),
    );

    // The description resolves links too, so its pointer is its own finding.
    expect(found.map((/** @type {any} */ each) => each.line)).toEqual([5, 8]);
  });

  it('leaves a command for a doc that does not exist, and a walkthrough', async () => {
    writeTopics([
      {
        name: 'acme-setup',
        text: 'Run `astryx docs acme-nothing`, or `astryx docs acme-setup overview`.',
      },
    ]);

    expect(
      stray(await integrationDocConflicts(undefined, {cwd: tmpDir})),
    ).toEqual([]);
  });
});

/**
 * A package with one component doc and, optionally, one topic.
 * @param {{usage: string, topicDescription?: string}} fixture
 */
function writeLinkedComponent({usage, topicDescription}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    topicDescription == null
      ? `export default {components: './components'};\n`
      : `export default {components: './components', docs: './docs'};\n`,
  );
  fs.mkdirSync(path.join(tmpDir, 'components'), {recursive: true});
  const doc = {
    type: 'component',
    name: 'AcmeButton',
    displayName: 'Acme Button',
    usage: {description: usage},
    props: [],
  };
  fs.writeFileSync(
    path.join(tmpDir, 'components', 'AcmeButton.doc.mjs'),
    `export default ${JSON.stringify(doc, null, 2)};\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, 'components', 'AcmeButton.tsx'),
    'export function AcmeButton() { return null; }\n',
  );
  if (topicDescription == null) return;
  fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
  const topic = {
    type: 'generic',
    name: 'acme-setup',
    title: 'Fixture',
    description: topicDescription,
    sections: [
      {title: 'Overview', content: [{type: 'prose', text: 'Install it.'}]},
    ],
  };
  fs.writeFileSync(
    path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
    `export default ${JSON.stringify(topic, null, 2)};\n`,
  );
}

describe('links in component docs and topic descriptions', () => {
  it("warns on a component doc's link that names no doc, and passes one to its own topic", async () => {
    writeLinkedComponent({
      usage:
        'Set it up as {@link generic:acme-setup} says, theme it with {@link @astryxdesign/cli:generic:theme}, then {@link generic:acme-nothing}.',
      topicDescription: 'Install Acme.',
    });

    const {data} = await integrationComponentConflicts(undefined, {
      cwd: tmpDir,
    });
    const links = data.issues.filter(
      (/** @type {any} */ issue) => issue.code === 'invalid_doc_graph',
    );
    expect(links).toEqual([
      {
        code: 'invalid_doc_graph',
        severity: 'warning',
        message: expect.stringMatching(
          /^component AcmeButton \(usage\.description\): "generic:acme-nothing" names no doc\./,
        ),
      },
    ]);
  });

  it("warns on a topic description's link that names no doc", async () => {
    writeLinkedComponent({
      usage: 'A button.',
      topicDescription: 'Install Acme; see {@link generic:acme-nothing}.',
    });

    const {data} = await integrationDocConflicts(undefined, {cwd: tmpDir});
    const links = data.issues.filter(
      (/** @type {any} */ issue) => issue.code === 'invalid_doc_graph',
    );
    expect(links).toEqual([
      {
        code: 'invalid_doc_graph',
        severity: 'warning',
        message: expect.stringMatching(
          /^acme-setup \(description\): "generic:acme-nothing" names no doc\./,
        ),
      },
    ]);
  });

  it('lists a written pointer in a component doc, with the link that replaces it', async () => {
    writeLinkedComponent({usage: 'Theme it as `astryx docs theme` says.'});

    const {data} = await integrationDocConflicts(undefined, {cwd: tmpDir});
    const [pointer, ...rest] = data.strayPointers;

    expect(rest).toEqual([]);
    expect(pointer).toMatchObject({
      topic: 'AcmeButton',
      kind: 'component',
      section: null,
      field: 'usage.description',
      file: 'components/AcmeButton.doc.mjs',
      pointer: 'astryx docs theme',
      link: '{@link @astryxdesign/cli:generic:theme}',
    });
    expect(pointer.line).toEqual(expect.any(Number));
    expect(pointer.message).toBe(
      `component "AcmeButton" (field usage.description, line ${pointer.line}) points at a doc with the written command \`astryx docs theme\`. ` +
        'Replace `astryx docs theme`, code ticks included, with {@link @astryxdesign/cli:generic:theme}: the CLI prints the command that opens the doc, and doctor checks the link.',
    );
    expect(data.issues).toContainEqual({
      code: 'stray_doc_pointer',
      severity: 'warning',
      message: pointer.message,
    });
  });

  it("lists a written pointer in a topic's description", async () => {
    writeLinkedComponent({
      usage: 'A button.',
      topicDescription: 'Install Acme; theme it as `astryx docs theme` says.',
    });

    const {data} = await integrationDocConflicts(undefined, {cwd: tmpDir});

    expect(data.strayPointers).toEqual([
      expect.objectContaining({
        topic: 'acme-setup',
        kind: 'topic',
        field: 'description',
        link: '{@link @astryxdesign/cli:generic:theme}',
      }),
    ]);
  });
});

describe('validateIntegration runner-command notes', () => {
  /** The runner-command notes, read back into their parts. */
  async function runnerNotes() {
    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    const notes = (data.notes ?? [])
      .filter((/** @type {any} */ note) => note.code === 'runner_command')
      .map((/** @type {any} */ note) => {
        const m =
          /^(\S+): "([^"]+)"(?: \(section "([^"]+)"\))? writes `([^`]+)`(?: \(line (\d+)\))?\./.exec(
            note.message,
          );
        return {
          file: m?.[1],
          topic: m?.[2],
          section: m?.[3] ?? null,
          command: m?.[4],
          line: m?.[5] ? Number(m[5]) : null,
          message: note.message,
        };
      });
    return {data, notes};
  }

  function writeTopic(/** @type {string} */ text) {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
    const doc = {
      type: 'generic',
      name: 'acme-setup',
      title: 'Fixture',
      description: 'Fixture topic.',
      sections: [
        {
          title: 'Overview',
          content: [
            {type: 'prose', text},
            {type: 'code', lang: 'bash', code: 'npx @astryxdesign/cli init'},
          ],
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      `export default ${JSON.stringify(doc)};\n`,
    );
  }

  it('lists a runner command with its line and fix, and raises no issue', async () => {
    writeTopic('Check it with `pnpm exec astryx doctor` first.');

    const {data, notes} = await runnerNotes();
    const [hit, ...rest] = notes;

    expect(rest).toEqual([]);
    expect(hit).toMatchObject({
      topic: 'acme-setup',
      section: 'Overview',
      file: 'docs/acme-setup.doc.mjs',
      line: 1,
      command: 'pnpm exec astryx doctor',
    });
    expect(hit.message).toContain('Write the token `{@command doctor}`');
    // A note only: no issue, so no exit changes on it.
    expect(
      data.issues.map((/** @type {any} */ issue) => issue.code),
    ).not.toContain('runner_command');
  });

  it('puts each copy of a repeated command on its own line', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
    const doc = {
      type: 'generic',
      name: 'acme-setup',
      title: 'Fixture',
      description: 'Fixture topic.',
      sections: [
        {
          title: 'First',
          content: [{type: 'prose', text: 'Run `npx astryx doctor`.'}],
        },
        {
          title: 'Second',
          content: [{type: 'prose', text: 'Run `npx astryx doctor` again.'}],
        },
        {
          title: 'Third',
          content: [{type: 'prose', text: 'Or plain `npx astryx`.'}],
        },
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      `export default ${JSON.stringify(doc, null, 2)};\n`,
    );
    const lines = fs
      .readFileSync(path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'), 'utf8')
      .split('\n');
    const lineHolding = (/** @type {string} */ text) =>
      lines.findIndex(line => line.includes(text)) + 1;

    const {notes} = await runnerNotes();

    expect(
      notes.map((/** @type {any} */ each) => [
        each.section,
        each.line,
        each.command,
      ]),
    ).toEqual([
      ['First', lineHolding('Run `npx astryx doctor`.'), 'npx astryx doctor'],
      ['Second', lineHolding('again.'), 'npx astryx doctor'],
      ['Third', lineHolding('Or plain'), 'npx astryx'],
    ]);
  });

  it('puts each copy of an identical one-line string on its own line', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
    const block = {type: 'code', lang: 'bash', code: 'npx astryx doctor'};
    const doc = {
      type: 'generic',
      name: 'acme-setup',
      title: 'Fixture',
      description: 'Fixture topic.',
      sections: [
        {title: 'First', content: [block]},
        {title: 'Second', content: [block]},
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      `export default ${JSON.stringify(doc, null, 2)};\n`,
    );
    const lines = fs
      .readFileSync(path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'), 'utf8')
      .split('\n');
    const copies = lines.flatMap((line, at) =>
      line.includes('"npx astryx doctor"') ? [at + 1] : [],
    );

    const {notes} = await runnerNotes();

    expect(copies).toHaveLength(2);
    expect(
      notes.map((/** @type {any} */ each) => [each.section, each.line]),
    ).toEqual([
      ['First', copies[0]],
      ['Second', copies[1]],
    ]);
  });

  it("places a section's command on its own line when the section sits in a constant above the doc", async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      `export default {docs: './docs'};\n`,
    );
    fs.mkdirSync(path.join(tmpDir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'acme-setup.doc.mjs'),
      [
        "const install = {title: 'Install', content: [{type: 'prose', text: 'Run `npx astryx doctor`.'}]};",
        '',
        'export default {',
        "  type: 'generic',",
        "  name: 'acme-setup',",
        "  title: 'Fixture',",
        "  description: 'Install first: `npx astryx doctor`.',",
        '  sections: [install],',
        '};',
        '',
      ].join('\n'),
    );

    const {notes} = await runnerNotes();

    expect(
      notes.map((/** @type {any} */ each) => [each.section, each.line]),
    ).toEqual(
      expect.arrayContaining([
        [null, 7],
        ['Install', 1],
      ]),
    );
  });

  it('lists package-manager commands, bare commands and broken tokens with the token to write, all for the next minor', async () => {
    writeTopic(
      'Add it with `npm install -D @acme/widgets`, run `astryx search acme`, then {@pm add x} and {@cmd docs}. Only npm: `npm pkg set name=x`.',
    );

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    const notes = (data.notes ?? []).filter(
      (/** @type {any} */ note) => note.code !== 'runner_command',
    );

    expect(
      notes.map((/** @type {any} */ note) => [note.code, note.next]),
    ).toEqual([
      ['package_manager_command', true],
      ['plain_command', true],
      ['doc_token', true],
      ['doc_token', true],
      ['package_manager_command', true],
      // The fixture's install step, in its bash block.
      ['package_manager_command', true],
    ]);
    const messages = notes.map((/** @type {any} */ note) => note.message);
    expect(messages[0]).toContain('{@pm install @acme/widgets --dev}');
    expect(messages[1]).toContain('{@command search acme}');
    expect(messages[2]).toContain('{@pm}` starts with a verb');
    expect(messages[3]).toContain('Doc tokens are');
    expect(messages[4]).toContain(
      '{@pm-only npm "<why only npm>" pkg set name=x}',
    );
    expect(messages[5]).toContain('{@pm dlx @astryxdesign/cli init}');
    expect(data.issues.map((/** @type {any} */ issue) => issue.code)).toEqual(
      [],
    );
  });

  it('reads a verb named alone as a mention, and TSDoc tags in a TypeScript sample as code', async () => {
    writeTopic(
      'Scripts run with `npm run`, `pnpm dlx` fetches a package, and `npm i -g`, `yarn global add` and `npm pkg set` each take one.',
    );
    const file = path.join(tmpDir, 'docs', 'acme-setup.doc.mjs');
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace(
        /\{"type":"code"[^}]*\}/,
        JSON.stringify({
          type: 'code',
          lang: 'ts',
          code: '/** {@inheritDoc Base.render} */\nexport const x = 1;',
        }),
      ),
    );

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    expect(
      (data.notes ?? []).filter((/** @type {any} */ note) =>
        ['package_manager_command', 'doc_token'].includes(note.code),
      ),
    ).toEqual([]);
  });

  it('lists a token that never closes, in prose and in any code block', async () => {
    writeTopic(
      'Install with {@pm install @acme/widgets --dev before you start.',
    );
    const file = path.join(tmpDir, 'docs', 'acme-setup.doc.mjs');
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace(
        /\{"type":"code"[^}]*\}/,
        JSON.stringify({
          type: 'code',
          lang: 'tsx',
          code: '// {@pm install @acme/widgets --dev\nexport const x = 1;',
        }),
      ),
    );

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    const tokens = (data.notes ?? []).filter(
      (/** @type {any} */ note) => note.code === 'doc_token',
    );
    expect(tokens).toHaveLength(2);
    expect(tokens[0].message).toContain('never closes');
  });

  it('lists a {@command} token that names no Astryx command', async () => {
    writeTopic('Run {@command dcotor} before you ship.');

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    const tokens = (data.notes ?? []).filter(
      (/** @type {any} */ note) => note.code === 'doc_token',
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].message).toContain('`dcotor` is not an Astryx command');
  });

  it('reads the command after leading global flags in a {@command} token', async () => {
    writeTopic(
      'Read it as data with {@command --json component Button} or {@command --detail full docs acme}, not {@command --json dcotor}, {@command --json nosuch docs} or {@command --detail full nosuch}. Check the version with {@command --version}; {@command --json} alone names nothing.',
    );
    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    const tokens = (data.notes ?? []).filter(
      (/** @type {any} */ note) => note.code === 'doc_token',
    );
    expect(
      tokens.map(note => note.message.match(/`(\w+)` is not/)?.[1]),
    ).toEqual(['dcotor', 'nosuch', 'nosuch', undefined]);
    expect(tokens[3].message).toContain('names no Astryx command');
  });

  it('lists nothing for a topic written in the doc syntax', async () => {
    writeTopic(
      'Add it with {@pm install @acme/widgets --dev}, run {@command docs acme}, and {@pm-only npm "only npm has pkg" pkg set name=x}. Show the syntax: {@@pm install x}.',
    );
    // The fixture's bash block holds a scoped install step; write it as a token.
    const file = path.join(tmpDir, 'docs', 'acme-setup.doc.mjs');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace(
          'npx @astryxdesign/cli init',
          '{@pm dlx @astryxdesign/cli init}',
        ),
    );

    const {data} = await validateIntegration(undefined, {cwd: tmpDir});
    expect(data.notes ?? []).toEqual([]);
  });

  it('lists nothing for bare commands and the scoped install step', async () => {
    writeTopic('Check it with `astryx doctor` first.');

    const {notes} = await runnerNotes();
    expect((await runnerNotes()).notes).toEqual([]);
  });
});
