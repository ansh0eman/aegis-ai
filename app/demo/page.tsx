import type { Metadata } from "next";
import SiteHeader from "@/app/ui/site-header";
import DemoClient from "./demo-client";

export const metadata: Metadata = {
  title: "Interactive Demo | Aegis AI",
  description: "Explore a scripted, data-free demonstration of Aegis AI chat and governance.",
};

export default function DemoPage() {
  return (
    <>
      <SiteHeader page="demo" />
      <DemoClient />
    </>
  );
}
