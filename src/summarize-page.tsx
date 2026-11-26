import { SelectionCommand } from "./lib/SelectionCommand";

export default function Command() {
  return (
    <SelectionCommand
      title="Summarize Webpage"
      template={
        "Summarize this web page in a few bullet points, then list any action items or key facts.\n\n{browser-tab}"
      }
    />
  );
}
