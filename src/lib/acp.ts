import { spawn, ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { homedir, userInfo } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { getPreferenceValues, confirmAlert, Alert } from "@raycast/api";
import * as acp from "@agentclientprotocol/sdk";

export type AgentKind = "claude" | "codex" | "custom";

export type Prefs = {
  agent?: AgentKind;
  agentCommand?: string;
  extraPath?: string;
  workingDirectory?: string;
  permissionPolicy?: "ask" | "allow" | "reject";
  apiKey?: string;
  autoAttachSelection?: boolean;
};

/** What the UI renders while a turn streams in. */
export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "tool"; id: string; title: string; status?: string }
  | { type: "plan"; entries: { content: string; status: string }[] }
  | { type: "config"; options: ConfigOption[] }
  | { type: "usage"; usage: Partial<Usage> };

/** Token and cost figures for a turn. `used`/`size` are the context window fill. */
export type Usage = {
  used: number;
  size: number;
  cost?: { amount: number; currency: string };
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  total: number;
  model?: string;
};

export type ConfigChoice = { value: string; name: string };
/** A select-type session setting (mode, model, thinking level…) exposed by the agent. */
export type ConfigOption = { id: string; name: string; category?: string; current: string; choices: ConfigChoice[] };

export type Content = string | acp.ContentBlock[];

function toConfigOptions(raw?: acp.SessionConfigOption[] | null): ConfigOption[] {
  const out: ConfigOption[] = [];
  for (const o of raw ?? []) {
    if (o.type !== "select") continue;
    const choices: ConfigChoice[] = [];
    for (const c of o.options) {
      if ("group" in c) c.options.forEach((x) => choices.push({ value: x.value, name: `${c.name} · ${x.name}` }));
      else choices.push({ value: c.value, name: c.name });
    }
    out.push({ id: o.id, name: o.name, category: o.category ?? undefined, current: o.currentValue, choices });
  }
  return out;
}

/**
 * A live connection to an ACP agent (claude-agent-acp by default), spawned as a
 * child process speaking newline-delimited JSON-RPC over stdio — exactly how Zed does it.
 */
export class AcpAgent {
  private child: ChildProcess;
  private connection: acp.ClientConnection;
  private session?: acp.ActiveSession;
  private stderr = "";
  configOptions: ConfigOption[] = [];

