// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression check for `value` accepting an explicit `undefined`
 * @input Compiles a small consumer file against the DateInput, TimeInput and
 *   DateTimeInput sources with `exactOptionalPropertyTypes` on
 * @output Asserts the consumer file has no type errors
 * @position Testing; the repository's own TypeScript settings treat
 *   `value?: T` and `value?: T | undefined` as the same type, so only a
 *   consumer compiled with `exactOptionalPropertyTypes` notices if the
 *   `| undefined` is removed again
 *
 * SYNC: When the `value` prop of any of the three inputs changes, update this
 * fixture to match.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..');
const ROOT_CONFIG = path.resolve(SRC, '..', '..', '..', 'tsconfig.json');
const FIXTURE = path.join(HERE, 'valueUndefined.fixture.tsx');
const SRC_POSIX = SRC.split(path.sep).join('/');

const FIXTURE_SOURCE = `
import {useState} from 'react';
import {DateInput} from '${SRC_POSIX}/DateInput/DateInput';
import {TimeInput} from '${SRC_POSIX}/TimeInput/TimeInput';
import {DateTimeInput} from '${SRC_POSIX}/DateTimeInput/DateTimeInput';

type DateValue = React.ComponentProps<typeof DateInput>['value'];
type TimeValue = React.ComponentProps<typeof TimeInput>['value'];
type DateTimeValue = React.ComponentProps<typeof DateTimeInput>['value'];

export function Fixture() {
  const [date, setDate] = useState<DateValue>();
  const [time, setTime] = useState<TimeValue>();
  const [dateTime, setDateTime] = useState<DateTimeValue>();
  return (
    <>
      <DateInput label="Date" value={date} onChange={setDate} />
      <TimeInput label="Time" value={time} onChange={setTime} />
      <DateTimeInput label="Date and time" value={dateTime} onChange={setDateTime} />
    </>
  );
}
`;

describe('value accepts an explicit undefined', () => {
  it('compiles for a consumer with exactOptionalPropertyTypes on', () => {
    const config = ts.readConfigFile(ROOT_CONFIG, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      path.dirname(ROOT_CONFIG),
    );
    const options: ts.CompilerOptions = {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
      exactOptionalPropertyTypes: true,
    };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      path.resolve(fileName) === FIXTURE
        ? ts.createSourceFile(fileName, FIXTURE_SOURCE, languageVersion, true)
        : original(fileName, languageVersion, ...rest);
    const readFile = host.readFile.bind(host);
    host.readFile = fileName =>
      path.resolve(fileName) === FIXTURE ? FIXTURE_SOURCE : readFile(fileName);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = fileName =>
      path.resolve(fileName) === FIXTURE || fileExists(fileName);

    const program = ts.createProgram([FIXTURE], options, host);
    // The sources have their own errors under this setting that are not
    // about `value`; only the consumer file is checked.
    const diagnostics = ts
      .getPreEmitDiagnostics(program, program.getSourceFile(FIXTURE))
      .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));

    expect(diagnostics).toEqual([]);
  }, 120_000);
});
