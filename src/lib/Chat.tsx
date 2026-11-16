import { Action, ActionPanel, Icon, Keyboard, List, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { useAgent } from "./useAgent";
import { AgentKind, Prefs, agentLabel, availableAgents, renderTurn } from "./acp";
import { Attachment, clipboardAttachment, finderAttachments, selectionAttachment, withAttachments } from "./context";
import { Conversation, saveAnswer } from "./store";
import { usageRows, usageSummary } from "./usage";

export function Chat(props: { conversation?: Conversation; onOpenHistory?: () => void }) {
  const { turns, busy, send, retry, cancel, settings, setSetting, reset, agentKind, switchAgent } = useAgent({
    persist: true,
    warm: true,
    conversation: props.conversation,
  });
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string | undefined>();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const add = (a?: Attachment | Attachment[], emptyMsg = "Nothing to attach") => {
    const list = Array.isArray(a) ? a : a ? [a] : [];
    if (!list.length) return showToast({ style: Toast.Style.Failure, title: emptyMsg });
    setAttachments((prev) => [...prev, ...list]);
  };
  const attach = (fn: () => Promise<Attachment | Attachment[] | undefined>, emptyMsg: string) =>
    fn()
      .then((a) => add(a, emptyMsg))
      .catch((e) => showToast({ style: Toast.Style.Failure, title: emptyMsg, message: String(e.message ?? e) }));

  useEffect(() => {
    if (props.conversation || getPreferenceValues<Prefs>().autoAttachSelection === false) return;
    selectionAttachment().then((a) => a && setAttachments([a]));
  }, []);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    const names = attachments.map((a) => a.name);
    setInput("");
    setSelected(String(turns.length));
    send(withAttachments(text, attachments), text, names.length ? names : undefined);
    setAttachments([]);
  };

  const newChat = () => {
    reset();
    setAttachments([]);
    setSelected(undefined);
  };

  const modelOption = settings.find((s) => s.category === "model");

  const label = useMemo(() => {
    const pick = (cat: string) => settings.find((s) => s.category === cat);
    const parts = [agentLabel(agentKind)];
    for (const cat of ["mode", "model"]) {
      const o = pick(cat);
      const c = o?.choices.find((x) => x.value === o.current);
      if (c) parts.push(c.name);
    }
    const ctx = usageSummary([...turns].reverse().find((t) => t.usage?.used != null)?.usage);
    if (ctx) parts.push(`ctx ${ctx}`);
    return parts.join(" · ");
  }, [settings, turns, agentKind]);

  const actions = (t?: { prompt: string; answer: string }) => (
    <ActionPanel>
      <ActionPanel.Section>
        {input.trim() ? <Action title="Send" icon={Icon.Message} onAction={submit} /> : null}
        {t?.answer ? <Action.CopyToClipboard title="Copy Answer" content={t.answer} /> : null}
        {t?.answer ? <Action.Paste title="Paste Answer" content={t.answer} /> : null}
        {t?.answer ? (
          <Action
            title="Save Answer"
            icon={Icon.Star}
            shortcut={Keyboard.Shortcut.Common.Save}
            onAction={async () => {
              await saveAnswer(t.prompt, t.answer);
              showToast({ style: Toast.Style.Success, title: "Saved" });
            }}
          />
        ) : null}
        {t ? (
          <Action.CopyToClipboard title="Copy Question" content={t.prompt} shortcut={Keyboard.Shortcut.Common.Copy} />
        ) : null}
        {turns.length && !busy ? (
          <Action
            title="Regenerate"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={retry}
          />
        ) : null}
        {busy ? (
          <Action title="Stop" icon={Icon.Stop} shortcut={Keyboard.Shortcut.Common.Pin} onAction={cancel} />
        ) : null}
      </ActionPanel.Section>
      <ActionPanel.Section title="Context">
        <Action
          title="Attach Selected Text"
          icon={Icon.Text}
          shortcut={{ modifiers: ["cmd"], key: "t" }}
          onAction={() => attach(selectionAttachment, "No text selected")}
        />
        <Action
          title="Attach Clipboard"
          icon={Icon.Clipboard}
          shortcut={{ modifiers: ["cmd"], key: "b" }}
          onAction={() => attach(clipboardAttachment, "Clipboard is empty")}
        />
        <Action
          title="Attach Finder Selection"
          icon={Icon.Paperclip}
          shortcut={{ modifiers: ["cmd"], key: "f" }}
          onAction={() => attach(finderAttachments, "No Finder selection")}
        />
        {attachments.length ? (
          <Action title="Clear Attachments" icon={Icon.XMarkCircle} onAction={() => setAttachments([])} />
        ) : null}
      </ActionPanel.Section>
      <ActionPanel.Section title="Agent">
        {settings.map((s) => (
          <ActionPanel.Submenu
            key={s.id}
            title={s.name}
            icon={Icon.Gear}
            shortcut={
              s.category === "model"
                ? { modifiers: ["cmd"], key: "m" }
                : s.category === "mode"
                  ? { modifiers: ["cmd", "shift"], key: "m" }
                  : undefined
            }
          >
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
        <Action title="New Conversation" icon={Icon.Plus} shortcut={Keyboard.Shortcut.Common.New} onAction={newChat} />
        {props.onOpenHistory ? (
          <Action
            title="History"
            icon={Icon.Clock}
            shortcut={{ modifiers: ["cmd"], key: "h" }}
            onAction={props.onOpenHistory}
          />
        ) : null}
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List
      navigationTitle={label}
      isShowingDetail={turns.length > 0}
      isLoading={busy}
      searchText={input}
      onSearchTextChange={setInput}
      searchBarPlaceholder={turns.length ? "Ask a follow-up…" : `Ask ${agentLabel(agentKind)} anything…`}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Agent and model"
          value={`agent:${agentKind}`}
          onChange={(v) => {
            if (v.startsWith("agent:")) switchAgent(v.slice(6) as AgentKind);
            else if (modelOption && v.slice(6) !== modelOption.current) setSetting(modelOption.id, v.slice(6));
          }}
        >
          <List.Dropdown.Section title="Agent">
            {availableAgents().map((k) => (
              <List.Dropdown.Item key={k} title={agentLabel(k)} value={`agent:${k}`} />
            ))}
          </List.Dropdown.Section>
          {modelOption ? (
            <List.Dropdown.Section title="Model">
              {modelOption.choices.map((c) => (
                <List.Dropdown.Item key={c.value} title={c.name} value={`model:${c.value}`} />
              ))}
            </List.Dropdown.Section>
          ) : null}
        </List.Dropdown>
      }
      selectedItemId={selected}
      onSelectionChange={(id) => setSelected(id ?? undefined)}
      actions={actions()}
    >
      {turns.length === 0 ? (
        <List.EmptyView
          icon={Icon.Message}
          title="Type a question and press Enter"
          description={
            attachments.length
              ? `Attached: ${attachments.map((a) => a.name).join(", ")}`
              : "⌘T attach selection · ⌘B clipboard · ⌘F Finder files"
          }
        />
      ) : (
        [...turns]
          .map((t, i) => ({ t, i }))
          .reverse()
          .map(({ t, i }) => (
            <List.Item
              key={i}
              id={String(i)}
              title={t.prompt}
              icon={t.done ? Icon.Message : Icon.CircleProgress}
              accessories={t.attachments ? [{ icon: Icon.Paperclip, tooltip: t.attachments.join(", ") }] : []}
              detail={
                <List.Item.Detail
                  markdown={renderTurn(t.answer, t.tools) || "_…_"}
                  metadata={
                    usageRows(t.usage).length ? (
                      <List.Item.Detail.Metadata>
                        {usageRows(t.usage).map((r) => (
                          <List.Item.Detail.Metadata.Label key={r.title} title={r.title} text={r.text} />
                        ))}
                      </List.Item.Detail.Metadata>
                    ) : undefined
                  }
                />
              }
              actions={actions(t)}
            />
          ))
      )}
    </List>
  );
}
