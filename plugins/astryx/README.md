# Astryx agent plugin

One skill that tells a coding agent that Astryx is used through the `astryx` command, when
to use it, and where to start. It is a shortened form of the skill the global install writes
to `~/.agents/skills/astryx/SKILL.md`: it keeps the discovery and restore lines and leaves
out the build workflow. It carries no component docs and names no version; the CLI answers
those. Nothing checks it against the global skill yet, so it can drift from it.

Claude Code:

```sh
claude plugin marketplace add meta/astryx
claude plugin install astryx@astryx
```

Codex: add `meta/astryx` as a marketplace and enable `astryx@astryx`.

The skill's wording follows `renderComputerAgentText` in
`packages/cli/foundation/agent-docs/computer-agent-text.mjs`.
