// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input GitHub workflow YAML and root package scripts.
 * @output Independent visual-regression owners that violate AST-030 FR12.
 * @position Repository guard; runs through check:repo, not a new CI lane.
 *
 * This is an ownership tripwire, not a shell interpreter. Inspect executable
 * commands/actions and visual artifact producers, not comments or every use of
 * Playwright, Storybook, screenshots, or upload/download-artifact. Those also
 * serve deployments, a11y, RTL, and vibe evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = 'ci.yml';
const VISUAL_COMMAND = [
  /(?:^|[\s/'"`])gate\.mjs[\s\\]+(?:["']?(?:check|capture|release|flaky)\b|["']?\$)/i,
  /\bvisual:(?:check|flaky)\b/i,
  /\b(?:chromatic|chromaui|percy|backstop|reg-suit|loki)\b/i,
  /\b(?:toHaveScreenshot|toMatchImageSnapshot|pixelmatch|compareCaptures)\s*\(/,
  /\bvisual[-_ ]regression\b/i,
];
const VISUAL_ARTIFACT =
  /^(?:visual-(?:pr-report|capture|report|baseline)|.*visual[-_]regression)(?:$|[-_*])/i;

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}

function visualCommand(command, scripts, seen = new Set()) {
  // YAML comments are already gone; ignore shell comment-only lines too.
  const executable = command.replace(/^\s*#.*$/gm, '');
  if (VISUAL_COMMAND.some(pattern => pattern.test(executable))) return true;
  // A package-script alias must not hide an otherwise identical second owner.
  for (const match of executable.matchAll(
    /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?([\w:.-]+)/g,
  )) {
    const name = match[1];
    if (!scripts[name] || seen.has(name)) continue;
    seen.add(name);
    if (visualCommand(scripts[name], scripts, seen)) return true;
  }
  return false;
}

/** Return one actionable error per independently executing workflow job. */
export function findVisualOwners(workflows, scripts = {}) {
  const errors = [];
  for (const [file, source] of Object.entries(workflows)) {
    let workflow;
    try {
      workflow = YAML.parse(source);
    } catch (error) {
      errors.push(`${file}: invalid workflow YAML: ${error.message}`);
      continue;
    }
    if (!workflow?.jobs || typeof workflow.jobs !== 'object') {
      errors.push(`${file}: workflow has no jobs`);
      continue;
    }
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      const steps = job.steps ?? [];
      const commands = [
        job.uses,
        ...steps.flatMap(step => [step.run, step.uses, step.with?.script]),
      ].filter(value => typeof value === 'string');
      const artifactProducer = steps.some(
        step =>
          /^actions\/upload-artifact@/.test(step.uses ?? '') &&
          strings([step.with?.name, step.with?.path]).some(value =>
            value.split(/[\s/]+/).some(part => VISUAL_ARTIFACT.test(part)),
          ),
      );
      const namedVisualOwner = strings([
        workflow.name,
        jobId,
        job.name,
        ...steps.map(step => step.name),
      ]).some(name => /\bvisual[-_ ]regression\b/i.test(name));
      if (
        commands.some(command => visualCommand(command, scripts)) ||
        artifactProducer ||
        namedVisualOwner
      ) {
        if (file !== CANONICAL || jobId !== 'pr-visual') {
          errors.push(
            `${file} → ${jobId}: visual regression belongs in ci.yml → pr-visual (AST-030 FR12)`,
          );
        }
      }
    }
  }
  let canonical;
  try {
    canonical = workflows[CANONICAL] && YAML.parse(workflows[CANONICAL]);
  } catch {
    // The parse error is already reported above; absence must not pass either.
  }
  if (
    !canonical?.jobs?.['pr-visual']?.steps?.some(step =>
      /gate\.mjs\s+(?:["']?check\b|["']?\$COMMAND\b)/.test(step.run ?? ''),
    )
  ) {
    errors.push(
      'ci.yml → pr-visual: canonical Storybook visual check is missing',
    );
  }
  return errors;
}

export function checkVisualWorkflowOwner(root = ROOT) {
  const directory = path.join(root, '.github/workflows');
  const workflows = Object.fromEntries(
    fs
      .readdirSync(directory)
      .filter(file => /\.ya?ml$/.test(file))
      .map(file => [file, fs.readFileSync(path.join(directory, file), 'utf8')]),
  );
  const {scripts = {}} = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  return findVisualOwners(workflows, scripts);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkVisualWorkflowOwner();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      'Visual regression has one workflow owner: ci.yml → pr-visual.',
    );
  }
}
