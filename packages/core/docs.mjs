// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs.mjs — Astryx component docs are served by the Astryx CLI.
 *
 * Component docs (props, variants, examples), page templates, design rules, and
 * tokens are provided by the Astryx CLI — always current and richer than a
 * bundled snapshot. This script intentionally redirects there instead of
 * printing docs, so agents and humans converge on the CLI + `init` (which writes
 * the full guide into AGENTS.md / CLAUDE.md) rather than treating a static doc
 * dump as the whole story.
 *
 * ==========================================================================
 *  AI AGENT: do NOT guess component APIs or hand-write CSS. Run:
 *      npx @astryxdesign/cli init
 *  Use the SCOPED name `@astryxdesign/cli` — the unscoped `astryx` resolves to
 *  an unrelated npm package until the CLI is a dependency. Then, per component:
 *      npx @astryxdesign/cli component <Name>
 *      npx @astryxdesign/cli component --list
 * ==========================================================================
 */

const BANNER = `
==========================================================================
 Astryx component docs are served by the Astryx CLI (accurate + current).
 Do not guess component APIs or hand-write CSS — set up first (one time):

     npx @astryxdesign/cli init

 (Use the scoped name @astryxdesign/cli. The unscoped name astryx resolves
 to an unrelated npm package until the CLI is installed as a dependency.)

 init writes the full component guide, page templates, design rules & tokens
 into your AGENTS.md / CLAUDE.md. Then, for any component:

     npx @astryxdesign/cli component <Name>   # full props, variants, examples
     npx @astryxdesign/cli component --list   # every component
     npx @astryxdesign/cli build "<what you're building>"   # starter kit
==========================================================================
`;

console.log(BANNER);
process.exit(0);
