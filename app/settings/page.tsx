import VoiceSettings from "@/components/VoiceSettings";
import ExportCard from "@/components/ExportCard";
import DevFeedbackCard from "@/components/DevFeedbackCard";
import { getVoiceProfile, EMPTY_VOICE } from "@/lib/voice";
import { cutoverActive } from "@/lib/dbSource";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const profile = (await getVoiceProfile()) ?? EMPTY_VOICE;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <span className="eyebrow text-accent">Settings</span>
        <h1 className="display-title mt-1 text-2xl">Your email voice</h1>
        <p className="mt-1 text-sm text-muted">
          Teach the app how you sound. Every AI draft, reply, compose, and forward uses this.
        </p>
      </header>
      <VoiceSettings initial={profile} />
      {(await cutoverActive().catch(() => false)) ? <ExportCard /> : null}
      <DevFeedbackCard />
    </div>
  );
}
