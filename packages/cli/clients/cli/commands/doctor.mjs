// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx doctor` project health and integration-authoring diagnostics.
 * Human output uses plain stable tokens; every leaf also has a typed JSON
 * response. Template-conflict fields follow the package release boundary.
 * Exit 1 means a check found an error, while warnings remain exit 0.
 *
 * @input Typed Doctor and integration-authoring API responses.
 * @output Human-readable records or pass-through typed JSON.
 * @position CLI presentation adapter for project and integration health.
 */

import {runChecks} from '../../../api/doctor/doctor.mjs';
import {
  integrationComponentConflicts,
  integrationDocConflicts,
  integrationTemplateConflicts,
} from '../../../api/integration/authoring-checks.mjs';
import {
  summarizeIssues,
  validateIntegration,
} from '../../../api/integration/validate-integration.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {
  emit,
  list,
  section,
  record,
  records,
  text,
} from '../formatters/index.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {doc as doctorCommand} from './doctor.doc.mjs';
import {doc as doctorIntegrationGroup} from './doctor-integration.doc.mjs';
import {doc as doctorIntegrationValidateCommand} from './doctor-integration-validate.doc.mjs';
import {doc as doctorIntegrationTemplatesCommand} from './doctor-integration-templates.doc.mjs';
import {doc as doctorIntegrationComponentsCommand} from './doctor-integration-components.doc.mjs';
import {doc as doctorIntegrationDocsCommand} from './doctor-integration-docs.doc.mjs';
import {doc as doctorFn} from '../../../api/doctor/doctor.doc.mjs';
import {doc as validateIntegrationFn} from '../../../api/integration/validateIntegration.doc.mjs';
import {doc as integrationTemplateConflictsFn} from '../../../api/integration/integrationTemplateConflicts.doc.mjs';
import {doc as integrationComponentConflictsFn} from '../../../api/integration/integrationComponentConflicts.doc.mjs';
import {doc as integrationDocConflictsFn} from '../../../api/integration/integrationDocConflicts.doc.mjs';
import {NO_RESULT_SET} from '../../../foundation/debug/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';
import {isOutsideProject} from '../../../foundation/env/project-scope.mjs';

const STATUS = {
  pass: '[ok]',
  warn: '[warn]',
  warning: '[warn]',
  fail: '[fail]',
  error: '[fail]',
  info: '[info]',
};

/** @param {string} status */
function statusToken(status) {
  return STATUS[/** @type {keyof typeof STATUS} */ (status)] ?? status;
}

/** @param {{name: string | null, version: string | null}} data */
function integrationLabel(data) {
  return data.version != null ? `${data.name}@${data.version}` : data.name;
}

/**
 * @param {import('../../../api/doctor/doctor.mjs').DoctorReport} report
 */
function printHuman(report) {
  const {warn, fail} = report.summary;
  const closing =
    fail > 0
      ? 'Some checks failed. Address the items marked [fail] above.'
      : warn > 0
        ? 'No failures — but review the [warn] warnings above when you can.'
        : 'All checks passed. Your Astryx setup looks healthy.';

  // Field names are the JSON keys, so text and --json map one to one.
  emit(
    section('astryx doctor — diagnosing your setup'),
    records(report.checks, {
      fields: ['id', 'status', 'label', 'message', 'fix'],
      format: {status: statusToken},
    }),
    section('summary'),
    record(report.summary, {fields: ['pass', 'warn', 'fail', 'info']}),
    text(closing),
  );
}

/**
 * @param {Array<{code: string, severity: string, message: string}>} issues
 * @param {Set<string>} [seen] issues an earlier check printed
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function issueBlocks(issues, seen) {
  const fresh = unseen(issues, seen);
  if (fresh.length === 0) return alsoApply(issues, fresh);
  return [
    section('Integration issues'),
    records(fresh, {
      fields: ['severity', 'code', 'message', 'fix', 'file', 'line'],
      format: {severity: statusToken},
    }),
    ...alsoApply(issues, fresh),
  ];
}

/**
 * The issues not printed yet, recording them as printed. `integration
 * check` runs several checks that each report an experimental icon set's
 * package-wide issues; each is printed once, under the first check. Every
 * other issue prints under each check that reports it, as it always has.
 * @template {{code: string, message: string}} T
 * @param {T[]} issues
 * @param {Set<string> | undefined} seen
 * @returns {T[]}
 */
