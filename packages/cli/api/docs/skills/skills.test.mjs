// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration skills (spec:AST-046 FR15): a doc that declares
 * `skill: {name, description}` is listed and read by `astryx docs skills`,
 * written beside the project skill by `init --to skills` with one pointer
 * line in the block, refreshed by `upgrade --apply`, checked by `doctor`,
 * and listed by `discover`; a skill that breaks a rule is left out with a
 * note while its doc still loads, and a project with no declared skill keeps
 * its block unchanged.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {docs} from '../docs.mjs';
import {init} from '../../init/init.mjs';
import {upgrade} from '../../upgrade/upgrade.mjs';
import {discover} from '../../discover/discover.mjs';
import {runChecks} from '../../doctor/doctor.mjs';
import {discoverIntegrationSkills} from '../../../foundation/discovery/integration-skills.mjs';
import {skillProblem} from '../../../authoring/doctypes/reference/skill.mjs';
import {logger} from '../../logger.mjs';
import {validateLoadedIntegrationListed} from '../../../foundation/integrations/validate-contributions.mjs';

/** @type {string[]} */
const dirs = [];
/** @param {string} label */
const tmp = label => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-int-skills-${label}-`));
  dirs.push(dir);
  return dir;
};

let project = '';
beforeEach(() => {
  const home = tmp('home');
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('XDG_CONFIG_HOME', path.join(home, '.config'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(home, '.cache'));
  project = tmp('app');
  fs.mkdirSync(path.join(project, '.git'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (dirs.length) fs.rmSync(/** @type {string} */ (dirs.pop()), {recursive: true, force: true});
});

/**
 * A project that installs `@acme/widgets`, whose docs hold `docs`.
 * @param {Record<string, string>} docFiles file name → module source
 */
function withIntegration(docFiles) {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '*', '@acme/widgets': '1.0.0'}}),
  );
  fs.writeFileSync(path.join(project, 'astryx.config.mjs'), "export default {integrations: ['@acme/widgets']};\n");
  const pkg = path.join(project, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkg, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({name: '@acme/widgets', version: '1.0.0'}));
  fs.writeFileSync(path.join(pkg, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
  for (const [name, source] of Object.entries(docFiles)) {
    fs.writeFileSync(path.join(pkg, 'docs', name), source);
  }
  return pkg;
}

/** @param {{name?: string, description?: string, topic?: string, prose?: string}} [o] */
const skillDoc = ({name = 'acme-entities', description = 'Use when you show Acme entities in a page.', topic = 'acme-entities-guide', prose = 'Render each entity with AcmeEntity.'} = {}) => `export default {
  type: 'generic',
  name: ${JSON.stringify(topic)},
  title: 'Acme entities',
  description: 'How to show Acme entities.',
  category: 'guide',
  skill: {name: ${JSON.stringify(name)}, description: ${JSON.stringify(description)}},
  sections: [{id: 'use', title: 'Use it', content: [{type: 'prose', text: ${JSON.stringify(prose)}}]}],
};
`;

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(project, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(project, rel));

describe('the skill rules', () => {
  it.each([
    [{name: 'acme-entities', description: 'x'}, null],
    [{name: 'Acme', description: 'x'}, 'lowercase'],
    [{name: 'a--b', description: 'x'}, 'lowercase'],
    [{name: 'astryx', description: 'x'}, 'Astryx skill'],
    [{name: 'astryx-project', description: 'x'}, 'Astryx skill'],
    [{name: `a${'b'.repeat(64)}`, description: 'x'}, '64'],
    [{name: 'ok', description: ' '}, 'needs a description'],
    [{name: 'ok', description: 'two\nlines'}, 'line separators'],
    [{name: 'ok', description: 'x'.repeat(1025)}, '1024'],
  ])('%o', (value, expected) => {
    const problem = skillProblem(value);
    if (expected == null) expect(problem).toBeNull();
    else expect(problem).toContain(expected);
  });
});

describe('docs skills', () => {
  it('lists the project, computer, and integration skills, and reads each', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    const list = await docs('skills', undefined, {cwd: project});
    expect(list.type).toBe('docs.skills');
    expect(list.data.map(each => [each.name, each.package])).toEqual([
      ['astryx-project', '@astryxdesign/cli'],
      ['astryx', '@astryxdesign/cli'],
      ['acme-entities', '@acme/widgets'],
    ]);
    const one = await docs('skills/acme-entities', undefined, {cwd: project});
    expect(one.type).toBe('docs.skill');
    if (one.type !== 'docs.skill') return;
    expect(one.package).toBe('@acme/widgets');
    expect(one.data.text).toContain('# Acme entities');
    expect(one.data.text).toContain('Render each entity with AcmeEntity.');
    const computer = await docs('skills/astryx', undefined, {cwd: project});
    expect(computer).toMatchObject({type: 'docs.skill', package: '@astryxdesign/cli'});
    const block = await docs('skills/astryx-project', undefined, {cwd: project});
    if (block.type !== 'docs.skill') throw new Error(block.type);
    expect(block.data.text).toMatch(/^<!-- ASTRYX:START -->/u);
  });

  it('names the skills when the name is unknown', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await expect(docs('skills/nope', undefined, {cwd: project})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_TOPIC',
    });
  });
});

describe('init --to skills with an integration skill', () => {
  it('writes the skill beside the project skill, and the block points to it', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    const res = await init({to: 'skills'}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.skills.filter(row => row.skill === 'acme-entities').map(row => [row.path, row.action])).toEqual([
      ['.agents/skills/acme-entities/SKILL.md', 'created'],
      ['.claude/skills/acme-entities/SKILL.md', 'created'],
    ]);
    const skill = read('.agents/skills/acme-entities/SKILL.md');
    expect(skill).toBe(read('.claude/skills/acme-entities/SKILL.md'));
    expect(skill).toMatch(/^---\nname: acme-entities\ndescription: "Use when you show Acme entities in a page."\n---\n\n<!-- ASTRYX:START -->\n<!-- astryx-managed sha256:/u);
    expect(skill).toContain('Render each entity with AcmeEntity.');
    expect(read('.agents/skills/astryx-project/SKILL.md')).toContain(
      '- `@acme/widgets` skill `acme-entities`: Use when you show Acme entities in a page. Read it with `astryx docs skills/acme-entities`.',
    );
  });

  it('removes a skill Astryx wrote when its integration no longer declares it', async () => {
    const pkg = withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    // A new file: a module this process already imported is not read again.
    fs.rmSync(path.join(pkg, 'docs', 'entities.doc.mjs'));
    fs.writeFileSync(path.join(pkg, 'docs', 'renamed.doc.mjs'), skillDoc({name: 'acme-renamed', topic: 'acme-renamed-guide'}));
    const res = await init({}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(exists('.agents/skills/acme-entities')).toBe(false);
    expect(exists('.agents/skills/acme-renamed/SKILL.md')).toBe(true);
    expect(res.data.skills.some(row => row.skill === 'acme-entities' && row.action === 'removed')).toBe(true);
  });

  it('never sweeps a leftover skill through a skill folder linked out of the project', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    // Another project's unedited Astryx skill, linked into this one.
    const other = tmp('other');
    fs.mkdirSync(path.join(other, 'acme-old'), {recursive: true});
    fs.copyFileSync(path.join(project, '.claude', 'skills', 'acme-entities', 'SKILL.md'), path.join(other, 'acme-old', 'SKILL.md'));
    fs.symlinkSync(path.join(other, 'acme-old'), path.join(project, '.claude', 'skills', 'acme-old'), 'dir');
    await init({}, {cwd: project});
    expect(fs.existsSync(path.join(other, 'acme-old', 'SKILL.md'))).toBe(true);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a docs folder it cannot read leaves that integration\'s skills out, keeps their copies, and init still finishes',
    async () => {
      withIntegration({'entities.doc.mjs': skillDoc()});
      await init({to: 'agents-md,skills'}, {cwd: project});
      const pointer = '`@acme/widgets` skill `acme-entities`';
      expect(read('AGENTS.md')).toContain(pointer);
      const drafts = path.join(project, 'node_modules', '@acme', 'widgets', 'docs', 'drafts');
      fs.mkdirSync(drafts);
      fs.chmodSync(drafts, 0o000);
      try {
        const res = await init({}, {cwd: project});
        expect(res.type).toBe('init.run');
        const list = await docs('skills', undefined, {cwd: project});
        expect(list.data.map(each => each.name)).not.toContain('acme-entities');
        expect(list.meta?.notes).toEqual([
          expect.objectContaining({package: '@acme/widgets', message: expect.stringContaining('docs folder could not be read')}),
        ]);
        await expect(docs('skills/acme-entities', undefined, {cwd: project})).rejects.toThrow(
          'Note: @acme/widgets: its docs folder could not be read',
        );
        // The copies stay until the folder can be read; the block names only
        // skills `docs skills` can read, so the pointer line goes.
        expect(exists('.agents/skills/acme-entities/SKILL.md')).toBe(true);
        expect(exists('.claude/skills/acme-entities/SKILL.md')).toBe(true);
        expect(read('AGENTS.md')).not.toContain(pointer);
        expect(read('.agents/skills/astryx-project/SKILL.md')).not.toContain(pointer);
      } finally {
        fs.chmodSync(drafts, 0o755);
      }
    },
  );

  it('a package whose doc or manifest does not load is unread, so no copy is swept', async () => {
    const docs = tmp('docs');
    fs.writeFileSync(path.join(docs, 'entities.doc.mjs'), '');
    const broken = await discoverIntegrationSkills([{name: '@acme/widgets', docs}], {
      read: async () => {
        throw new Error('broken');
      },
    });
    expect(broken.unread).toEqual(['@acme/widgets']);
    expect(broken.problems[0]).toMatchObject({package: '@acme/widgets', unread: true});
    const unloaded = await discoverIntegrationSkills([{name: '@acme/gone', __loadError: 'no manifest'}]);
    expect(unloaded.unread).toEqual(['@acme/gone']);
  });

  it('init --remove --to a folder saved for this computer keeps the integration skills there', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    // Another project's unedited integration skill in a computer folder.
    const team = path.join(os.homedir(), 'team-skills');
    fs.mkdirSync(path.join(team, 'acme-entities'), {recursive: true});
    fs.copyFileSync(path.join(project, '.claude', 'skills', 'acme-entities', 'SKILL.md'), path.join(team, 'acme-entities', 'SKILL.md'));
    await init({to: team}, {cwd: project});
    await init({remove: true, to: team}, {cwd: project});
    expect(fs.existsSync(path.join(team, 'astryx', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(team, 'acme-entities', 'SKILL.md'))).toBe(true);
  });

  it('never writes an integration skill through a skill folder linked out of the project', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    const other = tmp('other');
    fs.mkdirSync(path.join(other, 'acme-entities'), {recursive: true});
    fs.mkdirSync(path.join(project, '.claude', 'skills'), {recursive: true});
    fs.symlinkSync(path.join(other, 'acme-entities'), path.join(project, '.claude', 'skills', 'acme-entities'), 'dir');
    await init({to: 'skills'}, {cwd: project});
    expect(fs.existsSync(path.join(other, 'acme-entities', 'SKILL.md'))).toBe(false);
    expect(exists('.agents/skills/acme-entities')).toBe(false);
    // An older copy there is not rewritten by upgrade either.
    fs.writeFileSync(path.join(other, 'acme-entities', 'SKILL.md'), 'theirs\n');
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.0.15'}));
    await upgrade({from: '0.0.15', apply: true}, {cwd: project});
    expect(fs.readFileSync(path.join(other, 'acme-entities', 'SKILL.md'), 'utf8')).toBe('theirs\n');
  });

  it('keeps a person\'s own skill of the same name, in both folders', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    fs.mkdirSync(path.join(project, '.claude', 'skills', 'acme-entities'), {recursive: true});
    fs.writeFileSync(path.join(project, '.claude', 'skills', 'acme-entities', 'SKILL.md'), '# mine\n');
    const res = await init({to: 'skills'}, {cwd: project});
    if (res.type !== 'init.run') throw new Error(res.type);
    expect(res.data.skills.filter(row => row.skill === 'acme-entities').map(row => row.reason)).toEqual([
      'pair-kept',
      'not-astryx',
    ]);
    expect(exists('.agents/skills/acme-entities')).toBe(false);
  });

  it('--remove takes the integration skills with it, each row naming its skill', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    const res = await init({remove: true}, {cwd: project});
    if (res.type !== 'init.remove') throw new Error(res.type);
    expect(res.data.skills.filter(row => row.path.includes('acme-entities')).map(row => row.skill)).toEqual([
      'acme-entities',
      'acme-entities',
    ]);
    expect(res.data.skills.filter(row => row.path.includes('astryx-project')).every(row => row.skill == null)).toBe(true);
    expect(exists('.agents')).toBe(false);
    expect(exists('.claude')).toBe(false);
  });
});

describe('discover', () => {
  it('lists the skills a package declares', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    vi.spyOn(process, 'cwd').mockReturnValue(project);
    const res = await discover(undefined, {});
    const entry = res.data.find(each => each.name === '@acme/widgets');
    expect(entry?.skills).toEqual(['acme-entities']);
  });
});

describe('a skill that breaks a rule', () => {
  it('is left out with a note, and its doc still loads', async () => {
    const pkg = withIntegration({
      'entities.doc.mjs': skillDoc({name: 'Bad Name'}),
      'other.doc.mjs': skillDoc({topic: 'acme-other', name: 'acme-other'}),
    });
    const loaded = {name: '@acme/widgets', docs: path.join(pkg, 'docs')};
    const {skills, problems} = await discoverIntegrationSkills([loaded]);
    expect(skills.map(each => each.name)).toEqual(['acme-other']);
    expect(problems[0]?.message).toContain('entities.doc.mjs: skill name "Bad Name"');
    const topic = await docs('acme-entities-guide', undefined, {cwd: project});
    expect(topic.type).toBe('docs.detail');
    const checked = await validateLoadedIntegrationListed(
      /** @type {any} */ ({...loaded, __packageDir: pkg, __manifestFile: path.join(pkg, 'astryx.integration.mjs')}),
    );
    expect(checked.notes.find(note => note.code === 'invalid_skill')).toMatchObject({next: true});
  });

  it.each([
    ['a description with the block end marker', `{name: 'acme-x', description: 'Use it <!-- ASTRYX:END -->'}`, 'marker'],
    ['no description', `{name: 'acme-x'}`, 'needs a description'],
    ['a string', `'acme-x'`, 'must be an object'],
  ])('%s is left out, and every doc of the package still loads', async (_label, value, why) => {
    const pkg = withIntegration({
      'bad.doc.mjs': skillDoc({topic: 'acme-bad'}).replace(/skill: \{[^}]*\}/u, `skill: ${value}`),
      'other.doc.mjs': skillDoc({topic: 'acme-other', name: 'acme-other'}),
    });
    const {skills, problems} = await discoverIntegrationSkills([{name: '@acme/widgets', docs: path.join(pkg, 'docs')}]);
    expect(skills.map(each => each.name)).toEqual(['acme-other']);
    expect(problems[0]?.message).toContain(why);
    expect((await docs('acme-bad', undefined, {cwd: project})).type).toBe('docs.detail');
  });

  it('a person\'s own copy of an integration skill is named for that skill, not mixed with the project skill', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    fs.mkdirSync(path.join(project, '.claude', 'skills', 'acme-entities'), {recursive: true});
    fs.writeFileSync(path.join(project, '.claude', 'skills', 'acme-entities', 'SKILL.md'), '# mine\n');
    await init({to: 'skills'}, {cwd: project});
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check?.message).toContain('acme-entities in skills');
    expect(check?.message).not.toContain('astryx-project');
  });

  it('a skill whose doc the tree withdrew is left out everywhere, and never reads another doc', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    // A second package ships a doc of the same name, with a skill of its own.
    const second = path.join(project, 'node_modules', '@acme', 'more');
    fs.mkdirSync(path.join(second, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(second, 'package.json'), JSON.stringify({name: '@acme/more', version: '1.0.0'}));
    fs.writeFileSync(path.join(second, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
    fs.writeFileSync(path.join(second, 'docs', 'same.doc.mjs'), skillDoc({name: 'more-skill'}));
    fs.writeFileSync(path.join(project, 'astryx.config.mjs'), "export default {integrations: ['@acme/widgets', '@acme/more']};\n");
    const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
    pkg.dependencies['@acme/more'] = '1.0.0';
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(pkg));
    const list = await docs('skills', undefined, {cwd: project});
    expect(list.data.map(each => each.name)).toContain('acme-entities');
    expect(list.data.map(each => each.name)).not.toContain('more-skill');
    await init({to: 'skills'}, {cwd: project});
    expect(exists('.agents/skills/more-skill')).toBe(false);
    expect(read('.agents/skills/astryx-project/SKILL.md')).not.toContain('more-skill');
  });

  it('a name an earlier package holds is left out', async () => {
    const first = {name: '@acme/a', docs: tmp('a')};
    const second = {name: '@acme/b', docs: tmp('b')};
    fs.writeFileSync(path.join(first.docs, 'x.doc.mjs'), skillDoc());
    fs.writeFileSync(path.join(second.docs, 'x.doc.mjs'), skillDoc());
    const {skills, problems} = await discoverIntegrationSkills([first, second]);
    expect(skills.map(each => each.package)).toEqual(['@acme/a']);
    expect(problems[0]).toMatchObject({package: '@acme/b'});
    expect(problems[0]?.message).toContain('a skill of @acme/a');
  });
});

describe('upgrade, doctor, and a project with no declared skill', () => {
  it('upgrade --apply writes a missing integration skill', async () => {
    withIntegration({'entities.doc.mjs': skillDoc()});
    await init({to: 'skills'}, {cwd: project});
    fs.rmSync(path.join(project, '.agents', 'skills', 'acme-entities'), {recursive: true});
    const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(core, {recursive: true});
    fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.0.15'}));
    const dry = await upgrade({from: '0.0.15'}, {cwd: project});
    expect(dry.data.agentDocs.skills.find(row => row.skill === 'acme-entities' && row.action === 'would-create')).toBeTruthy();
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('.agents/skills/acme-entities/SKILL.md');
    await upgrade({from: '0.0.15', apply: true}, {cwd: project});
    expect(exists('.agents/skills/acme-entities/SKILL.md')).toBe(true);
  });

  it('a project whose integrations declare no skill gets the block it got before', async () => {
    withIntegration({
      'plain.doc.mjs': `export default {type: 'generic', name: 'acme-plain', title: 'Plain', description: 'No skill.', sections: [{title: 'A', content: [{type: 'prose', text: 'a'}]}]};\n`,
    });
    await init({}, {cwd: project});
    expect(read('AGENTS.md')).not.toContain('INTEGRATIONS:');
  });

  it('doctor names a stale skill and a left-out one together, and init is the fix', async () => {
    const pkg = withIntegration({
      'entities.doc.mjs': skillDoc(),
      'bad.doc.mjs': skillDoc({topic: 'acme-bad', name: 'Bad Name'}),
    });
    await init({to: 'skills'}, {cwd: project});
    // A new doc file: a module this process imported is not read again.
    fs.rmSync(path.join(pkg, 'docs', 'entities.doc.mjs'));
    fs.writeFileSync(path.join(pkg, 'docs', 'entities2.doc.mjs'), skillDoc({topic: 'acme-entities-v2', prose: 'Use AcmeEntityCard now.'}));
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('from another release in .agents/skills/acme-entities/SKILL.md');
    expect(check?.message).toContain('Skills left out: @acme/widgets: bad.doc.mjs');
    expect(check?.fix).toContain('init');
    expect(check?.fix).toContain('after an integration changes');
  });

  it('a block-only project hears about a left-out skill from init and doctor', async () => {
    withIntegration({'bad.doc.mjs': skillDoc({topic: 'acme-bad', name: 'Bad Name'})});
    const warn = vi.spyOn(logger, 'warn');
    await init({}, {cwd: project});
    expect(warn.mock.calls.flat().join('\n')).toContain('skill name "Bad Name"');
    const doctor = await runChecks({cwd: project});
    const check = doctor.checks.find(each => each.id === 'skill-places');
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toContain('Skills left out');
  });
});
