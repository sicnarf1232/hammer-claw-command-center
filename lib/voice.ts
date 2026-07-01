import { getSetting, setSetting } from "@/lib/settings";

// Voice profile: how Jordan sounds in email. Built either by the guided Q&A in
// settings or proposed by Claude from his real sent mail, then used to steer
// every AI draft so replies sound like him, not like a generic assistant.

export const VOICE_KEY = "voice_profile";

export interface VoiceProfile {
  greeting: string; // e.g. "Hi {first}," — {first} is replaced with the recipient's first name
  signoff: string; // e.g. "Best,\nJordan"
  formality: "casual" | "balanced" | "formal";
  length: "brief" | "balanced" | "thorough";
  traits: string[]; // e.g. ["warm", "direct", "gets to the point"]
  usePhrases: string[]; // turns of phrase he actually uses
  avoidPhrases: string[]; // words/phrases to avoid
  summary: string; // a compiled paragraph describing the voice, used in the prompt
  updatedAt?: string;
}

export const EMPTY_VOICE: VoiceProfile = {
  greeting: "",
  signoff: "",
  formality: "balanced",
  length: "balanced",
  traits: [],
  usePhrases: [],
  avoidPhrases: [],
  summary: "",
};

// The guided walk-through shown in settings. Answers feed the profile; the user
// can skip any of them and lean on the Claude-proposed version instead.
export interface VoiceQuestion {
  key: keyof VoiceProfile;
  label: string;
  help: string;
  kind: "text" | "choice" | "list";
  choices?: string[];
  placeholder?: string;
}

export const VOICE_QUESTIONS: VoiceQuestion[] = [
  {
    key: "greeting",
    label: "How do you open an email?",
    help: "Your usual greeting. Use {first} where the recipient's first name goes.",
    kind: "text",
    placeholder: "Hi {first},",
  },
  {
    key: "signoff",
    label: "How do you sign off?",
    help: "Your usual closing line before your name.",
    kind: "text",
    placeholder: "Thanks,\nJordan",
  },
  {
    key: "formality",
    label: "How formal are you?",
    help: "Pick the register that fits most of your customer mail.",
    kind: "choice",
    choices: ["casual", "balanced", "formal"],
  },
  {
    key: "length",
    label: "How long are your replies?",
    help: "Do you keep it tight or spell things out?",
    kind: "choice",
    choices: ["brief", "balanced", "thorough"],
  },
  {
    key: "traits",
    label: "Describe your tone in a few words.",
    help: "One per line. e.g. warm, direct, no fluff, solution-first.",
    kind: "list",
    placeholder: "warm\ndirect\nno fluff",
  },
  {
    key: "usePhrases",
    label: "Phrases you actually use.",
    help: "One per line. Signature turns of phrase that sound like you.",
    kind: "list",
    placeholder: "Happy to help.\nLet me dig into this.",
  },
  {
    key: "avoidPhrases",
    label: "Words or phrases to avoid.",
    help: "One per line. Corporate filler you never want in a draft.",
    kind: "list",
    placeholder: "circle back\nsynergy\nas per my last email",
  },
];

export async function getVoiceProfile(): Promise<VoiceProfile | null> {
  const raw = await getSetting<Partial<VoiceProfile>>(VOICE_KEY);
  if (!raw) return null;
  return { ...EMPTY_VOICE, ...raw };
}

export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  await setSetting(VOICE_KEY, { ...profile, updatedAt: new Date().toISOString() });
}

// Compile a profile into a compact instruction block for the drafting system
// prompt. Returns "" when there is nothing meaningful to say.
export function voiceInstructions(p: VoiceProfile | null): string {
  if (!p) return "";
  const lines: string[] = [];
  if (p.summary.trim()) lines.push(p.summary.trim());
  if (p.greeting.trim()) lines.push(`Open with a greeting in this style: "${p.greeting.trim()}".`);
  if (p.signoff.trim()) lines.push(`Sign off in this style: "${p.signoff.trim().replace(/\n/g, " / ")}".`);
  lines.push(`Register: ${p.formality}. Length: ${p.length}.`);
  if (p.traits.length) lines.push(`Tone: ${p.traits.join(", ")}.`);
  if (p.usePhrases.length) lines.push(`Natural phrasing he uses: ${p.usePhrases.join("; ")}.`);
  if (p.avoidPhrases.length) lines.push(`Never use these: ${p.avoidPhrases.join("; ")}.`);
  if (!lines.length) return "";
  return ["Write in Jordan's voice:", ...lines.map((l) => `- ${l}`)].join("\n");
}
