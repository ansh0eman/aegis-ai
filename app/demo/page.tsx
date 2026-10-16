import type { Metadata } from "next";
import SiteHeader from "@/app/ui/site-header";
import { getDemoInferenceConfig } from "@/lib/demo-inference";
import DemoClient from "./demo-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enterprise Playground | Aegis AI",
  description: "Switch between synthetic admin and member identities to explore Aegis AI access rules, quotas, chat, and audit history.",
};

export default function DemoPage() {
  const liveInferenceAvailable = getDemoInferenceConfig().available;
  return (
    <>
      <SiteHeader page="demo" />
      <DemoClient liveInferenceAvailable={liveInferenceAvailable} />
    </>
  );
}
