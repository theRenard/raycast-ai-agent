import { useNavigation } from "@raycast/api";
import { Chat } from "./lib/Chat";
import Conversations from "./conversations";

export default function AskAgent() {
  const { push } = useNavigation();
  return <Chat onOpenHistory={() => push(<Conversations />)} />;
}
