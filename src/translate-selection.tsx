import { LaunchProps } from "@raycast/api";
import { SelectionCommand } from "./lib/SelectionCommand";

export default function Command(props: LaunchProps<{ arguments: { language?: string } }>) {
  const language = props.arguments.language?.trim() || "English";
  return (
    <SelectionCommand
      replaceable
      instruction={`Translate this text to ${language}. Keep formatting. Output only the translation.`}
    />
  );
}
