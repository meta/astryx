// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx gap-report` CLI adapter.
 */

import {gapReport as gapReportApi} from '../../../api/gap-report/gap-report.mjs';
import {NO_RESULT_SET, resultSet} from '../../../foundation/debug/index.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {emit, record, records, section, text} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {doc as gapReportCommand} from './gap-report.doc.mjs';
import {doc as gapReportFn} from '../../../api/gap-report/gap-report.doc.mjs';

/** @param {import('commander').Command} program */
export function registerGapReport(program) {
  defineCommand(program, gapReportCommand, {
    fn: gapReportFn,
    action: async (
      /** @type {string|undefined} */ component,
      /** @type {{category?: string, reason?: string, additionalContext?: string, package?: string, confirmPublic?: boolean, listCategories?: boolean, to?: string}} */ options,
    ) => {
      /** @type {Awaited<ReturnType<typeof gapReportApi>>} */
      let result;
      try {
        result = await gapReportApi(component, {
          cwd: process.cwd(),
          category:
            /** @type {import('../../../api/gap-report/gap-report.type.mjs').GapReportCategory|undefined} */ (
              options.category
            ),
          reason: options.reason,
          detail: options.additionalContext,
          package: options.package,
          confirmPublic: options.confirmPublic,
          listCategories: options.listCategories,
          to: options.to,
        });
      } catch (error) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (error);
        return cliError(err.message, {
          suggestions: err.suggestions,
          code: err.code,
        });
      }

      const answered =
        result.type === 'gap-report.categories'
          ? resultSet({count: result.data.length, resultKind: 'command'})
          : NO_RESULT_SET;

      // CLI exits nonzero for failed/partial but still emits the receipt
      const isFailure =
        result.type === 'gap-report.file' &&
        (result.data.status === 'failed' || result.data.status === 'partial');

      // stderr in both modes, so a caller that reads only the exit code or the
      // JSON envelope still sees which delivery failed and why.
      if (isFailure && result.type === 'gap-report.file') {
        for (const delivery of result.data.deliveries) {
          if (delivery.status === 'failed') {
            console.error(
              `gap-report: delivery to ${delivery.handler} failed: ${delivery.message ?? 'no message'}`,
            );
          }
        }
      }

      if (program.opts().json) {
        jsonOut(result);
        if (isFailure) process.exitCode = 1;
        return answered;
      }

      if (result.type === 'gap-report.categories') {
        emit(
          section('Gap report categories'),
          records(result.data, {fields: ['value', 'label']}),
        );
        if (result.meta) {
          emit(...destinationBlocks(result.meta.destinations, result.meta.ask));
        }
        return answered;
      }

      const heading =
        result.data.status === 'filed'
          ? 'Gap report filed'
          : result.data.status === 'partial'
            ? 'Gap report partially filed'
            : result.data.status === 'failed'
              ? 'Gap report failed'
              : 'Gap report route';

      emit(
        section(heading),
        record(result.data, {
          fields: [
            'status',
            'package',
            'issuesUrl',
            'filedCount',
            'routedOnlyCount',
          ],
        }),
      );

      if (result.data.deliveries.length > 0) {
        emit(
          section('Deliveries'),
          records(result.data.deliveries, {
            fields: [
              'handlerType',
              'handler',
              'audience',
              'status',
              'url',
              'message',
            ],
          }),
        );
      }

      if (result.data.destinations && result.data.ask) {
        emit(...destinationBlocks(result.data.destinations, result.data.ask));
      }

      if (isFailure) process.exitCode = 1;
      return answered;
    },
  });
}

/**
 * The destinations a report can go to, then the line telling an agent to ask
 * the person (architecture:cli-surface INV36).
 * @param {import('../../../api/gap-report/gap-report.type.mjs').GapReportDestination[]} destinations
 * @param {string} ask
 */
function destinationBlocks(destinations, ask) {
  return [
    section('Destinations'),
    records(destinations, {fields: ['to', 'default', 'issuesUrl']}),
    text(ask),
  ];
}
