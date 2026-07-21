import VoiceSettings from "@/components/VoiceSettings";
import ExportCard from "@/components/ExportCard";
import DevFeedbackCard from "@/components/DevFeedbackCard";
import { getVoiceProfile, EMPTY_VOICE } from "@/lib/voice";
import { cutoverActive } from "@/lib/dbSource";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const profile = (await getVoiceProfile()) ?? EMPTY_VOICE;

  const exportEnabled = await cutoverActive().catch(() => false);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <span className="eyebrow text-accent">Settings</span>
        <h1 className="display-title mt-1 text-2xl">Your email voice</h1>
        <p className="mt-1 text-sm text-muted">
          Teach the app how you sound. Every AI draft, reply, compose, and forward uses this.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <VoiceSettings initial={profile} />
        </div>
        <div className="space-y-6">
          {exportEnabled ? <ExportCard /> : null}
          <DevFeedbackCard />
        </div>
      </div>
    </div>
  );
}
