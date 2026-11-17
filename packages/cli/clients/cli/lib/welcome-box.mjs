// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The welcome box `astryx postinstall` prints after the package installs.
 *
 * A fixed banner, not tabular output, so it is drawn here rather than with the
 * formatter kit; the command prints it verbatim through `emit(code(...))`.
 * @input The CLI invocation for this project (e.g. `pnpm exec astryx`).
 * @output {@link welcomeBox}
 * @position clients/cli/lib — presentation helper for commands/postinstall.mjs
 */

/** Inner width of the box. */
const W = 49;

/**
 * @param {string} s
 * @param {number} len
 */
const pad = (s, len) => s + ' '.repeat(Math.max(0, len - s.length));

/** @param {string} s */
const line = s => `  │ ${pad(s, W)}│`;

/**
 * The welcome box, with a blank line before and after it.
 * @param {string} r the CLI invocation, e.g. `pnpm exec astryx`
 * @returns {string}
 */
export function welcomeBox(r) {
  return `
  ╭${'─'.repeat(W + 2)}╮
${line('')}
${line('  Design system installed!')}
${line('')}
${line('  Get started:')}
${line(`    ${r} init          Setup + AI agent docs`)}
${line(`    ${r} --help        See all commands`)}
${line('')}
${line('  Or run directly:')}
${line(`    ${r} init           Setup + AI agent docs`)}
${line(`    ${r} component     Browse component docs`)}
${line(`    ${r} hook          Browse hook docs`)}
${line(`    ${r} docs          Design system reference`)}
${line(`    ${r} swizzle       Customize a component`)}
${line(`    ${r} template      Add a page template`)}
${line('')}
  ╰${'─'.repeat(W + 2)}╯
`;
}
