import { Action, ActionPanel, Icon, List, useNavigation, Keyboard } from "@raycast/api";
import { SelectionCommand } from "./lib/SelectionCommand";
import { DEFAULT_PROMPTS, PROMPTS_KEY, PromptTemplate, useStoredList } from "./lib/store";
import ManagePrompts from "./manage-prompts";

export default function RunPrompt() {
  const { items, loading } = useStoredList<PromptTemplate>(PROMPTS_KEY, DEFAULT_PROMPTS);
  const { push } = useNavigation();
  return (
    <List isLoading={loading} searchBarPlaceholder="Run a prompt on the selection or clipboard…">
      {items.map((p) => (
        <List.Item
          key={p.id}
          title={p.title}
          subtitle={p.prompt.replace(/\s+/g, " ").slice(0, 80)}
          actions={
            <ActionPanel>
              <Action
                title="Run"
                icon={Icon.Play}
                onAction={() =>
                  push(
                    <SelectionCommand
                      title={p.title}
                      template={p.prompt}
                      replaceable={p.replace}
                      allowTools={p.allowTools}
                    />,
                  )
                }
              />
              <Action
                title="Manage Prompts"
                icon={Icon.Pencil}
                shortcut={Keyboard.Shortcut.Common.Edit}
                onAction={() => push(<ManagePrompts />)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
