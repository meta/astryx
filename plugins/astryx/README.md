# Astryx agent plugin

One skill that tells a coding agent that Astryx is used through the `astryx` command, when
to use it, and where to start. It carries no component docs and names no version: the CLI
answers those, so the skill never goes stale. It is the same guidance the global install
writes to `~/.agents/skills/astryx/SKILL.md`, for machines that have not installed the CLI
yet.

Claude Code:

```sh
claude plugin marketplace add meta/astryx
claude plugin install astryx@astryx
```

Codex: add `meta/astryx` as a marketplace and enable `astryx@astryx`.

The skill's wording follows `renderComputerAgentText` in
`packages/cli/foundation/agent-docs/computer-agent-text.mjs`.
