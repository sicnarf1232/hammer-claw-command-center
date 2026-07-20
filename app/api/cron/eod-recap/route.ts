import { briefRoute } from "@/lib/cronRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = briefRoute("eod", { hour: 17 });
