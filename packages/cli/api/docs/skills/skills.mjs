// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.skills and docs.skill leaves: `astryx docs skills` lists every
 * Astryx skill this folder has, and `astryx docs skills/<name>` reads one. The
 * skills are the project skill (`astryx-project`, the project's agent-docs
 * block) in a project, the computer-level skill (`astryx`), and each skill an
 * integration declares on one of its docs (`skill: {name, description}`,
 * spec:AST-046). The AGENTS.md block points agents here for integration
 * skills.
 *
 * @input  a skill name, the folder the command runs in
 * @output `docs.skills` or `docs.skill`; and, for the skill places, each
 *   integration skill's SKILL.md
 * @position Leaf under api/docs, read by docs.mjs and the init, upgrade and
 *   doctor adapters
 */

import {detail} from '../detail/detail.mjs';
import {projectIntegrationSkills, skillsProjectRoot} from '../_adapter.mjs';
import {formatReferenceFull} from '../../../foundation/doc-compiler/doc-text.mjs';
import {
  formatCliCommand,
  getCliInvocation,
} from '../../../foundation/env/package-manager.mjs';
import {renderProjectAgentDocsBlock} from '../_adapter.mjs';
import {
  COMPUTER_SKILL_NAME,
  PROJECT_SKILL_DESCRIPTION,
  PROJECT_SKILL_NAME,
  renderIntegrationSkill,
} from '../../../foundation/agent-docs/skill-places.mjs';
import {
  COMPUTER_SKILL_DESCRIPTION,
  renderComputerSkillBody,
} from '../../../foundation/agent-docs/computer-agent-text.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/** The route `astryx docs` reads skills under. */
export const SKILLS_ROUTE = 'skills';

/** The package that ships the project and computer skills. */
const CLI_PACKAGE = '@astryxdesign/cli';

/**
 * Whether `topic` is the skills route or a skill under it.
 * @param {string | undefined} topic
 * @returns {boolean}
 */
export function isSkillsRoute(topic) {
  return (
    topic === SKILLS_ROUTE ||
    (typeof topic === 'string' && topic.startsWith(`${SKILLS_ROUTE}/`))
  );
}

/**
 * Every skill this folder has: the project skill in a project, the computer
 * skill, then each integration skill in load order, and why each declared
 * skill left out was left out.
 * @param {string} cwd
 * @returns {Promise<{list: Array<{name: string, description: string, package: string, route?: string}>, problems: Array<{package: string, message: string}>}>}
 */
async function allSkills(cwd) {
  const root = skillsProjectRoot(cwd);
  const {skills: declared, problems} = await projectIntegrationSkills(cwd);
  const list = [
    ...(root
      ? [
          {
            name: PROJECT_SKILL_NAME,
            description: PROJECT_SKILL_DESCRIPTION,
            package: CLI_PACKAGE,
          },
        ]
      : []),
    {
      name: COMPUTER_SKILL_NAME,
      description: COMPUTER_SKILL_DESCRIPTION,
      package: CLI_PACKAGE,
    },
    ...declared.map(({name, description, package: pkg, route}) => ({
      name,
      description,
      package: pkg,
      route,
    })),
  ];
  return {list, problems};
}

/**
 * `astryx docs skills`.
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../docs.type.mjs').DocsSkillsResponse>}
 */
export async function skills({cwd = process.cwd()} = {}) {
  const {list, problems} = await allSkills(cwd);
  return {
    type: 'docs.skills',
    data: list.map(({name, description, package: pkg}) => ({
      name,
      description,
      package: pkg,
    })),
    ...(problems.length > 0
      ? {
          meta: {
            notes: problems.map(each => ({
              package: each.package,
              message: each.message,
            })),
          },
        }
      : {}),
  };
}

/**
 * The text of one integration skill's doc, as `astryx docs` prints it, with
 * commands spelled the way the project runs the CLI.
 * @param {{route: string}} declared
 * @param {string} cwd
 * @returns {Promise<string>}
 */
async function integrationSkillBody(declared, cwd) {
  const read = await detail(declared.route, {cwd});
  return formatReferenceFull(read.data, 'full', getCliInvocation(cwd));
}

/**
 * `astryx docs skills/<name>`: one skill's text.
 * @param {string} name
 * @param {{cwd?: string}} [options]
 * @returns {Promise<import('../docs.type.mjs').DocsSkillResponse>}
 */
export async function skill(name, {cwd = process.cwd()} = {}) {
  const {list, problems} = await allSkills(cwd);
  const found = list.find(each => each.name === name);
  if (found == null) {
    // A skill left out is missing for a reason the reader can fix: say it.
    const why = problems
      .map(each => ` Note: ${each.package}: ${each.message}`)
      .join('');
    throw new AstryxError(
      `No skill named "${name}" here. List the skills with \`${formatCliCommand(`docs ${SKILLS_ROUTE}`, cwd)}\`.${why}`,
      list.map(each => ({
        name: `${SKILLS_ROUTE}/${each.name}`,
        reason: each.description,
      })),
      ERROR_CODES.ERR_UNKNOWN_TOPIC,
    );
  }
  const root = skillsProjectRoot(cwd);
  let text;
  if (found.name === PROJECT_SKILL_NAME && root) {
    text = await renderProjectAgentDocsBlock(root);
  } else if (found.name === COMPUTER_SKILL_NAME) {
    text = renderComputerSkillBody();
  } else {
    text = await integrationSkillBody(
      /** @type {{route: string}} */ (found),
      cwd,
    );
  }
  return {
    type: 'docs.skill',
    package: found.package,
    data: {name: found.name, description: found.description, text},
  };
}

/**
 * Each integration skill's SKILL.md for the project at `projectRoot`, and why
 * each skill left out was left out. `keep` names every skill still declared,
 * one whose text could not be read included, and `complete` is false when an
 * integration's docs could not be read (see projectIntegrationSkills): a caller removes a leftover
 * copy only when `complete`, and never one `keep` names.
 * @param {string} projectRoot
 * @returns {Promise<{skills: Array<{name: string, package: string, text: string}>, problems: Array<{package: string, message: string, unread?: true}>, keep: Set<string>, complete: boolean}>}
 */
export async function integrationSkillFiles(projectRoot) {
  const {
    skills: declared,
    problems,
    complete,
  } = await projectIntegrationSkills(projectRoot);
  /** @type {Array<{name: string, package: string, text: string}>} */
  const files = [];
  for (const each of declared) {
    try {
      const body = await integrationSkillBody(each, projectRoot);
      files.push({
        name: each.name,
        package: each.package,
        text: renderIntegrationSkill({
          name: each.name,
          description: each.description,
          body,
        }),
      });
    } catch (err) {
      problems.push({
        package: each.package,
        message: `skill "${each.name}" could not be read: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return {
    skills: files,
    problems,
    keep: new Set(declared.map(each => each.name)),
    complete,
  };
}
