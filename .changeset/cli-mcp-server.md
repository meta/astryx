---
'@astryxdesign/cli': patch
---

[feat] `astryx mcp` serves every astryx command to an AI agent as a Model Context Protocol (MCP) tool, over standard input and output. Each command that answers with `--json` is one tool, named by its words (`theme build` is `theme_build`), with the command's arguments and options as its inputs under their CLI names, and every root option as well. A tool call runs that command with `--json` in the project folder, or in a folder inside it that the call names, and answers with the command's output unchanged; a command that exits non-zero answers as an error. The tools come from the same command definitions as `--help` and the manifest, so a new command or option is a tool input at once. When the project has no agent docs yet, the server gives the agent the text `astryx init` writes. `astryx mcp --json` exits 1 with `ERR_INVALID_OPTION`, because standard output carries the protocol. `astryx docs working-with-ai` shows the client entries.

@josephfarina