function unseen(issues, seen) {
  if (!seen) return issues;
  const once = (/** @type {T} */ issue) => /icon/u.test(issue.code);
  const fresh = issues.filter(
    issue => !once(issue) || !seen.has(`${issue.code}\0${issue.message}`),
  );
  for (const issue of issues) {
    if (once(issue)) seen.add(`${issue.code}\0${issue.message}`);
  }
  return fresh;
}

/**
 * One line naming the issues an earlier check already printed.
 * @param {unknown[]} issues
 * @param {unknown[]} fresh
 */
function alsoApply(issues, fresh) {
  const repeated = issues.length - fresh.length;
  if (repeated === 0) return [];
  return [
    text(
      `${repeated} package-wide issue${repeated === 1 ? '' : 's'} listed above also appl${repeated === 1 ? 'ies' : 'y'} here.`,
    ),
  ];
}

/**
 * The docs checked against the authoring types: a visible line when it was
 * skipped, the findings (all warnings), the files it could not check, or an
 * [ok] (never after a failed check).
 * @param {import('../../../api/integration/validate-integration.type.mjs').DocTypesReport | undefined} report
 * @param {boolean} failed
 */
function docTypesBlocks(report, failed) {
  if (!report) return [];
  if (
    report.status === 'checked' &&
    report.docs === 0 &&
    report.findings.length === 0 &&
    report.unchecked.length === 0
  ) {
    return [
      text('[info] No doc files to type-check.'),
      ...(report.fixtures
        ? [text(`[info] ${report.fixtures} test fixture doc(s) not checked.`)]
        : []),
    ];
  }
  if (report.status === 'skipped') {
    return [text(`[skip] Docs not type-checked: ${report.reason}`)];
  }
  const blocks = [
    section(
      `Checking ${report.docs} doc(s) against the authoring types${report.typescript ? ` (TypeScript ${report.typescript})` : ''}`,
    ),
  ];
  if (report.findings.length > 0) {
    const files = new Set(report.findings.map(f => f.doc)).size;
    blocks.push(
      records(report.findings, {
        fields: [
          'severity',
          'doc',
          'line',
          'export',
          'type',
          'field',
          'problem',
          'message',
          'fix',
        ],
        format: {severity: statusToken},
      }),
      text(
        `${report.findings.length} doc field(s) in ${files} file(s) do not match the authoring types. ` +
          'These are warnings; `astryx docs authoring` lists every field.',
      ),
    );
  }
  if (report.unchecked.length > 0) {
    blocks.push(
      text(`[info] Not type-checked: ${report.unchecked.length} doc file(s):`),
      records(report.unchecked, {fields: ['doc', 'reason']}),
    );
  }
  if (report.fixtures) {
    blocks.push(
      text(`[info] ${report.fixtures} test fixture doc(s) not checked.`),
    );
  }
  if (report.findings.length === 0 && report.docs > 0) {
    // After a failed check an [ok] reads as a pass, but the result still shows.
    blocks.push(
      text(
        failed
          ? `[info] No doc field differs from its authoring type (${report.docs} checked).`
          : report.unchecked.length > 0
            ? `[ok] Every doc that was checked matches its authoring type (${report.docs} checked).`
            : `[ok] Every doc matches its authoring type (${report.docs} checked).`,
      ),
    );
  }
  return blocks;
}

/**
 * The component doc names that could not be judged against their sources.
 * @param {import('../../../api/integration/validate-integration.type.mjs').DocNamesReport | undefined} report
 */
function docNamesBlocks(report) {
  if (!report || report.unchecked.length === 0) return [];
  return [
    text(
      `[info] Component names not checked: ${report.unchecked.length} doc(s) whose source exports this check cannot read:`,
    ),
    records(report.unchecked, {fields: ['file', 'name', 'reason']}),
  ];
}

/**
 * The block component names this check could not judge.
 * @param {import('../../../api/integration/validate-integration.type.mjs').BlockComponentsReport | undefined} report
 */
