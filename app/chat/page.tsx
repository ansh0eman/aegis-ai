import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ChatClient from "./chat-client";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatClient email={user.email} />;
}
