# AI Agent (ACP) for Raycast

Talks to Claude, Codex (ChatGPT) or any ACP agent over the [Agent Client Protocol](https://agentclientprotocol.com), the same way Zed does: the extension spawns the agent's ACP adapter as a child process and speaks JSON-RPC to it over stdio. The adapters use your existing Claude Code or ChatGPT login, so you don't need an API key.

## Commands

- **Ask AI Agent**: chat. Type in the search bar, press Enter. Selected text is attached automatically (preference). Actions: copy/paste/save answer (⌘S), regenerate (⌘R), attach selection (⌘T), clipboard (⌘B) or Finder files and images (⌘F), new conversation (⌘N), history (⌘H), stop (⌘.). The Agent submenu switches mode, model and thinking level live, whatever the agent offers.
- **AI Agent Conversations**: past chats, saved locally. Resuming starts a fresh agent session and gives it the recent transcript as context.
- **Saved Answers**: answers saved with ⌘S.
- **Run Prompt / Manage Prompts**: your own prompts with `{selection}` and `{clipboard}` variables, optional "Replace Selection", tools off by default.
- **Summarize / Fix Grammar / Translate / Explain Selected Text**: act on the selected text. Try Again with ⌘R.

## Setup

```sh
npm install
npm run dev        # opens in Raycast in dev mode
```

Requirements: Node 20+, and a login for the agent you pick: Claude Code (`claude` → `/login`) or Codex (`codex login`), or set the optional API key preference.

## Preferences

- **Agent**: Claude (`@agentclientprotocol/claude-agent-acp`), Codex (`@agentclientprotocol/codex-acp`) or Custom.
- **Agent Command**: used only for Custom, e.g. `gemini --experimental-acp`, or a globally installed adapter for faster startup.
- **Extra PATH**: Raycast doesn't load your shell profile, so add the folder holding `node`/`npx` if they're not in `/opt/homebrew/bin` or `/usr/local/bin` (e.g. your nvm folder).
- **Working Directory**: where the agent runs, which determines which files it can see.
- **Tool Permissions**: ask, always allow, or always reject when the agent wants to edit files or run commands.

## Layout

- `src/lib/acp.ts`: spawns the agent, ACP handshake (`initialize` → `session/new`), streams `session/update`, handles `session/request_permission`
- `src/lib/useAgent.ts`: React hook that keeps one agent/session per open command
- `src/ask-agent.tsx`: chat UI
- `src/lib/SelectionCommand.tsx` + `src/*-selection.tsx`, `fix-grammar.tsx`: text actions
