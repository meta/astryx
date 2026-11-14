---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-121
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [cli, working-with-ai]
---

# CLI MCP server system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An agent whose tools come from the Model Context Protocol (MCP), not from a
shell, runs every `astryx` command through `astryx mcp` and gets exactly the
answer that command gives with `--json`, for the project the server serves.
The tools are the commands the CLI already defines, read from the same
definitions as its help and its manifest, so a new command or option is a tool
input with nothing else to change, and the server never answers from logic of
its own.

This record owns what `astryx mcp` serves (FR1), which tools it lists and how
each one is named (FR2), the inputs of a tool (FR3), what a tool call runs and
answers (FR4), and what the server tells a client when it starts (FR5).

## Non-goals

- The hosted docs server that the docs site runs, its tools, and its future.
- Writing an MCP client's configuration into a project.
- MCP transports other than standard input and output, and MCP resources,
  prompts, sampling and notifications beyond cancellation.
- What each command answers: each command's own record and
  `architecture:cli-surface` own it, and FR4 passes it through.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 — `astryx mcp` serves the CLI's commands as MCP tools.** It speaks MCP
  over standard input and output, one JSON-RPC 2.0 message per line. It answers
  `initialize` with the protocol version the client asks for when it speaks
  that version, and with its newest version otherwise, and it declares the
  tools capability only. It never asks a question, and standard output carries
  protocol messages only. It serves until the client closes standard input;
  then it stops every command it started and exits 0. `astryx mcp --json` is
  refused before it serves, because standard output carries the protocol
  (`architecture:cli-surface` INV9).
- **FR2 — One tool per command that answers with `--json`.** Each command
  that supports `--json` and declares `outsideProject` is one tool. A group
  that only holds subcommands declares no `outsideProject` and is no tool; `mcp`
  is no tool, and neither is a hidden command. The tool's name is the command's
  words joined by `_` (`theme build` is `theme_build`), its title is
  `astryx <command>`, and its description is the command's own help line. The
  tools list in the manifest's order. Two commands that give one tool name, or
  one command that gives two inputs one name, fail the CLI's tests.
- **FR3 — A tool's inputs are its command's arguments and options, under their
  CLI names.** Each positional argument is the input of its name, required
  when the command requires it, and a list when the argument is variadic. Each
  option is the input of its long flag without the leading dashes: a flag that
  takes no value is a boolean; an option that takes a value is a string,
  limited to the choices its `CommandDoc` declares; an option that takes several
  values, or collects one value each time it is given, is a list; an option
  whose value is optional is a boolean or a string. Every root option except
  `--json` and `--version` is an input of every tool, as the CLI accepts it on
  every command. The input `cwd` names the folder the command runs in, inside
  the folder the server serves. An input that the tool does not declare reaches
  the command as `--<name>`, so the command answers it as it answers that
  option on a command line.
- **FR4 — A tool call runs its command and answers with the command's output,
  unchanged.** A call runs the same copy of the CLI as a separate process, with
  the command's words, the options it was given, `--json`, then `--` and the
  arguments in order, in the folder `cwd` names, or the folder the server serves.
  The answer is the run's standard output as one text content, followed by its
  standard error when the run wrote any, and `isError` is true exactly when the
  run exits non-zero. The server adds, removes and changes nothing in that
  output, retries no run, and sets no time limit on one. A call that cannot
  become a command line (an argument given after a missing one, or a `cwd`
  outside the folder served) answers as a tool error that says why, and runs
  nothing. A call that the client cancels stops its run and gets no answer.
- **FR5 — The server introduces the CLI once.** `initialize` names the server
  `astryx`, with the CLI's version, and gives instructions: the project's agent
  docs as `astryx init` writes them, when no agent file within the folder's reach
  holds them yet (`architecture:cli-surface` INV13); the CLI's description; the
  rule from a tool to its command; the root options, as the root help gives
  them; and the docs route of a command, `cli/commands/<command>`.
- **FR6 — In global mode, the project's own CLI serves.** As for every command,
  a copy of the CLI started in a project hands the run to the project's own
  CLI (`spec:AST-081` FR2, FR9): the tools are that CLI's commands, and each call
  runs its release.

### Admission

`spec:AST-042` FR4 admits `astryx mcp` as a top-level command:

