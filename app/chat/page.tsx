import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ChatClient from "./chat-client";
import { isPublicDemoEnvironment } from "@/lib/public-demo";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatClient email={user.email} isAdmin={user.role === "admin"} isSharedPublicDemo={isPublicDemoEnvironment()} />;
}
