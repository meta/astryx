// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'working-with-ai',
  title: 'Working with AI',
  category: 'guide',
  description:
    'How to set up AI coding tools to generate correct component code.',
  keywords: ['claude', 'cursor', 'codex', 'copilot', 'agents', 'mcp'],

  sections: [
    {
      title: 'Overview',
      content: [
        {
          type: 'prose',
          text: 'The design system is built to be AI-friendly: consistent naming, predictable prop patterns, and a CLI that feeds structured documentation directly into AI context windows. But models still need the right context to avoid falling back to generic React patterns or inventing props.',
        },
        {
          type: 'prose',
          text: 'The CLI includes a built-in agent docs system that generates context files for your AI tool of choice. One command sets up everything your AI needs to write correct component code.',
        },
      ],
    },
    {
      id: 'quick-start',
      title: 'Set up agent docs',
      content: [
        {
          type: 'prose',
          text: 'Tell your AI to install the CLI and set itself up:',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Paste this into your AI',
          code: 'Install @astryxdesign/cli and run `astryx init --features agents` to set up your Astryx context. Read the generated file.',
        },
        {
          type: 'prose',
          text: "That's it. The `init --features agents` command generates everything your AI needs (component index, behavioral rules, CLI reference, and package guidance from configured integrations) from the installed project. After a dependency bump, `{@command upgrade --from <old version>}` reports a stale block and adding `--apply` refreshes it.",
        },
        {
          type: 'prose',
          text: "By default this writes the instructions to `AGENTS.md` (the tool-agnostic standard most agents read), in the project root: the nearest folder whose `package.json` declares an Astryx package, else the nearest with any `package.json`. The search stops at the repository root. In the home folder, or in a settings folder in it outside a project, init writes no agent docs: every folder of the home folder whose name starts with a dot (`~/.claude`, `~/.gemini`, `~/.codex`) is a settings folder, and such a folder itself never counts as a project, even with a `package.json`; a project below it with its own `package.json`, such as an agent worktree, is set up normally. Claude Code skips `AGENTS.md` when the project has a `CLAUDE.md` or `.claude/CLAUDE.md`, so init also writes them to that file, even when it imports `AGENTS.md`: Claude Code does not follow that import in a session started in a subfolder. When both files exist, root `CLAUDE.md` gets the copy and a copy in `.claude/CLAUDE.md` is removed, unless the project ignores `CLAUDE.md`, in which case a `.claude/CLAUDE.md` the project commits keeps a copy. Gemini CLI reads only `GEMINI.md`, so init adds a one-line import of `AGENTS.md` there, unless `GEMINI.md` already imports it. `upgrade` keeps the copies in sync. The block between the Astryx markers belongs to Astryx: init and `upgrade` write, refresh, and remove it whatever the project's ignore rules or generated markers say, and never change the text around it. To target a specific tool's file instead:",
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Manual options',
          code: `{@command init --features agents --agent claude}    # CLAUDE.md if present, else .claude/CLAUDE.md
{@command init --features agents --agent cursor}    # .cursorrules if present, else AGENTS.md
{@command init --features agents --agent codex}     # AGENTS.md (Copilot, Codex, etc.)
{@command init --features agents --agent hermes}    # .hermes.md or HERMES.md if present, else AGENTS.md
{@command init --features agents --agent muse}      # AGENTS.md (Muse)
{@command init --features agents --agent all}       # every agent file present except GEMINI.md, else AGENTS.md and .claude/CLAUDE.md`,
        },
        {
          type: 'prose',
          text: 'With `--agent all`, `GEMINI.md` keeps its one-line import of `AGENTS.md`. With `--agent claude` or `--agent all`, as by default, when `CLAUDE.md` gets the instructions, `.claude/CLAUDE.md` gets none and a copy already there is removed, unless the project ignores `CLAUDE.md`: a fresh clone does not have it, so a `.claude/CLAUDE.md` the project commits gets a copy too, with `--agent claude` and `--agent all` alike. `init --remove-agents` removes them at the project root and in the folder it runs in.',
        },
        {
          type: 'prose',
          text: "For agents that work outside any one project, your global install keeps one short Astryx skill, `~/.agents/skills/astryx/SKILL.md`, linked into the skill folders agent tools read, such as `~/.claude/skills/astryx`. It tells agents Astryx is there and when to use it; `{@command init --user}` writes it now or, with `--remove-agents`, turns it off. Inside a project, agents follow that project's own agent docs. See {@link generic:computer-agent-guide}.",
        },
      ],
    },
    {
      title: 'What Gets Generated',
      content: [
        {
          type: 'prose',
          text: 'The generated context teaches your AI a 3-step workflow before writing any UI code:',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            '`{@command build "<idea>"}`: get the page template to start from (always one: the closest match, or the app shell), two other templates, and the blocks and components for the parts it lacks',
            '`{@command template <name> <path>}`: scaffold that template into the project, keep its frame and spacing, and replace its content',
            '`{@command component <Name>}`: read props and examples for every component used',
          ],
        },
        {
          type: 'prose',
          text: "It also includes rules that prevent common mistakes (start every page from a template, no raw divs, no style={{}}, use tokens not magic values), a CLI quick reference, and package-labeled integration guidance when a configured manifest declares `agentDocs`. After setup, you shouldn't need to manually correct your AI on these conventions; the agent docs handle it at the system level.",
        },
      ],
    },
    {
      title: 'Cursor Setup',
      content: [
        {
          type: 'prose',
          text: 'Cursor reads project rules from `.cursor/rules/`. To keep the Astryx context in a rule of its own, write it there. Give a path relative to the project root, such as `.cursor/rules/astryx.mdc`; an absolute path is refused.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Install as a Cursor project rule',
          code: `{@command init --features agents --agent-docs-path .cursor/rules/astryx.mdc}`,
        },
        {
          type: 'prose',
          text: 'Rerunning the same command rewrites only the Astryx block, so frontmatter you add above it (such as `alwaysApply: true`) stays.',
        },
      ],
    },
    {
      title: 'Checking Your Setup',
      content: [
        {
          type: 'prose',
          text: 'Paste this into your AI before writing any component code. If your AI can\'t answer these questions, it\'ll know to install the agent docs first.',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Paste this into your AI',
          code: `Before writing any Astryx code, check your knowledge:

1. What is the correct import path for Button?
2. How do you make a Dialog non-dismissible?
3. What prop does Selector use for its items?

If you don't know all three, run \`astryx init --features agents\` to generate agent docs, then read the generated file.`,
        },
      ],
    },
    {
      title: 'The astryx Pattern',
      content: [
        {
          type: 'prose',
          text: 'AI agents frequently invoke the CLI with incorrect paths (e.g. node_modules/@astryxdesign/cli/bin/docs.mjs instead of astryx.mjs), leading to silent failures. Adding an npm script alias with the correct path eliminates this entirely.',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `"scripts": {
  "astryx": "node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs"
}`,
        },
        {
          type: 'prose',
          text: 'With this alias, agents run `npm run astryx -- component --list` instead of guessing the binary path. The `--` separator is standard npm convention for passing flags to scripts.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Reliable CLI invocation',
          code: `npm run astryx -- component --list
npm run astryx -- component Dialog --dense
npm run astryx -- docs styling --full --detail brief
npm run astryx -- docs tokens --dense`,
        },
      ],
    },
    {
      id: 'the-dense-flag',
      title: 'Shorter output: --detail and --dense',
      content: [
        {
          type: 'prose',
          text: 'For a shorter read, add `--detail brief` (one line per section) or `--detail compact`. `--dense` swaps in a shorter text where a doc ships one. Use them when pasting CLI output into a web-based AI tool like ChatGPT or Claude.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Short output for pasting into AI conversations',
          code: `{@command docs styling --full --detail brief}
{@command component Dialog --detail compact}
{@command docs principles --dense}`,
        },
      ],
    },
    {
      title: 'MCP Server',
      content: [
        {
          type: 'prose',
          text: 'Astryx ships a Model Context Protocol (MCP) server that any MCP-compatible AI tool can connect to. Instead of manually pasting CLI output, the AI can query the Astryx design system directly, searching for components, reading full documentation, and pulling code examples on demand.',
        },
        {
          type: 'prose',
          text: 'The MCP server exposes two tools: search(query) for discovering components, doc topics, and templates; and get(name) for retrieving full documentation with props, usage, and examples.',
        },
        {
          type: 'prose',
          text: 'Add the server to your MCP config file. The entry is a remote HTTP server, and the exact shape differs per client, so use the snippet for the tool you run. An entry with an unrecognized transport is skipped with a warning rather than an error, which reads as a server that connects but exposes no tools.',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'Claude Code (.mcp.json)',
          code: `{
  "mcpServers": {
    "astryx": {
      "type": "http",
      "url": "https://astryx.atmeta.com/mcp"
    }
  }
}`,
        },
        {
          type: 'prose',
          text: 'Claude Code can also write that entry from the terminal:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `claude mcp add --transport http astryx https://astryx.atmeta.com/mcp`,
        },
        {
          type: 'code',
          lang: 'json',
          label: 'Cline (cline_mcp_settings.json) - type is streamableHttp',
          code: `{
  "mcpServers": {
    "astryx": {
      "type": "streamableHttp",
      "url": "https://astryx.atmeta.com/mcp"
    }
  }
}`,
        },
        {
          type: 'code',
          lang: 'json',
          label:
            'Cursor (.cursor/mcp.json) - remote servers take no type field',
          code: `{
  "mcpServers": {
    "astryx": {
      "url": "https://astryx.atmeta.com/mcp"
    }
  }
}`,
        },
        {
          type: 'prose',
          text: 'Claude Desktop is the exception: claude_desktop_config.json holds local stdio servers, so a remote server is added through Settings, then Connectors, then Add custom connector, pasting the URL above.',
        },
        {
          type: 'prose',
          text: 'Once connected, your AI tool can search for components by natural language (e.g. "dropdown menu", "success message") and retrieve full documentation without any manual CLI invocation. The server uses the same keyword index from component docs, so search quality improves automatically as component documentation is updated.',
        },
      ],
    },
    {
      id: 'global-mode',
      title: 'In global mode',
      content: [
        {
          type: 'prose',
          text: "In global mode: your global install keeps one Astryx skill in your home folder, linked into the folders agent tools read, so agents outside any project know Astryx is there; inside a project, its own agent docs come first. See {@link namespace:global} and {@link generic:computer-agent-guide}.",
        },
      ],
    },
  ],
};
