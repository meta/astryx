// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-console-cli.test.mjs
 */

import {RuleTester} from 'eslint';
import rule from './no-raw-console-cli.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-raw-console-cli', rule, {
  valid: [
    // console.error is allowed (stderr — never corrupts --json stdout)
    {
      code: `console.error('boom');`,
      filename: '/repo/packages/cli/clients/cli/commands/search.mjs',
    },
    // console.warn is allowed (stderr)
    {
      code: `console.warn('heads up');`,
      filename: '/repo/packages/cli/clients/cli/commands/search.mjs',
    },
    // humanLog is allowed OUTSIDE command files — it's the stdout primitive the
    // formatter sink (emit) and the shared logger are built on.
    {
      code: `import {humanLog} from '../../lib/json.mjs'; humanLog('hi');`,
      filename: '/repo/packages/cli/clients/cli/formatters/index.mjs',
    },
    // Exempt: lib/json.mjs defines the raw writers
    {
      code: `console.log('raw');`,
      filename: '/repo/packages/cli/foundation/response/json.mjs',
    },
    // Exempt: cli/index.mjs (wiring / banner)
    {
      code: `console.log('banner');`,
      filename: '/repo/packages/cli/clients/cli/index.mjs',
    },
    // Exempt: bin/astryx.mjs (entrypoint / Node gate)
    {
      code: `console.log('raw');`,
      filename: '/repo/packages/cli/clients/cli/bin/astryx.mjs',
    },
    // Exempt: run.mjs (one run / error boundary)
    {
      code: `console.log('raw');`,
      filename: '/repo/packages/cli/clients/cli/run.mjs',
    },
    // Exemption is path-suffix based and tolerant of Windows separators
    {
      code: `console.log('raw');`,
      filename: 'C:\\repo\\packages\\cli\\foundation\\response\\json.mjs',
    },
  ],
  invalid: [
    // Bare console.log -> humanLog
    {
      code: `console.log('hello');`,
      filename: '/repo/packages/cli/clients/cli/commands/search.mjs',
      output: `humanLog('hello');`,
      errors: [{messageId: 'noRawConsoleLog'}],
    },
    // Member access preserved, only the callee renamed
    {
      code: `console.log(\`a \${b}\`);`,
      filename: '/repo/packages/cli/api/component/component.mjs',
      output: `humanLog(\`a \${b}\`);`,
      errors: [{messageId: 'noRawConsoleLog'}],
    },
    // Multiple violations
    {
      code: `console.log('a'); console.log('b');`,
      filename: '/repo/packages/cli/clients/cli/commands/init.mjs',
      output: `humanLog('a'); humanLog('b');`,
      errors: [
        {messageId: 'noRawConsoleLog'},
        {messageId: 'noRawConsoleLog'},
      ],
    },
    // Ban #2: humanLog() in a command file must funnel through emit()
    {
      code: `humanLog('hi');`,
      filename: '/repo/packages/cli/clients/cli/commands/search.mjs',
      errors: [{messageId: 'noHumanLogInCommand'}],
    },
    // Ban #2: humanWarn() in a command file — warnings go through cliError()
    {
      code: `humanWarn('careful');`,
      filename: '/repo/packages/cli/clients/cli/commands/build.mjs',
      errors: [{messageId: 'noHumanLogInCommand'}],
    },
  ],
});

console.log('All tests passed!');