- **Question.** Which Astryx commands can an agent run, and what does each
  answer, when its tools come from MCP and not from a shell? An agent in an
  editor or a sandbox without a shell cannot run the CLI at all, and no command
  answers it.
- **Closest command.** `astryx manifest` lists every command, argument and
  option, but it runs nothing. Making it run commands gives it a second job,
  and its standard output stops being one JSON envelope.
- **One job.** It serves the CLI's commands as MCP tools.
- **Data, not prose.** Each answer is a command's `--json` envelope, and the
  tool list is the manifest's commands in the shape MCP reads.
- **Function.** Like the capability manifest, it wraps no function: it does no
  operation of its own, and each call runs a command whose function does the
  operation (`spec:AST-042` FR1).

### Platform support

- Supported feature/engine floor: the CLI's Node.js floor; any MCP client that
  starts a server over standard input and output.
- Unsupported behavior: an HTTP transport; a client that cannot start a local
  process uses the hosted docs server instead.
- Browser evidence: none; nothing renders.

## Current-state impact

- `architecture:cli-surface` INV1 (the CLI asks no question; `mcp` reads
  protocol requests on standard input), INV4 (standard output of `mcp` carries
  protocol messages) and INV22 (the `mcp` handler hands the run to the server,
  which starts one run of the CLI per call).
- `spec:AST-042` FR1: `astryx mcp` joins the commands that wrap no function.
- Consumer docs: `astryx docs cli/commands/mcp` (its `CommandDoc`) and the MCP
  Server section of `astryx docs working-with-ai`; the README command table.

## Verification

| Contract | Verification                          | Representative states                                                                                                                                        | Mutation or failure expectation                                             |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| FR1      | `clients/cli/lib/mcp-server.test.mjs` | a known and an unknown protocol version; the client closing with a call running; `--json`; the real bin                                                      | answering another version, a stray stdout line, or a run left running fails |
| FR2      | `clients/cli/lib/mcp-tools.test.mjs`  | every manifest command; groups; `mcp`; experimental commands                                                                                                 | a missing, extra or renamed tool fails                                      |
| FR3      | `clients/cli/lib/mcp-tools.test.mjs`  | every argument, option and root option of every tool, parsed back through the CLI's own program; a value that starts with a dash; a list given as one string | an input that parses to another value, or a flag with no input, fails       |
| FR4      | `clients/cli/lib/mcp-server.test.mjs` | a call through the real bin compared byte for byte with the command run directly; a non-zero exit; standard error; a cancelled call                          | any change to the output, or an answer to a cancelled call, fails           |
| FR5      | `clients/cli/lib/mcp-tools.test.mjs`  | the instructions with and without agent docs in reach                                                                                                        | a root option missing from the instructions fails                           |

## Decision log

### DEC-1 — The tools are the CLI's command definitions, never a list of their own

**Reference:** `spec:AST-121/DEC-1`
**Decider:** josephfarina (proposed), 2026-11-14

Every tool, name and input comes from the Commander program that prints help
and the manifest, so the server and the CLI cannot disagree, and a command
needs no MCP work when it is added or changed.

Rejected: a chosen set of tools, such as a search tool and a get tool, which
answers from logic of its own and drifts from the CLI.

### DEC-2 — A call runs the CLI as a process, never an API function in the server

**Reference:** `spec:AST-121/DEC-2`
**Decider:** josephfarina (proposed), 2026-11-14

The answer is then the command's answer to the byte: the same parsing,
defaults, global-mode hand-off, errors and exit status. A command that exits or
fails cannot end the server, and no command output can reach the protocol
stream.

Rejected: calling `@astryxdesign/cli/api` functions in the server process, a
second client with its own input mapping and its own rendering.

### DEC-3 — The project's agent docs ride in the server instructions

**Reference:** `spec:AST-121/DEC-3`
**Decider:** josephfarina (proposed), 2026-11-14

An agent connected only through MCP reads the same guidance `astryx init`
writes, from the same renderer, so the workflow and the rules reach it without
an agent file, and the text cannot drift. A project whose agent file already
holds the text does not get it twice.

Rejected: instructions written for MCP alone, a second guidance text to keep
in step with the agent docs.

## Open questions

- **OQ1 — Should the hosted docs server run the CLI's read-only commands,
  stay as it is, or retire?** (`human-design`)
- **OQ2 — Should `astryx init` write the MCP client entry beside the agent
  docs?** (`human-design`)
