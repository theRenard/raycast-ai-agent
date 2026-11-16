import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  getSelectedText,
  Icon,
  showToast,
  Toast,
  Keyboard,
} from "@raycast/api";
import { useEffect, useRef } from "react";
import { useAgent } from "./useAgent";
import { renderTurn } from "./acp";
import { usageRows } from "./usage";

const GUARD =
  "Work only with the text below. Do not use any tools, read files or run commands. " +
  "Reply with the result only, no preamble.\n\n";

type Props = {
  /** Fixed instruction applied to the selected text. */
  instruction?: string;
  /** Or a template with {selection} / {clipboard} placeholders. */
  template?: string;
  title?: string;
  replaceable?: boolean;
  allowTools?: boolean;
};

async function build(props: Props): Promise<{ message: string; display: string }> {
  const guard = props.allowTools ? "" : GUARD;
  if (props.template) {
    let message = props.template;
    if (message.includes("{selection}")) {
      const sel = (await getSelectedText().catch(() => "")).trim();
      if (!sel) throw new Error("Select some text first");
      message = message.replaceAll("{selection}", sel);
    }
    if (message.includes("{clipboard}")) {
      const clip = (await Clipboard.readText())?.trim();
      if (!clip) throw new Error("Clipboard is empty");
      message = message.replaceAll("{clipboard}", clip);
    }
    return { message: guard + message, display: props.title ?? props.template.slice(0, 60) };
  }
  const sel = (await getSelectedText().catch(() => "")).trim();
  if (!sel) throw new Error("Select some text first");
  return { message: `${guard}${props.instruction}\n\n<text>\n${sel}\n</text>`, display: props.instruction ?? "" };
}

/** Shared UI for "do X to the selected text" commands. */
export function SelectionCommand(props: Props) {
  const { turns, busy, send, retry, cancel, settings, setSetting } = useAgent();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    build(props)
      .then(({ message, display }) => send(message, display))
      .catch((e) => showToast({ style: Toast.Style.Failure, title: String(e.message ?? e) }));
  }, []);

  // A retry appends a turn, so always show the latest one.
  const turn = turns[turns.length - 1];
  const answer = turn?.answer ?? "";

  return (
    <Detail
      navigationTitle={props.title}
      isLoading={busy || !turn}
      metadata={
        usageRows(turn?.usage).length ? (
          <Detail.Metadata>
            {usageRows(turn?.usage).map((r) => (
              <Detail.Metadata.Label key={r.title} title={r.title} text={r.text} />
            ))}
          </Detail.Metadata>
        ) : undefined
      }
      markdown={turn ? renderTurn(answer, turn.tools) || "_…_" : "_Reading selection…_"}
      actions={
        <ActionPanel>
          {answer && props.replaceable ? <Action.Paste title="Replace Selection" content={answer} /> : null}
          {answer ? <Action.CopyToClipboard title="Copy" content={answer} /> : null}
          {answer && !props.replaceable ? <Action.Paste title="Paste" content={answer} /> : null}
          {!busy && turn ? (
            <Action
              title="Try Again"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={retry}
            />
          ) : null}
          {busy ? (
            <Action title="Stop" icon={Icon.Stop} shortcut={Keyboard.Shortcut.Common.Pin} onAction={cancel} />
          ) : null}
          {settings.map((s) => (
            <ActionPanel.Submenu key={s.id} title={s.name} icon={Icon.Gear}>
              {s.choices.map((c) => (
                <Action
                  key={c.value}
                  title={c.name}
                  icon={c.value === s.current ? Icon.CheckCircle : Icon.Circle}
                  onAction={() => setSetting(s.id, c.value)}
                />
              ))}
            </ActionPanel.Submenu>
          ))}
        </ActionPanel>
      }
    />
  );
}
