import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { Chat } from "./lib/Chat";
import { Conversation, useStoredList } from "./lib/store";

export default function Conversations() {
  const { items, loading, update } = useStoredList<Conversation>("conversations");
  const { push } = useNavigation();
  return (
    <List isLoading={loading} isShowingDetail searchBarPlaceholder="Search conversations…">
      <List.EmptyView icon={Icon.Clock} title="No conversations yet" />
      {items.map((c) => (
        <List.Item
          key={c.id}
          title={c.title}
          subtitle={c.agent}
          accessories={[{ date: new Date(c.updatedAt) }]}
          detail={
            <List.Item.Detail markdown={c.turns.map((t) => `**${t.prompt}**\n\n${t.answer}`).join("\n\n---\n\n")} />
          }
          actions={
            <ActionPanel>
              <Action title="Resume" icon={Icon.ArrowRight} onAction={() => push(<Chat conversation={c} />)} />
              <Action.CopyToClipboard
                title="Copy Conversation"
                content={c.turns.map((t) => `Q: ${t.prompt}\nA: ${t.answer}`).join("\n\n")}
              />
              <Action
                title="Delete"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={() => update((p) => p.filter((x) => x.id !== c.id))}
              />
              <Action
                title="Delete All"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={() => update(() => [])}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
