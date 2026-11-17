---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-121
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-11-16
phase: accepted
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
The tools are the CLI's own manifest (`astryx manifest --json`) in the shape
MCP reads, so a new command or option is a tool input with nothing else to
change, and the server never answers from logic of its own. An agent that can
run commands uses the CLI itself: the help line of `astryx mcp` and the guide's
MCP section present the server only for AI tools that cannot. The docs site's
MCP endpoint is the same server, as `astryx mcp --docs-only`, so a reader with
nothing installed reaches the CLI's own answers for the commands that read the
docs.

This record owns what `astryx mcp` serves (FR1), which tools it lists and how
each one is named (FR2), the inputs of a tool (FR3), what a tool call runs and
answers (FR4), what the server tells a client when it starts (FR5), and the
docs-only server that the docs site runs (FR7).

## Non-goals

- How the docs site deploys its MCP endpoint: its host, its limits and the
  folder it builds for the server.
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
  tools capability only. It answers every message that is not a notification or
  a response: a message without a method is an invalid request, with its id or
  null, and a response gets no answer, because the server sends no request. It
  never asks a question, and standard output carries protocol messages only.
  It serves until the client closes standard input;
  then it stops every command it started and exits 0. `astryx mcp --json` is
  refused before it serves, because standard output carries the protocol
  (`architecture:cli-surface` INV9).
- **FR2 — One tool per command that answers with `--json`.** The tools are
  the CLI's manifest: each command the manifest lists as supporting `--json`,
  with an `outsideProject`, is one tool, when the manifest marks it available on
  the run's base. The manifest is the one `astryx manifest --json` prints for
  the run. A group that only holds subcommands
  has no `outsideProject` and is no tool; `mcp` does not support `--json` and is
  no tool, and neither is a command the manifest leaves out. The tool's name is
  the command's words joined by `_` (`theme build` is `theme_build`), its title
  is `astryx <command>`, and its description is the command's description in
  the manifest. An experimental command's tool keeps its namespace: its name
  starts with `experimental_` and its description with `[experimental]`, as the
  manifest lists it under the `experimental` group (`spec:AST-017` FR27). The
  tools list in the manifest's order. Two commands that give one tool name, or
  one command that gives two inputs one name, fail the CLI's tests. The
  published package serves the manifest it stores, so the server loads no
  command module to list its tools.
- **FR3 — A tool's inputs are its command's arguments and options, under their
  CLI names.** Each positional argument is the input of its name, required when
  the command requires it, and a list when the argument is variadic. An option the
  manifest marks unavailable on the run's base is no input. Each option is the
  input of its long flag without the leading dashes: a flag that takes no
  value is a boolean; an option that takes a value is a string, limited to the
  choices the manifest lists for it; an option that takes several values, or
  whose default is a list (it collects one value each time it is given), is a
  list; an option whose value is optional is a boolean or a string. The input of
  an argument or a command option carries the description the manifest gives it,
  and the server instructions describe the root options once (FR5). Every root
  option except `--json` and `--version` is an input of every tool, as the CLI
  accepts it on every command. The input `cwd` names the folder the command runs
  in, inside the folder the server serves, symbolic links followed; a docs-only
  tool has no `cwd` (FR7). The inputs are exactly those of the tool's schema,
  which allows no other property.
- **FR4 — A tool call runs its command and answers with the command's output,
  unchanged.** A call runs the same copy of the CLI as a separate process, with
  the command's words, the options it was given, `--json`, then `--` and the
  arguments in order, in the folder `cwd` names, or the folder the server serves.
  The answer is the run's standard output as one text content, followed by its
  standard error when the run wrote any, and `isError` is true exactly when the
  run exits non-zero. The server adds, removes and changes nothing in that
  output, retries no run, and sets no time limit on one. A call that cannot
  become a command line (an argument given after a missing one, an input the
  tool does not declare, or a `cwd` whose folder is outside the one served,
  symbolic links followed) answers as a tool error that says why, and runs
  nothing. A call that the client cancels stops its run and gets no answer.
