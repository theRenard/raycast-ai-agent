import { LocalStorage } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";

export type StoredTurn = { prompt: string; answer: string };
export type Conversation = {
  id: string;
  title: string;
  agent: string;
  updatedAt: number;
  turns: StoredTurn[];
};
export type SavedAnswer = { id: string; prompt: string; answer: string; savedAt: number };
export type PromptTemplate = {
  id: string;
  title: string;
  /** May contain {selection} and {clipboard}. */
  prompt: string;
  /** Offer "Replace Selection" for the result. */
  replace?: boolean;
  /** Let the agent use tools (read files, run commands). Off by default. */
  allowTools?: boolean;
};

const MAX_CONVERSATIONS = 50;

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await LocalStorage.getItem<string>(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const write = (key: string, value: unknown) => LocalStorage.setItem(key, JSON.stringify(value));

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A small persisted-list hook: `items` loads asynchronously, `update` writes through. */
export function useStoredList<T>(key: string, fallback: T[] = []) {
  const [items, setItems] = useState<T[]>(fallback);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    read<T[]>(key, fallback).then((v) => {
      setItems(v);
      setLoading(false);
    });
  }, [key]);
  const update = useCallback(
    async (fn: (prev: T[]) => T[]) => {
      const next = fn(await read<T[]>(key, fallback));
      await write(key, next);
      setItems(next);
    },
    [key],
  );
  return { items, loading, update };
}

export async function upsertConversation(c: Conversation) {
  const all = await read<Conversation[]>("conversations", []);
  const next = [c, ...all.filter((x) => x.id !== c.id)].slice(0, MAX_CONVERSATIONS);
  await write("conversations", next);
}

export async function saveAnswer(prompt: string, answer: string) {
  const all = await read<SavedAnswer[]>("saved-answers", []);
  await write("saved-answers", [{ id: newId(), prompt, answer, savedAt: Date.now() }, ...all]);
}

export const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: "improve",
    title: "Improve Writing",
    prompt:
      "Improve the clarity and flow of this text. Keep the meaning and language. Output only the result.\n\n{selection}",
    replace: true,
  },
  {
    id: "reply",
    title: "Draft a Reply",
    prompt: "Draft a concise, friendly reply to this message. Output only the reply.\n\n{selection}",
  },
  {
    id: "tests",
    title: "Write Tests",
    prompt: "Write unit tests for this code. Output only code.\n\n{selection}",
  },
  {
    id: "clipboard",
    title: "Explain Clipboard",
    prompt: "Explain this simply:\n\n{clipboard}",
  },
];

export const PROMPTS_KEY = "prompts";
