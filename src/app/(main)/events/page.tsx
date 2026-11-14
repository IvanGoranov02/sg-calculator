import type { Metadata } from "next";
import { EventsClient } from "@/components/events/EventsClient";

export const metadata: Metadata = { title: "Events" };

export const dynamic = "force-dynamic";

export default function EventsPage() {
  return <EventsClient />;
}
