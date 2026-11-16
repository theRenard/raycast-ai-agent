import { useCallback, useEffect, useRef, useState } from "react";
import { showToast, Toast } from "@raycast/api";
import { AcpAgent, AgentKind, Content, ConfigOption, TurnEvent, Usage, agentLabel, defaultAgentKind } from "./acp";
import { Conversation, StoredTurn, newId, upsertConversation } from "./store";

export type Turn = {
  prompt: string;
  answer: string;
  tools: Map<string, { title: string; status?: string }>;
  done: boolean;
  /** Names of attached context items, for display. */
  attachments?: string[];
  /** Live token/cost figures, merged from the agent's usage updates. */
  usage?: Partial<Usage>;
};

type Options = {
  /** Persist the conversation to history. */
  persist?: boolean;
  /** Resume a stored conversation (replays its text to the new session as context). */
  conversation?: Conversation;
  /** Start the agent immediately so settings are available before the first prompt. */
  warm?: boolean;
};

const CONTEXT_TURNS = 6;
const CONTEXT_CHARS = 1500;

function transcript(turns: StoredTurn[]): string {
  return turns
    .slice(-CONTEXT_TURNS)
    .map((t) => `User: ${t.prompt.slice(0, CONTEXT_CHARS)}\nAssistant: ${t.answer.slice(0, CONTEXT_CHARS)}`)
    .join("\n\n");
}

/** Keeps one agent process + session alive for the lifetime of a command. */
export function useAgent(options: Options = {}) {
  const agentRef = useRef<AcpAgent | null>(null);
  const starting = useRef<Promise<AcpAgent> | null>(null);
  const idRef = useRef(options.conversation?.id ?? newId());
  const restored = useRef<StoredTurn[]>(options.conversation?.turns ?? []);
  const [turns, setTurns] = useState<Turn[]>(
    () => options.conversation?.turns.map((t) => ({ ...t, tools: new Map(), done: true })) ?? [],
  );
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const [busy, setBusy] = useState(false);
  const [agentKind, setAgentKind] = useState<AgentKind>(defaultAgentKind);
  const kindRef = useRef<AgentKind>(agentKind);
  const [settings, setSettings] = useState<ConfigOption[]>([]);
  const lastRequest = useRef<{ content: Content; display: string; attachments?: string[] } | null>(null);

  const getAgent = useCallback(async () => {
    if (agentRef.current) return agentRef.current;
    if (!starting.current) {
      starting.current = AcpAgent.start(kindRef.current).then((a) => {
        agentRef.current = a;
        setSettings(a.configOptions);
        return a;
      });
      starting.current.catch(() => (starting.current = null));
    }
    return starting.current;
  }, []);

  useEffect(() => {
    if (options.warm) {
      getAgent().catch((err) =>
        showToast({
          style: Toast.Style.Failure,
          title: `${agentLabel(kindRef.current)} failed`,
          message: String(err.message ?? err),
        }),
      );
    }
    return () => {
      agentRef.current?.dispose();
    };
  }, []);

  const persist = useCallback(() => {
    if (!options.persist) return;
    const done = turnsRef.current.filter((t) => t.done && t.answer);
    if (!done.length) return;
    upsertConversation({
      id: idRef.current,
      title: done[0].prompt.slice(0, 80),
      agent: agentLabel(kindRef.current),
      updatedAt: Date.now(),
      turns: done.map((t) => ({ prompt: t.prompt, answer: t.answer })),
    });
  }, [options.persist]);

  const send = useCallback(
    async (content: Content, displayPrompt?: string, attachments?: string[]) => {
      const display = displayPrompt ?? (typeof content === "string" ? content : "");
      lastRequest.current = { content, display, attachments };
      setBusy(true);
      const index = turnsRef.current.length;
      const turn: Turn = { prompt: display, answer: "", tools: new Map(), done: false, attachments };
      setTurns((t) => [...t, turn]);
      const update = () => setTurns((t) => t.map((x, i) => (i === index ? { ...turn } : x)));

      // First message after resuming: give the fresh session the earlier conversation as context.
      let payload = content;
      if (restored.current.length) {
        const preface = `Earlier in this conversation:\n\n${transcript(restored.current)}\n\nContinue from there. New message:\n\n`;
        payload = typeof content === "string" ? preface + content : [{ type: "text", text: preface }, ...content];
        restored.current = [];
      }

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `${agentLabel(kindRef.current)} is thinking…`,
      });
      try {
        const agent = await getAgent();
        const stop = await agent.prompt(payload, (e: TurnEvent) => {
          if (e.type === "text") turn.answer += e.text;
          if (e.type === "config") setSettings(e.options);
          if (e.type === "usage") turn.usage = { ...turn.usage, ...e.usage };
          if (e.type === "tool") {
            const prev = turn.tools.get(e.id);
            turn.tools.set(e.id, { title: e.title || prev?.title || "Tool", status: e.status ?? prev?.status });
          }
          update();
        });
        turn.done = true;
        update();
        turnsRef.current = turnsRef.current.map((x, i) => (i === index ? { ...turn } : x));
        persist();
        toast.style = Toast.Style.Success;
        toast.title = stop === "end_turn" ? "Done" : `Stopped: ${stop}`;
      } catch (err) {
        turn.done = true;
        update();
        toast.style = Toast.Style.Failure;
        toast.title = `${agentLabel(kindRef.current)} failed`;
        toast.message = err instanceof Error ? err.message : String(err);
      } finally {
        setBusy(false);
      }
    },
    [getAgent, persist],
  );

  /** Re-send the last request as a new turn. */
  const retry = useCallback(() => {
    const r = lastRequest.current;
    if (r) send(r.content, r.display, r.attachments);
  }, [send]);

  const cancel = useCallback(() => agentRef.current?.cancel(), []);

  const setSetting = useCallback(async (id: string, value: string) => {
    try {
      setSettings(await (await getAgentRef()).setConfig(id, value));
    } catch (err) {
      showToast({ style: Toast.Style.Failure, title: "Couldn't change setting", message: String(err) });
    }
    async function getAgentRef() {
      if (!agentRef.current) throw new Error("Agent not started yet");
      return agentRef.current;
    }
  }, []);

  /** Drop the conversation and agent process; the next send starts a fresh session. */
  const reset = useCallback(() => {
    agentRef.current?.dispose();
    agentRef.current = null;
    starting.current = null;
    idRef.current = newId();
    restored.current = [];
    setTurns([]);
    setSettings([]);
    getAgent().catch(() => undefined);
  }, [getAgent]);

  /** Swap to another agent, keeping the visible conversation as context for the new one. */
  const switchAgent = useCallback(
    (kind: AgentKind) => {
      if (kind === kindRef.current || busy) return;
      agentRef.current?.dispose();
      agentRef.current = null;
      starting.current = null;
      kindRef.current = kind;
      setAgentKind(kind);
      setSettings([]);
      restored.current = turnsRef.current
        .filter((t) => t.done && t.answer)
        .map((t) => ({ prompt: t.prompt, answer: t.answer }));
      getAgent().catch((err) =>
        showToast({
          style: Toast.Style.Failure,
          title: `${agentLabel(kind)} failed`,
          message: String(err.message ?? err),
        }),
      );
    },
    [getAgent, busy],
  );

  return { turns, busy, send, retry, cancel, settings, setSetting, reset, agentKind, switchAgent };
}
