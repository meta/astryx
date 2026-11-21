# Astryx agent plugin

One skill, shared by the Claude Code and Codex plugins, that tells a coding agent that Astryx
is available through the `astryx` command, when
to use it, and where to start. It is the same guidance the
global install writes to `~/.agents/skills/astryx/SKILL.md`. It carries no component docs and names no
version; the CLI answers those. It is generated from `renderComputerAgentText` in
`packages/cli/foundation/agent-docs/computer-agent-text.mjs`: `pnpm generate:agent-plugin-skill` rewrites it and `pnpm check:agent-plugin-skill`
(part of `check:repo`) fails when it drifts.

Claude Code:

```sh
claude plugin marketplace add meta/astryx
claude plugin install astryx@astryx
```

Codex: add `meta/astryx` as a marketplace and enable `astryx@astryx`.

Listing on the Claude Marketplace is a separate, manual step at
[Connectors and plugins](https://claude.com/marketplace/connectors-plugins). Only people who
can push that listing do so; this repository ships the plugin files for it.