function blockComponentsBlocks(report) {
  if (!report || report.unchecked.length === 0) return [];
  return [
    text(
      `[info] Block component names not checked: ${report.unchecked.length} name(s) this check could not judge:`,
    ),
    records(report.unchecked, {fields: ['file', 'name', 'reason']}),
  ];
}

/**
 * @param {import('../../../api/integration/validate-integration.type.mjs').ValidateIntegrationResponse['data']} data
 * @param {Set<string>} [seen] issues an earlier check printed, printed once
 */
function printIntegrationValidation(data, seen) {
  const {warnings, errors} = summarizeIssues(data.issues);
  emit(
    section(
      `Validating integration: ${integrationLabel(data) ?? '(local package)'}`,
    ),
    ...(data.issues.length > 0
      ? [
          records(unseen(data.issues, seen), {
            fields: ['severity', 'code', 'message', 'fix', 'file', 'line'],
            format: {severity: statusToken},
          }),
        ]
      : [text('[ok] No integration issues found.')]),
    ...(data.notes ?? []).map(note =>
      // A note marked next fails --strict from the next minor release.
      text(`note (${note.code}): ${note.next ? '[next minor] ' : ''}${note.message}`),
    ),
    text(
      `Summary: ${errors} error${errors === 1 ? '' : 's'}, ` +
        `${warnings} warning${warnings === 1 ? '' : 's'}`,
    ),
    ...docTypesBlocks(data.docTypes, errors > 0),
    ...docNamesBlocks(data.docNames),
    ...blockComponentsBlocks(data.blockComponents),
    ...iconSetCoverageBlocks(data.iconSets),
    ...olderCliNoteBlocks(data.olderCliNotes),
    ...(data.exampleAssets && data.exampleAssets.unchecked.length > 0
      ? [
          text(
            `[info] Template assets not checked: ${data.exampleAssets.unchecked.length}:`,
          ),
          records(data.exampleAssets.unchecked, {
            fields: ['file', 'asset', 'reason'],
          }),
        ]
      : []),
    ...(data.publicImports && data.publicImports.unchecked.length > 0
      ? [
          text(
            `[info] Imports not checked: ${data.publicImports.unchecked.length}:`,
          ),
          records(data.publicImports.unchecked, {
            fields: ['file', 'specifier', 'reason'],
          }),
        ]
      : []),
  );
}

/**
 * The optional icon definitions each icon set leaves unmapped, and the icons
 * that fit (spec:AST-084 FR15). Listed, never counted: nothing here fails.
 * @param {import('../../../api/integration/validate-integration.type.mjs').IconSetCoverage[] | undefined} sets
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function iconSetCoverageBlocks(sets) {
  const listed = (sets ?? []).filter(
    each => each.unmappedDefinitions.length > 0 || each.suggestions.length > 0,
  );
  const unchecked = (sets ?? []).flatMap(each =>
    (each.unchecked ?? []).map(item => ({
      set: each.set,
      item: item.icon
        ? `icon ${item.icon}`
        : item.adapter
          ? `adapter ${item.adapter}`
          : `theme map ${item.entry}`,
      reason: item.reason,
    })),
  );
  return [
    ...(unchecked.length > 0
      ? [
          section('Not checked'),
          records(unchecked, {fields: ['set', 'item', 'reason']}),
          text(
            'The icon-set checks could not judge these; they are never counted and never fail a check.',
          ),
        ]
      : []),
    ...unmappedBlocks(listed),
  ];
}

/**
 * @param {import('../../../api/integration/validate-integration.type.mjs').IconSetCoverage[]} listed
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function unmappedBlocks(listed) {
  if (listed.length === 0) return [];
  return [
    section('Unmapped icon definitions (optional)'),
    records(
      listed.map(each => ({
        set: each.set,
        unmapped: each.unmappedDefinitions.length,
      })),
      {fields: ['set', 'unmapped']},
    ),
    // One line per definition: what it means and its words, so an author
    // can pick from the text alone; a suggested icon when one fits.
    ...listed.map(each => {
      const suggested = new Map(
        each.suggestions.map(({definition, icon}) => [definition, icon]),
      );
      const setFlag = listed.length === 1 ? '' : ` --set ${each.set}`;
      return list(
        each.unmappedDefinitions.map(
          definition =>
            `${definition.name}: ${definition.description} Words: ${definition.words.join(', ')}.${suggested.has(definition.name) ? ` Suggested: astryx experimental icon map ${definition.name} ${suggested.get(definition.name)}${setFlag}` : ''}`,
        ),
      );
    }),
    text(
      'Mapping these is optional and never fails a check. Map one with `astryx experimental icon map <definition> <icon id>`; list your icons with `astryx experimental icon --set <set> --all-icons`; see how many definitions each set maps with `astryx experimental icon --list`.',
    ),
  ];
}

/**
 * Descriptors an older CLI drops: listed, never counted.
 * @param {import('../../../api/integration/validate-integration.type.mjs').OlderCliNote[] | undefined} notes
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function olderCliNoteBlocks(notes) {
  if (!notes || notes.length === 0) return [];
  return [
    section('Notes for older CLIs'),
    records(notes, {fields: ['file', 'kind', 'message']}),
  ];
}

/**
 * @param {import('../../../api/integration/authoring-checks.type.mjs').IntegrationTemplateConflictResponse['data']} data
 * @param {Set<string>} [seen] issues an earlier check printed, printed once
 */
