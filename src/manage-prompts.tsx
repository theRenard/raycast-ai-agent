import { Action, ActionPanel, Form, Icon, List, useNavigation, Keyboard } from "@raycast/api";
import { DEFAULT_PROMPTS, PROMPTS_KEY, PromptTemplate, newId, useStoredList } from "./lib/store";

function PromptForm(props: { prompt?: PromptTemplate; onSave: (p: PromptTemplate) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Prompt"
            onSubmit={(v: { title: string; prompt: string; replace: boolean; allowTools: boolean }) => {
              props.onSave({ id: props.prompt?.id ?? newId(), ...v });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={props.prompt?.title} />
      <Form.TextArea
        id="prompt"
        title="Prompt"
        info="Use {selection} for the selected text and {clipboard} for the clipboard."
        placeholder="Rewrite this more formally:\n\n{selection}"
        defaultValue={props.prompt?.prompt}
      />
      <Form.Checkbox id="replace" label="Offer “Replace Selection”" defaultValue={props.prompt?.replace ?? false} />
      <Form.Checkbox
        id="allowTools"
        label="Allow the agent to use tools (read files, run commands)"
        defaultValue={props.prompt?.allowTools ?? false}
      />
    </Form>
  );
}

export default function ManagePrompts() {
  const { items, loading, update } = useStoredList<PromptTemplate>(PROMPTS_KEY, DEFAULT_PROMPTS);
  const save = (p: PromptTemplate) =>
    update((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]));
  return (
    <List isLoading={loading} isShowingDetail>
      <List.EmptyView
        icon={Icon.Text}
        title="No prompts"
        actions={
          <ActionPanel>
            <Action.Push title="New Prompt" target={<PromptForm onSave={save} />} />
          </ActionPanel>
        }
      />
      {items.map((p) => (
        <List.Item
          key={p.id}
          title={p.title}
          detail={<List.Item.Detail markdown={`\`\`\`\n${p.prompt}\n\`\`\``} />}
          actions={
            <ActionPanel>
              <Action.Push title="Edit" icon={Icon.Pencil} target={<PromptForm prompt={p} onSave={save} />} />
              <Action.Push
                title="New Prompt"
                icon={Icon.Plus}
                shortcut={Keyboard.Shortcut.Common.New}
                target={<PromptForm onSave={save} />}
              />
              <Action
                title="Delete"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={() => update((prev) => prev.filter((x) => x.id !== p.id))}
              />
              <Action
                title="Restore Defaults"
                icon={Icon.ArrowClockwise}
                onAction={() =>
                  update((prev) => [...prev, ...DEFAULT_PROMPTS.filter((d) => !prev.some((x) => x.id === d.id))])
                }
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