  private constructor(child: ChildProcess, connection: acp.ClientConnection) {
    this.child = child;
    this.connection = connection;
    child.stderr?.on("data", (d) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000);
    });
  }

  static async start(kind: AgentKind = defaultAgentKind()): Promise<AcpAgent> {
    const prefs = getPreferenceValues<Prefs>();
    const command = agentCommand(prefs, kind);
    const cwd = prefs.workingDirectory || homedir();

    const PATH = [prefs.extraPath, `${homedir()}/.local/bin`, ...nodeManagerBins(), process.env.PATH, "/usr/bin:/bin"]
      .filter(Boolean)
      .join(":");
    // Claude Code looks up its keychain login by $USER, which Raycast's environment may not set.
    const user = userInfo().username;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH,
      HOME: homedir(),
      USER: process.env.USER || user,
      LOGNAME: process.env.LOGNAME || user,
    };
    if (prefs.apiKey) env[kind === "codex" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"] = prefs.apiKey;

    // Run through a login-less shell so users can type a normal command line.
    const child = spawn("/bin/sh", ["-c", `exec ${command}`], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });

    const ref: { agent?: AcpAgent } = {};
    const spawnError = new Promise<never>((_, reject) => {
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Agent exited (code ${code}). ${ref.agent?.stderr || "Check the Agent Command preference."}`)),
      );
    });
    spawnError.catch(() => undefined); // avoid unhandled rejection after normal shutdown

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as unknown as ReadableStream<Uint8Array>,
    );

    const app = acp
      .client({ name: "raycast-acp" })
      .onRequest("session/request_permission", async ({ params }) => handlePermission(params, prefs, kind))
      .onNotification("session/update", () => {
        /* routed to ActiveSession */
      });

    const connection = app.connect(stream);
    const agent = (ref.agent = new AcpAgent(child, connection));

    const init = await Promise.race([
      connection.agent.request("initialize", {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "raycast-acp", version: "0.1.0" },
      }),
      spawnError,
    ]);
    void init;

    agent.session = await Promise.race([connection.agent.buildSession(cwd).start(), spawnError]);
    agent.configOptions = toConfigOptions(agent.session.newSessionResponse.configOptions);
    return agent;
  }

  /** Change a session setting such as mode or model. */
  async setConfig(configId: string, value: string): Promise<ConfigOption[]> {
    if (!this.session) throw new Error("No session");
    const res = await this.connection.agent.request("session/set_config_option", {
      sessionId: this.session.sessionId,
      configId,
      value,
    });
    this.configOptions = toConfigOptions(res.configOptions);
    return this.configOptions;
  }

  /** Send a prompt and stream events until the turn ends. Returns the stop reason. */
  async prompt(content: Content, onEvent: (e: TurnEvent) => void): Promise<string> {
    const session = this.session;
    if (!session) throw new Error("No session");
    const done = session.prompt(content);
    done.catch(() => undefined); // surfaced via nextUpdate below

    for (;;) {
      const msg = await session.nextUpdate().catch((err) => {
        const detail = this.stderr.trim().split("\n").slice(-3).join(" ");
        throw new Error(`${err instanceof Error ? err.message : String(err)}${detail ? ` — ${detail}` : ""}`);
      });
      if (msg.kind === "stop") {
        // `usage` is in the runtime response but not in the stable schema types.
        const u = (msg.response as { usage?: Record<string, number | undefined> }).usage;
        if (u) {
          onEvent({
            type: "usage",
            usage: {
              input: u.inputTokens ?? 0,
              output: u.outputTokens ?? 0,
              cached: (u.cachedReadTokens ?? 0) + (u.cachedWriteTokens ?? 0),
              reasoning: u.thoughtTokens ?? 0,
              total: u.totalTokens ?? 0,
            },
          });
        }
        return msg.stopReason;
      }
      const u = msg.update;
      switch (u.sessionUpdate) {
        case "agent_message_chunk":
          if (u.content.type === "text") onEvent({ type: "text", text: u.content.text });
          break;
        case "agent_thought_chunk":
          if (u.content.type === "text") onEvent({ type: "thought", text: u.content.text });
          break;
        case "tool_call":
          onEvent({ type: "tool", id: u.toolCallId, title: u.title, status: u.status ?? undefined });
          break;
        case "tool_call_update":
          onEvent({ type: "tool", id: u.toolCallId, title: u.title ?? "", status: u.status ?? undefined });
          break;
        case "usage_update": {
          const model = (u._meta as Record<string, unknown> | null | undefined)?.["_claude/model"];
          onEvent({
            type: "usage",
            usage: {
              used: u.used,
              size: u.size,
              ...(u.cost ? { cost: u.cost } : {}),
              ...(typeof model === "string" ? { model } : {}),
            },
          });
          break;
        }
        case "config_option_update":
          this.configOptions = toConfigOptions(u.configOptions);
          onEvent({ type: "config", options: this.configOptions });
          break;
        case "plan":
          onEvent({ type: "plan", entries: u.entries.map((e) => ({ content: e.content, status: e.status })) });
          break;
      }
    }
  }

  async cancel() {
    if (this.session) await this.connection.agent.notify("session/cancel", { sessionId: this.session.sessionId });
  }

  dispose() {
    try {
      this.session?.dispose();
      this.connection.close();
    } finally {
      this.child.kill();
    }
  }
}

/** Display name of the configured agent, for UI text. */
export function agentLabel(kind: AgentKind = defaultAgentKind()): string {
  if (kind === "codex") return "Codex";
  if (kind === "custom") return "Custom agent";
  return "Claude";
}

export function defaultAgentKind(): AgentKind {
  return getPreferenceValues<Prefs>().agent ?? "claude";
}

/** Agents the user can switch between in the UI. */
export function availableAgents(): AgentKind[] {
  const prefs = getPreferenceValues<Prefs>();
  return prefs.agentCommand?.trim() ? ["claude", "codex", "custom"] : ["claude", "codex"];
}

function agentCommand(prefs: Prefs, kind: AgentKind): string {
  if (kind === "codex") return "npx -y @agentclientprotocol/codex-acp";
  if (kind === "custom" && prefs.agentCommand?.trim()) return prefs.agentCommand.trim();
  return "npx -y @agentclientprotocol/claude-agent-acp";
}

/** Raycast doesn't load shell profiles, so find node installed via nvm/fnm/volta (newest version first). */
function nodeManagerBins(): string[] {
  const home = homedir();
  const bins: string[] = [`${home}/.volta/bin`, `${home}/.bun/bin`];
  for (const root of [`${home}/.nvm/versions/node`, `${home}/.local/share/fnm/node-versions`]) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      bins.push(root.includes("fnm") ? `${root}/${v}/installation/bin` : `${root}/${v}/bin`);
    }
  }
  return bins.filter((b) => existsSync(b));
}

async function handlePermission(
  params: acp.RequestPermissionRequest,
  prefs: Prefs,
  kind: AgentKind,
): Promise<acp.RequestPermissionResponse> {
  const pick = (kinds: string[]) => params.options.find((o) => kinds.includes(o.kind));
  const allow = pick(["allow_once", "allow_always"]);
  const reject = pick(["reject_once", "reject_always"]);
  const policy = prefs.permissionPolicy ?? "ask";

  let choice = policy === "allow" ? allow : policy === "reject" ? reject : undefined;
  if (policy === "ask") {
    const ok = await confirmAlert({
      title: `${agentLabel(kind)} wants to use a tool`,
      message: params.toolCall.title ?? "Unknown tool",
      primaryAction: { title: allow?.name ?? "Allow" },
      dismissAction: { title: reject?.name ?? "Reject", style: Alert.ActionStyle.Cancel },
    });
    choice = ok ? allow : reject;
  }
  return choice
    ? { outcome: { outcome: "selected", optionId: choice.optionId } }
    : { outcome: { outcome: "cancelled" } };
}

/** Render streamed events to markdown. */
export function renderTurn(text: string, tools: Map<string, { title: string; status?: string }>): string {
  const toolLines = [...tools.values()].map((t) => {
    const icon = t.status === "completed" ? "✓" : t.status === "failed" ? "✗" : "…";
    return `> ${icon} ${t.title}`;
  });
  return [toolLines.join("\n"), text].filter(Boolean).join("\n\n");
}