function printTemplateConflicts(data, seen) {
  const output = [
    section(
      `Checking integration templates: ${integrationLabel(data) ?? '(local package)'}`,
    ),
    ...issueBlocks(data.issues, seen),
  ];
  if (data.conflicts.length === 0 && data.issues.length === 0) {
    output.push(text('[ok] No template ids conflict with Core.'));
  } else if (data.conflicts.length > 0) {
    const expanded = data.conflicts.some(
      conflict => 'relationship' in conflict,
    );
    output.push(
      records(data.conflicts, {
        fields: expanded
          ? [
              'severity',
              'relationship',
              'id',
              'replaces',
              'integrationPackage',
              'integrationType',
              'integrationName',
              'message',
              'command',
            ]
          : [
              'severity',
              'id',
              'integrationPackage',
              'integrationType',
              'integrationName',
              'message',
              'command',
            ],
        format: {severity: statusToken},
      }),
      text(
        expanded
          ? `${data.conflicts.length} Core template relationship(s).`
          : `${data.conflicts.length} Core template conflict(s). Renaming is recommended but optional; keep the package-qualified command if the overlap is intentional.`,
      ),
    );
  }
  emit(...output);
}

/**
 * The documented-props comparison, with every field its JSON carries: a
 * visible line when it was skipped, the findings (all warnings), the
 * components it could not read, and how many were compared with which
 * TypeScript, as an [ok] when nothing differs (never after a failed check).
 * Then how many documented prop types were judged and which were not.
 * @param {import('../../../api/integration/authoring-checks.type.mjs').PropDriftReport | undefined} report
 * @param {boolean} failed
 */
function propDriftBlocks(report, failed) {
  if (!report) return [];
  if (report.status === 'skipped') {
    return [text(`[skip] Props not compared: ${report.reason}`)];
  }
  const blocks = [];
  if (report.findings.length > 0) {
    // Two docs of one name are two components.
    const components = new Set(
      report.findings.map(f => `${f.doc}\0${f.component}`),
    ).size;
    blocks.push(
      records(report.findings, {
        fields: [
          'severity',
          'component',
          'prop',
          'kind',
          'message',
          'doc',
          'source',
          'docType',
          'codeType',
          'docRequired',
          'codeRequired',
          'docDefault',
          'codeDefault',
          'fix',
        ],
        format: {severity: statusToken},
      }),
      text(
        `${report.findings.length} prop(s) differ between the docs and the code in ${components} of ${report.components} component(s) compared (TypeScript ${report.typescript}). ` +
          'These are warnings: update the doc, or the code if the doc is right.',
      ),
    );
  }
  if (report.unchecked.length > 0) {
    blocks.push(
      text(
        `[info] Props not compared for ${report.unchecked.length} documented component(s):`,
      ),
      records(report.unchecked, {fields: ['component', 'doc', 'reason']}),
    );
  }
  const notChecked = report.propsNotChecked ?? [];
  if (notChecked.length > 0) {
    blocks.push(
      text(
        `[info] Props not checked for a doc entry in ${notChecked.length} component(s):`,
      ),
      records(notChecked, {fields: ['component', 'doc', 'reason', 'props']}),
    );
  }
  if (report.findings.length === 0) {
    const apart =
      notChecked.length > 0 ? ', apart from the props not checked' : '';
    blocks.push(
      text(
        !failed && report.components > 0
          ? `[ok] Documented prop names and required flags match the code in ${report.components} component(s)${apart} (TypeScript ${report.typescript}).`
          : `[info] Props compared in ${report.components} component(s) (TypeScript ${report.typescript}).`,
      ),
    );
  }
  if (report.typesSkipped) {
    blocks.push(text(`[skip] Prop types not judged: ${report.typesSkipped}.`));
    return blocks;
  }
  const notCompared = report.typesNotCompared.flatMap(entry => entry.props);
  blocks.push(
    text(
      `[info] Documented prop types judged: ${report.typesCompared}; not compared: ${notCompared.length}. ` +
        'A type is judged when the doc writes it the same as the source (exactly, if it contains `readonly`), or when both are primitives, literals, arrays and unions of those, or names for them.',
    ),
  );
  if (notCompared.length > 0) {
    blocks.push(
      records(report.typesNotCompared, {
        fields: ['component', 'doc', 'reason', 'props'],
      }),
    );
  }
  return blocks;
}

