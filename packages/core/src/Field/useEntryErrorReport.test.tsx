// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useEntryErrorReport.test.tsx
 * @input Uses vitest, @testing-library/react renderHook, useEntryErrorReport
 * @output Unit tests for the parts of the shared hook that its members' suites
 *   do not reach on their own: field comparison and both precedence modes
 * @position Testing; validates Field/useEntryErrorReport.ts. The DateInput,
 *   DateTimeInput, and NumberInput suites test the status, alert, and report
 *   in place.
 */

import {describe, expect, it} from 'vitest';
import {renderHook} from '@testing-library/react';
import type {InputStatus} from './types';
import {
  type EntryError,
  isSameEntryError,
  useEntryErrorReport,
  type UseEntryErrorReportOptions,
} from './useEntryErrorReport';

type TestError = EntryError & {value?: number};

const REJECTION: TestError = {kind: 'unreadable', text: '1a'};
const MESSAGE = 'Invalid number';
const OWN_STATUS: InputStatus = {type: 'error', message: MESSAGE};

function renderReport(options: Partial<UseEntryErrorReportOptions<TestError>>) {
  return renderHook(() =>
    useEntryErrorReport<TestError>({
      entryError: REJECTION,
      rejectionMessage: MESSAGE,
      status: undefined,
      isStatusAnnounced: true,
      callerErrorPrecedence: 'always',
      onEntryErrorChange: undefined,
      ...options,
    }),
  ).result.current;
}

describe('isSameEntryError', () => {
  it('compares every field, and treats a missing field as undefined', () => {
    expect(isSameEntryError<TestError>(null, null)).toBe(true);
    expect(isSameEntryError<TestError>(REJECTION, null)).toBe(false);
    expect(
      isSameEntryError<TestError>(REJECTION, {...REJECTION, value: undefined}),
    ).toBe(true);
    expect(
      isSameEntryError<TestError>(
        {kind: 'fractional', text: '1.5', value: 1.5},
        {kind: 'fractional', text: '1.5', value: 2.5},
      ),
    ).toBe(false);
  });
});

describe('useEntryErrorReport caller error precedence', () => {
  const callerError: InputStatus = {type: 'error', message: 'Pick 1 to 40'};

  it("with 'always', a caller error shows without the callback, and the alert carries the rejection", () => {
    const report = renderReport({status: callerError});
    expect(report.fieldStatus).toBe(callerError);
    expect(report.alertMessage).toBe(MESSAGE);
  });

  it("with 'withCallback', the field's message wins over a caller error without the callback", () => {
    const report = renderReport({
      status: callerError,
      callerErrorPrecedence: 'withCallback',
    });
    expect(report.fieldStatus).toEqual(OWN_STATUS);
    expect(report.alertMessage).toBe('');
  });

  it.each<InputStatus>([
    {type: 'warning', message: 'Few left'},
    {type: 'success', message: 'Looks good'},
    {type: 'error'},
  ])('never lets a $type status hide a rejection in either mode', status => {
    for (const callerErrorPrecedence of ['always', 'withCallback'] as const) {
      const report = renderReport({status, callerErrorPrecedence});
      expect(report.fieldStatus).toEqual(OWN_STATUS);
    }
  });
});
