import { BrowserExtension, Clipboard, environment, getSelectedFinderItems, getSelectedText } from "@raycast/api";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { ContentBlock } from "@agentclientprotocol/sdk";

export type Attachment = { name: string; blocks: ContentBlock[] };

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_TEXT = 200 * 1024;

const text = (t: string): ContentBlock => ({ type: "text", text: t });

export async function selectionAttachment(): Promise<Attachment | undefined> {
  try {
    const sel = (await getSelectedText()).trim();
    if (!sel) return undefined;
    return { name: `Selection (${sel.length} chars)`, blocks: [text(`<selection>\n${sel}\n</selection>`)] };
  } catch {
    return undefined;
  }
}

export async function clipboardAttachment(): Promise<Attachment | undefined> {
  const clip = await Clipboard.read();
  if (clip.file) return fileAttachment(clip.file.replace(/^file:\/\//, "").replace(/%20/g, " "));
  const t = clip.text?.trim();
  if (!t) return undefined;
  return { name: `Clipboard (${t.length} chars)`, blocks: [text(`<clipboard>\n${t}\n</clipboard>`)] };
}

export async function finderAttachments(): Promise<Attachment[]> {
  const items = await getSelectedFinderItems();
  const out: Attachment[] = [];
  for (const it of items) out.push(await fileAttachment(it.path));
  return out;
}

async function fileAttachment(path: string): Promise<Attachment> {
  const name = basename(path);
  const ext = extname(path).toLowerCase();
  const size = (await stat(path)).size;
  if (IMAGE_TYPES[ext] && size <= MAX_IMAGE) {
    const data = (await readFile(path)).toString("base64");
    return { name, blocks: [{ type: "image", data, mimeType: IMAGE_TYPES[ext] }] };
  }
  if (size <= MAX_TEXT) {
    const buf = await readFile(path);
    if (!buf.includes(0)) return { name, blocks: [text(`<file name="${name}">\n${buf.toString("utf8")}\n</file>`)] };
  }
  return { name, blocks: [{ type: "resource_link", name, uri: pathToFileURL(path).toString() }] };
}

const MAX_PAGE = 60_000;

/** True when Raycast's Browser Extension API can be used (not available on Windows). */
export const canUseBrowser = () => environment.canAccess(BrowserExtension);

export type BrowserTab = { id: number; title: string; url: string; active: boolean };

export async function listBrowserTabs(): Promise<BrowserTab[]> {
  const tabs = await BrowserExtension.getTabs();
  return tabs.map((t) => ({ id: t.id, title: t.title || t.url, url: t.url, active: t.active }));
}

/** A tab's readable content as markdown. Defaults to the active tab of the focused window. */
export async function browserPage(tabId?: number): Promise<{ title: string; url: string; markdown: string }> {
  const [markdown, tabs] = await Promise.all([
    BrowserExtension.getContent({ format: "markdown", ...(tabId != null ? { tabId } : {}) }),
    BrowserExtension.getTabs().catch(() => []),
  ]);
  const tab = tabId != null ? tabs.find((t) => t.id === tabId) : tabs.find((t) => t.active);
  if (!markdown.trim()) throw new Error("The page has no readable content");
  return {
    title: tab?.title || tab?.url || "Browser tab",
    url: tab?.url ?? "",
    markdown: markdown.length > MAX_PAGE ? `${markdown.slice(0, MAX_PAGE)}\n\n[truncated]` : markdown,
  };
}

export async function browserTabAttachment(tabId?: number): Promise<Attachment> {
  const p = await browserPage(tabId);
  return {
    name: `Tab: ${p.title.slice(0, 40)}`,
    blocks: [text(`<webpage title="${p.title}" url="${p.url}">\n${p.markdown}\n</webpage>`)],
  };
}

/** Prompt text plus its attachments as one ACP content array. */
export function withAttachments(prompt: string, attachments: Attachment[]): ContentBlock[] | string {
  if (!attachments.length) return prompt;
  return [text(prompt), ...attachments.flatMap((a) => a.blocks)];
}