/**
 * @param {import('../../../api/integration/authoring-checks.type.mjs').IntegrationComponentConflictResponse['data']} data
 * @param {Set<string>} [seen] issues an earlier check printed, printed once
 */
function printComponentConflicts(data, seen) {
  const output = [
    section(
      `Checking integration components: ${integrationLabel(data) ?? '(local package)'}`,
    ),
    ...issueBlocks(data.issues, seen),
  ];
  // An [ok] after a failed check reads as a pass: say nothing it could not check.
  const failed = data.issues.some(issue => issue.severity === 'error');
  if (data.conflicts.length === 0) {
    if (!failed)
      output.push(text('[ok] No component names conflict with Core.'));
  } else {
    output.push(
      records(data.conflicts, {
        fields: [
          'severity',
          'name',
          'integrationPackage',
          'message',
          'command',
        ],
        format: {severity: statusToken},
      }),
      text(
        `${data.conflicts.length} Core component conflict(s). ` +
          'Renaming is recommended but optional; keep the package-qualified command if the overlap is intentional.',
      ),
    );
  }
  output.push(...propDriftBlocks(data.propDrift, failed));
  emit(...output);
}

/**
 * @param {import('../../../api/integration/authoring-checks.type.mjs').IntegrationDocConflictResponse['data']} data
 * @param {Set<string>} [seen] issues an earlier check printed, printed once
 */
function printDocConflicts(data, seen) {
  const output = [
    section(
      `Checking integration docs: ${integrationLabel(data) ?? '(local package)'}`,
    ),
    // A copied passage or fluff is listed below with its detail, so its
    // issue is not printed twice.
    ...issueBlocks(
      data.issues.filter(
        issue =>
          issue.code !== 'copied_passage' &&
          issue.code !== 'doc_fluff' &&
          issue.code !== 'stray_doc_pointer',
      ),
      seen,
    ),
  ];
  if (
    !data.issues.some(
      issue => issue.severity === 'error' || issue.code === 'invalid_doc_graph',
    )
  ) {
    output.push(
      text('[ok] The docs tree and every link in these docs check out.'),
    );
  }
  if (data.findings.length === 0) {
    if (!data.issues.some(issue => issue.severity === 'error')) {
      output.push(text('[ok] No doc topics overlap with Core.'));
    }
  } else {
    output.push(
      records(data.findings, {
        fields: ['severity', 'topic', 'relationship', 'coreTopic', 'message'],
        format: {severity: statusToken},
      }),
    );
  }
  const copied = data.copiedPassages ?? [];
  if (copied.length === 0) {
    if (!data.issues.some(issue => issue.severity === 'error')) {
      output.push(text('[ok] No topic copies a passage from another.'));
    }
  } else {
    output.push(
      text(
        `[warn] ${copied.length} copied passage(s) (copied_passage): two topics say the same thing word for word. Keep the text in one and link to it from the other.`,
      ),
      records(copied, {
        fields: [
          'topic',
          'section',
          'line',
          'otherTopic',
          'otherOwner',
          'owner',
          'text',
          'words',
          'passages',
          'message',
        ],
      }),
    );
  }
  const fluff = data.fluff ?? [];
  if (fluff.length === 0) {
    if (!data.issues.some(issue => issue.severity === 'error')) {
      output.push(text('[ok] No filler phrases or low-density topics.'));
    }
  } else {
    output.push(
      text(
        `[warn] ${fluff.length} fluff finding(s) (doc_fluff): words that add length, not meaning. Cut each one.`,
      ),
      records(fluff, {
        fields: [
          'topic',
          'kind',
          'phrase',
          'section',
          'file',
          'line',
          'density',
          'message',
        ],
      }),
    );
  }
  const stray = data.strayPointers ?? [];
  if (stray.length === 0) {
    if (!data.issues.some(issue => issue.severity === 'error')) {
      output.push(text('[ok] Every pointer to a doc is a link.'));
    }
  } else {
    output.push(
      text(
        `[warn] ${stray.length} stray doc pointer(s) (stray_doc_pointer): a written \`astryx docs <name>\` where a link would be checked. Replace each with the link shown.`,
      ),
      records(stray, {
        fields: [
          'topic',
          'section',
          'file',
          'line',
          'pointer',
          'link',
          'message',
        ],
      }),
    );
  }
  emit(...output);
}

