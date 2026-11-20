// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The places `init --to` takes: keywords, folders written as paths
 * and their scope, refusals, the saved value, and the project skill text.
 */

import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  VALID_PLACES_HINT,
  parsePlaces,
  placeNames,
  projectPlacesValue,
  renderProjectSkill,
  savedProjectPlaces,
} from './skill-places.mjs';

const root = path.resolve('/work/app');
const home = path.resolve('/home/me');
const where = {cwd: root, projectRoot: root, home};

describe('parsePlaces', () => {
  it('reads keywords and folders, a folder in the project as a project place', () => {
    expect(parsePlaces(placeNames('agents-md, skills,user'), where)).toEqual([
      {scope: 'project', kind: 'agents-md'},
      {scope: 'project', kind: 'skills'},
      {scope: 'computer', kind: 'user'},
    ]);
    expect(parsePlaces(['./team'], where)).toEqual([
      {
        scope: 'project',
        kind: 'folder',
        dir: path.join(root, 'team'),
        saved: './team',
      },
    ]);
    expect(parsePlaces(['~/team'], where)).toEqual([
      {
        scope: 'computer',
        kind: 'folder',
        dir: path.join(home, 'team'),
        saved: '~/team',
      },
    ]);
    expect(parsePlaces(['../shared'], where)[0]).toMatchObject({
      scope: 'computer',
    });
  });

  it('refuses a word that is not a place, and skills outside a project', () => {
    expect(() => parsePlaces(['skils'], where)).toThrow(
      `Unknown place "skils". ${VALID_PLACES_HINT}`,
    );
    expect(() =>
      parsePlaces(['skills'], {...where, projectRoot: null}),
    ).toThrow('not in a project');
    expect(() => parsePlaces([], where)).toThrow('needs a place');
  });
});

describe('the saved value', () => {
  it('is no key for the default alone, one name, or a list', () => {
    expect(projectPlacesValue(parsePlaces(['agents-md'], where))).toBeNull();
    expect(projectPlacesValue(parsePlaces(['skills'], where))).toBe('skills');
    expect(projectPlacesValue(parsePlaces(['skills', './x'], where))).toEqual([
      'skills',
      './x',
    ]);
  });

  it('reads back as the same places; nothing saved means agents-md; an unknown name is left out', () => {
    expect(savedProjectPlaces(undefined, root)).toEqual([
      {scope: 'project', kind: 'agents-md'},
    ]);
    expect(
      savedProjectPlaces({skills: {to: ['skills', './x', 'later-kind']}}, root),
    ).toEqual([
      {scope: 'project', kind: 'skills'},
      {
        scope: 'project',
        kind: 'folder',
        dir: path.join(root, 'x'),
        saved: './x',
      },
    ]);
  });
});

describe('renderProjectSkill', () => {
  it('puts the block under frontmatter with a hash line, and needs the block', () => {
    const text = renderProjectSkill(
      '<!-- ASTRYX:START -->\nbody\n<!-- ASTRYX:END -->',
    );
    expect(text).toMatch(
      /^---\nname: astryx-project\ndescription: ".+"\n---\n\n<!-- ASTRYX:START -->\n<!-- astryx-managed sha256:[0-9a-f]{64} -->\nbody\n<!-- ASTRYX:END -->\n$/u,
    );
    expect(() => renderProjectSkill('body')).toThrow('managed block');
  });
});

describe('savedComputerFolderSkillFile', () => {
  it('reads ~/ from the home folder and keeps an absolute folder', async () => {
    const {savedComputerFolderSkillFile} = await import('./skill-places.mjs');
    expect(savedComputerFolderSkillFile('~/team', home)).toBe(path.join(home, 'team', 'astryx', 'SKILL.md'));
    expect(savedComputerFolderSkillFile(path.join(root, 'x'), home)).toBe(path.join(root, 'x', 'astryx', 'SKILL.md'));
  });
});
