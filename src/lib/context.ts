import { Clipboard, getSelectedFinderItems, getSelectedText } from "@raycast/api";
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

/** Prompt text plus its attachments as one ACP content array. */
export function withAttachments(prompt: string, attachments: Attachment[]): ContentBlock[] | string {
  if (!attachments.length) return prompt;
  return [text(prompt), ...attachments.flatMap((a) => a.blocks)];
}