/**
 * Print one `doctor integration` check's result as its own subcommand prints
 * it. `astryx integration check` prints each check it runs through this.
 * @param {import('../../../api/integration/integration-check.type.mjs').IntegrationCheckResponse} response
 * @param {Set<string>} [seen] issues an earlier check printed, printed once
 */
export function printIntegrationCheckResponse(response, seen) {
  if (response.type === 'integration.validate') {
    printIntegrationValidation(response.data, seen);
  } else if (response.type === 'integration.component-conflicts') {
    printComponentConflicts(response.data, seen);
  } else if (response.type === 'integration.template-conflicts') {
    printTemplateConflicts(response.data, seen);
  } else {
    printDocConflicts(response.data, seen);
  }
}

/**
 * @param {import('commander').Command} program
 * @param {{built?: string}} [options]
 */
async function runProjectDoctor(program, options = {}) {
  const report = await runChecks(
    options.built != null ? {built: options.built} : {},
  );
  if (program.opts().json) jsonOut({type: 'doctor', data: report});
  else printHuman(report);
  if (report.summary.fail > 0) process.exitCode = 1;
  return NO_RESULT_SET;
}

/**
 * @param {import('commander').Command} program
 * @param {string | undefined} pkg
 */
async function runIntegrationValidation(program, pkg) {
  const result = await validateIntegration(pkg);
  if (program.opts().json) jsonOut(result);
  else if (!result.data.validated) {
    const noPackage = result.data.issues.some(i => i.code === 'no_package');
    emit(
      text(
        noPackage
          ? 'Nothing was validated: no package.json found. Run this command inside a package directory.'
          : 'Nothing was validated: no astryx.integration.* found next to package.json. ' +
              `To validate an installed integration: ${formatCliCommand('doctor integration validate <package>')}`,
      ),
    );
  } else printIntegrationValidation(result.data);
  if (summarizeIssues(result.data.issues).errors > 0) process.exitCode = 1;
  return NO_RESULT_SET;
}

/**
 * @param {import('commander').Command} program
 * @param {string | undefined} pkg
 * @param {'templates' | 'components' | 'docs'} kind
 */
