import { dbConfigured } from "@/lib/db";
import { gatherAgentsData } from "@/lib/agents/metrics";
import AgentsView from "@/components/AgentsView";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AgentsPage() {
  if (!dbConfigured()) {
    return <SetupNotice missing={["POSTGRES_URL"]} />;
  }
  const data = await gatherAgentsData();
  return <AgentsView data={data} />;
}