- **FR5 — The server introduces the CLI once.** `initialize` names the server
  `astryx`, with the CLI's version, and gives instructions: the project's agent
  docs as `astryx init` writes them, when no agent file within the folder's reach
  holds them yet (`architecture:cli-surface` INV13); the CLI's description; the
  rule from a tool to its command; the root options its tools take, as the root
  help gives them; and the docs route of a command, `cli/commands/<command>`.
- **FR6 — In global mode, the project's own CLI serves.** As for every command,
  a copy of the CLI started in a project hands the run to the project's own
  CLI (`spec:AST-081` FR2, FR9): the tools are that CLI's commands, and each call
  runs its release.
- **FR7 — `astryx mcp --docs-only` serves only the commands that read the
  docs, and the docs site's endpoint is that server.** Its tools are the FR2
  tools of `search`, `build`, `component`, `hook`, `docs`, `template`,
  `discover`, `theme list` and `theme targets`: each answers from Astryx's docs
  and the Core the folder has, writes nothing, reads no path or package a
  caller names, and reaches no other service. A docs-only tool has no `cwd`
  input and leaves out the inputs `package`, `base`, `path`, `cdn` and
  `overwrite`; a call that gives one is a tool error that names it, and runs
  nothing; every call runs in the folder served. The server takes one message
  at a time: a batch is an invalid request, and none of it runs. The
  instructions say that the server answers for the release it has. The docs
  site's MCP endpoint takes one JSON-RPC message per request over Streamable
  HTTP and keeps no session. A notification or a response gets 202 with no
  body, and nothing runs; any other message runs `astryx mcp --docs-only` once,
  in its own process group, in a folder that holds the CLI and the Core the
  site documents, and the endpoint answers with the server's reply. A run that
  gives no answer in 55 seconds, or whose request is cancelled, is stopped with
  every command it started, and the request gets an internal error. The
  endpoint has no tools of its own.

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
- **Function.** Like the capability manifest, it wraps no function: each call
  runs a command whose function does the operation (`spec:AST-042` FR1), and
  the handler reads only the agent docs that `astryx init` renders, with the
  same renderer, for the server instructions (FR5, DEC-3).

### Platform support

- Supported feature/engine floor: the CLI's Node.js floor; any MCP client that
  starts a server over standard input and output.
- Unsupported behavior: an HTTP transport in the CLI itself; a client that
  cannot start a local process uses the docs site's endpoint, which serves FR7
  over Streamable HTTP.
- Browser evidence: none; nothing renders.

## Current-state impact

- `architecture:cli-surface` INV1 (the CLI asks no question; `mcp` reads
  protocol requests on standard input), INV4 (standard output of `mcp` carries
  protocol messages) and INV22 (the `mcp` handler hands the run to the server,
  which starts one run of the CLI per call).
- `spec:AST-042` FR1: `astryx mcp` joins the commands that wrap no function.
- Consumer docs: `astryx docs cli/commands/mcp` (its `CommandDoc`) and the
  `mcp-server` section ("If your AI tool needs MCP") of
  `astryx docs working-with-ai`; the README command table.
- The docs site's MCP endpoint serves FR7 and has no tools of its own.

## Verification

