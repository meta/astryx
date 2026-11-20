// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The skills integrations declare: each doc under an integration's
 * docs root that sets `skill` (spec:AST-046), checked against the skill rules
 * and made unique across the integrations, in load order.
 *
 * @input  the loaded integrations
 * @output the skills, and why each one left out was left out
 * @position foundation/discovery — read by the docs adapter, which renders
 *   each skill and serves `astryx docs skills/<name>`
 */

import {docsRootFiles, loadTopicModule} from './docs-discovery.mjs';
import {parseReadableDoc} from '../doc-compiler/parse-readable.mjs';
import {skillProblem} from '../../authoring/doctypes/reference/skill.mjs';
import * as path from 'node:path';

/**
 * One skill an integration declares.
 * @typedef {object} IntegrationSkill
 * @property {string} name the skill's name and folder name
 * @property {string} description when an agent loads it
 * @property {string} package the integration that declares it
 * @property {string} file the doc file that declares it
 * @property {string} doc the doc's name
 */

/**
 * The skills the integrations declare, and a problem for each one left out:
 * one that breaks a skill rule, or whose name an earlier integration's skill
 * already holds.
 * @param {ReadonlyArray<{name?: string, docs?: string, __spec?: string, __loadError?: string}>} integrations
 *   in load order
 * @param {{read?: (file: string) => Promise<unknown>}} [options]
 * @returns {Promise<{skills: IntegrationSkill[], problems: Array<{package: string, message: string, unread?: true}>, unread: string[]}>}
 */
export async function discoverIntegrationSkills(integrations, {read = loadTopicModule} = {}) {
  /** @type {IntegrationSkill[]} */
  const skills = [];
  /** @type {Array<{package: string, message: string, unread?: true}>} */
  const problems = [];
  /** @type {string[]} the packages whose docs folder could not be read */
  const unread = [];
  /** @type {Map<string, string>} */
  const owners = new Map();
  for (const integration of integrations) {
    if (!integration?.docs && !integration?.__loadError) continue;
    const pkg = integration.name ?? integration.__spec ?? '';
    // An integration that did not load declares skills nobody can read now:
    // they are unknown, not gone, so their copies stay.
    if (integration.__loadError) {
      unread.push(pkg);
      problems.push({
        package: pkg,
        message: 'it did not load; its skills are left out, and the copies already written stay until it loads.',
        unread: true,
      });
      continue;
    }
    if (!integration.docs) continue;
    // A docs folder that cannot be read leaves this integration's skills out
    // with a note; the run goes on.
    let files;
    try {
      files = docsRootFiles(integration.docs);
    } catch (err) {
      const code = /** @type {{code?: unknown}} */ (err ?? {}).code;
      unread.push(pkg);
      problems.push({
        package: pkg,
        message: `its docs folder could not be read${typeof code === 'string' ? ` (${code})` : ''}; its skills are left out, and the copies already written stay until it can be read.`,
        unread: true,
      });
      continue;
    }
    for (const file of files) {
      let doc;
      try {
        doc = /** @type {any} */ (parseReadableDoc(await read(file), path.basename(file)));
      } catch {
        // A doc that does not load may declare a skill: the package's skills
        // are unknown, so no copy is removed as a leftover. The docs checks
        // report why it did not load.
        if (!unread.includes(pkg)) {
          unread.push(pkg);
          problems.push({
            package: pkg,
            message: `${path.basename(file)} did not load; the copies of this package's skills already written stay until it loads.`,
            unread: true,
          });
        }
        continue;
      }
      const skill = doc?.skill;
      if (skill == null) continue;
      const shown = path.relative(integration.docs, file).split(path.sep).join('/');
      const problem = skillProblem(skill);
      if (problem) {
        problems.push({package: pkg, message: `${shown}: ${problem}; the skill is left out, and the doc still loads.`});
        continue;
      }
      const owner = owners.get(skill.name);
      if (owner != null) {
        problems.push({
          package: pkg,
          message: `${shown}: skill name "${skill.name}" is already ${owner === pkg ? 'used by another doc of this package' : `the name of a skill of ${owner}`}; the skill is left out, and the doc still loads.`,
        });
        continue;
      }
      owners.set(skill.name, pkg);
      skills.push({name: skill.name, description: skill.description.trim(), package: pkg, file, doc: doc.name});
    }
  }
  return {skills, problems, unread};
}
