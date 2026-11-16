import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { SavedAnswer, useStoredList } from "./lib/store";

export default function SavedAnswers() {
  const { items, loading, update } = useStoredList<SavedAnswer>("saved-answers");
  return (
    <List isLoading={loading} isShowingDetail searchBarPlaceholder="Search saved answers…">
      <List.EmptyView icon={Icon.Star} title="No saved answers" description="Press ⌘S on an answer to save it." />
      {items.map((a) => (
        <List.Item
          key={a.id}
          title={a.prompt}
          keywords={a.answer.split(/\s+/).slice(0, 50)}
          accessories={[{ date: new Date(a.savedAt) }]}
          detail={<List.Item.Detail markdown={a.answer} />}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Answer" content={a.answer} />
              <Action.Paste title="Paste Answer" content={a.answer} />
              <Action
                title="Delete"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={() => update((p) => p.filter((x) => x.id !== a.id))}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