async function runAuthoringCheck(program, pkg, kind) {
  const result =
    kind === 'templates'
      ? await integrationTemplateConflicts(pkg)
      : kind === 'components'
        ? await integrationComponentConflicts(pkg)
        : await integrationDocConflicts(pkg);

  if (program.opts().json) jsonOut(result);
  else if (!result.data.validated) {
    // Outside a project no integration is installed to check by name
    // (spec AST-081 FR3).
    emit(
      text(
        isOutsideProject()
          ? 'Nothing was checked: no astryx.integration.* found next to package.json, and this folder is outside a project.'
          : 'Nothing was checked: no astryx.integration.* found next to package.json. ' +
              `To check an installed integration: ${formatCliCommand(`doctor integration ${kind} <package>`)}`,
      ),
    );
  } else if (kind === 'templates') {
    printTemplateConflicts(
      /** @type {import('../../../api/integration/authoring-checks.type.mjs').IntegrationTemplateConflictResponse['data']} */ (
        result.data
      ),
    );
  } else if (kind === 'components') {
    printComponentConflicts(
      /** @type {import('../../../api/integration/authoring-checks.type.mjs').IntegrationComponentConflictResponse['data']} */ (
        result.data
      ),
    );
  } else {
    printDocConflicts(
      /** @type {import('../../../api/integration/authoring-checks.type.mjs').IntegrationDocConflictResponse['data']} */ (
        result.data
      ),
    );
  }

  const structuralErrors = summarizeIssues(result.data.issues).errors;
  const docErrors =
    result.type === 'integration.doc-conflicts'
      ? result.data.findings.filter(finding => finding.severity === 'error')
          .length
      : 0;
  if (structuralErrors > 0 || docErrors > 0) process.exitCode = 1;
  return NO_RESULT_SET;
}

/**
 * The first word after a command group, which names a subcommand it does not
 * have, or null.
 * @param {import('commander').Command | undefined} invoked
 * @returns {string | null}
 */
function unknownWord(invoked) {
  const word = (invoked?.args ?? []).find(arg => !String(arg).startsWith('-'));
  return word == null ? null : String(word);
}

/**
 * Report an unknown subcommand, in text as in JSON, with the ones the group has.
 * @param {import('commander').Command} group
 * @param {string} label the group's full name
 * @param {string} word
 */
function unknownSubcommand(group, label, word) {
  return cliError(`unknown subcommand '${label} ${word}'`, {
    suggestions: group.commands.map(child => ({
      name: child.name(),
      reason: 'available subcommand',
    })),
    code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
  });
}

/**
 * Register `astryx doctor` and its integration-authoring leaves.
 * @param {import('commander').Command} program
 */
export function registerDoctor(program) {
  /** @type {import('commander').Command} */
  let doctorCmd;
  doctorCmd = defineCommand(program, doctorCommand, {
    fn: doctorFn,
    // `doctor integrations` is a mistyped subcommand, not a project check.
    action: async (options, invoked) => {
      const word = unknownWord(invoked);
      if (word != null) return unknownSubcommand(doctorCmd, 'doctor', word);
      return runProjectDoctor(program, options);
    },
  });
  /** @type {import('commander').Command} */
  let integrationCmd;
  integrationCmd = defineCommand(doctorCmd, doctorIntegrationGroup, {
    action: (options, invoked) => {
      const word = unknownWord(invoked);
      if (word != null) {
        return unknownSubcommand(integrationCmd, 'doctor integration', word);
      }
      integrationCmd.outputHelp();
      return NO_RESULT_SET;
    },
  });
  // `--built` checks a project's build; an integration check has none.
  const refuseBuilt = () =>
    doctorCmd.opts().built != null
      ? cliError(
          '`--built` checks a finished build and goes with `doctor` alone, not with a `doctor integration` check',
          {code: ERROR_CODES.ERR_INVALID_OPTION},
        )
      : null;
  defineCommand(integrationCmd, doctorIntegrationValidateCommand, {
    fn: validateIntegrationFn,
    action: async pkg => refuseBuilt() ?? runIntegrationValidation(program, pkg),
  });
  defineCommand(integrationCmd, doctorIntegrationTemplatesCommand, {
    fn: integrationTemplateConflictsFn,
    action: async pkg =>
      refuseBuilt() ?? runAuthoringCheck(program, pkg, 'templates'),
  });
  defineCommand(integrationCmd, doctorIntegrationComponentsCommand, {
    fn: integrationComponentConflictsFn,
    action: async pkg =>
      refuseBuilt() ?? runAuthoringCheck(program, pkg, 'components'),
  });
  defineCommand(integrationCmd, doctorIntegrationDocsCommand, {
    fn: integrationDocConflictsFn,
    action: async pkg => refuseBuilt() ?? runAuthoringCheck(program, pkg, 'docs'),
  });
}
