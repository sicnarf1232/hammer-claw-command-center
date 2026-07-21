import { dbConfigured } from "@/lib/db";
import { gatherAgentsData } from "@/lib/agents/metrics";
import { listWorkflows } from "@/lib/workflows";
import AgentsView from "@/components/AgentsView";
import SetupNotice from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AgentsPage() {
  if (!dbConfigured()) {
    return <SetupNotice missing={["POSTGRES_URL"]} />;
  }
  const [data, workflows] = await Promise.all([gatherAgentsData(), listWorkflows()]);
  return <AgentsView data={data} workflows={workflows} />;
}
