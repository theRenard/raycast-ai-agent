import { SelectionCommand } from "./lib/SelectionCommand";

export default function Command() {
  return (
    <SelectionCommand
      replaceable
      instruction="Fix spelling, grammar and punctuation. Keep the original language, tone and formatting. Output only the corrected text."
    />
  );
}