| Contract | Verification                                                                                                                    | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                 | Mutation or failure expectation                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | `clients/cli/lib/mcp-server.test.mjs`                                                                                           | a known and an unknown protocol version; the client closing with a call running; `--json`; the real bin; a message with no method, with and without an id; a response; a batch on a server that takes one message at a time                                                                                                                                                                                                           | answering another version, a stray stdout line, or a run left running fails; an unanswered invalid message, an answered response, or a batch call that runs fails             |
| FR2      | `clients/cli/lib/mcp-tools.test.mjs`, `test/packed-manifest.test.mjs`                                                           | every manifest command; groups; `mcp`; experimental commands; the packed package's stored manifest; a command and an option unavailable on the run's base                                                                                                                                                                                                                                                                             | a missing, extra or renamed tool fails                                                                                                                                        |
| FR3      | `clients/cli/lib/mcp-tools.test.mjs`                                                                                            | every argument, option and root option of every tool, parsed back through the CLI's own program; a value that starts with a dash; a list given as one string; a `cwd` through a symbolic link that leads out and one that stays inside; an input the tool does not declare                                                                                                                                                            | an input that parses to another value, or a flag with no input, fails; a `cwd` that leaves through a link, or an undeclared input that reaches a command, fails               |
| FR4      | `clients/cli/lib/mcp-server.test.mjs`                                                                                           | a call through the real bin compared byte for byte with the command run directly; a non-zero exit; standard error; a cancelled call                                                                                                                                                                                                                                                                                                   | any change to the output, or an answer to a cancelled call, fails                                                                                                             |
| FR5      | `clients/cli/lib/mcp-tools.test.mjs`                                                                                            | the instructions with and without agent docs in reach; the docs-only instructions, which name no root option its tools leave out                                                                                                                                                                                                                                                                                                      | a root option missing from the instructions fails; a root option named that no tool takes, or one a tool takes left unnamed, fails                                            |
| FR7      | `clients/cli/lib/mcp-tools.test.mjs`, `clients/cli/lib/mcp-server.test.mjs`, the docs site's `src/__tests__/mcp-server.test.ts` | the docs-only tool list; each left-out input and `cwd`; the real bin with `--docs-only`; a call through the docs site's endpoint compared byte for byte with the command run directly; a notification; GET and DELETE; `base`; a batch; a message with no method; a notification and a response, which start no server; a run with no answer in time, and the command it started; component and template answers through the endpoint | an extra tool, a left-out input that reaches a command, or a changed answer fails; a started server for a notification, or a command left running after the time limit, fails |

## Decision log

### DEC-1 — The tools are the CLI's manifest, never a list of their own

**Reference:** `spec:AST-121/DEC-1`
**Decider:** josephfarina, 2026-11-14

Every tool, name and input comes from the manifest, the CLI's description of
itself, which is built from the same command definitions as its help, so the
server and the CLI cannot disagree, and a command needs no MCP work when it is
added or changed.

Rejected: a chosen set of tools, such as a search tool and a get tool, which
answers from logic of its own and drifts from the CLI.

### DEC-2 — A call runs the CLI as a process, never an API function in the server

**Reference:** `spec:AST-121/DEC-2`
**Decider:** josephfarina, 2026-11-14

The answer is then the command's answer to the byte: the same parsing,
defaults, global-mode hand-off, errors and exit status. A command that exits or
fails cannot end the server, and no command output can reach the protocol
stream.

Rejected: calling `@astryxdesign/cli/api` functions in the server process, a
second client with its own input mapping and its own rendering.

### DEC-3 — The project's agent docs ride in the server instructions

**Reference:** `spec:AST-121/DEC-3`
**Decider:** josephfarina, 2026-11-14

An agent connected only through MCP reads the same guidance `astryx init`
writes, from the same renderer, so the workflow and the rules reach it without
an agent file, and the text cannot drift. A project whose agent file already
holds the text does not get it twice.

Rejected: instructions written for MCP alone, a second guidance text to keep
in step with the agent docs.

### DEC-4 — The docs site's MCP endpoint is `astryx mcp --docs-only`

**Reference:** `spec:AST-121/DEC-4`
**Decider:** josephfarina, 2026-11-16

There is one MCP implementation, reached two ways: a reader's AI tool starts
`astryx mcp` in the project, and a reader with nothing installed connects to the
docs site, which runs the same command. The docs site offers only the commands
that read the docs, because a server many people share must not write files,
read paths its callers name, or reach other services for them.

Rejected: a hosted server with its own search and read tools, a second
implementation that drifts from the CLI.

## Open questions

- **OQ2 — Should `astryx init` write the MCP client entry beside the agent
  docs?** (`human-design`)
