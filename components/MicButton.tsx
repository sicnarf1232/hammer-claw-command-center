"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not in lib.dom for all targets).
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// A small mic toggle that dictates speech and feeds final transcripts to onText.
// Uses the browser Web Speech API (Chrome/Edge/Safari); renders nothing where
// unsupported. Spacing/label kept compact so it can sit next to a textarea.
export default function MicButton({
  onText,
  title = "Dictate",
  className = "",
}: {
  onText: (text: string) => void;
  title?: string;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(Boolean(getCtor()));
    return () => {
      recRef.current?.stop();
    };
  }, []);

  function toggle() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) text += r[0].transcript;
      }
      if (text.trim()) onText(text.trim());
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  }

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={recording}
      title={recording ? "Stop dictation" : title}
      className={`btn-outline ${className} ${recording ? "text-danger" : ""}`}
    >
      {recording ? "● Listening…" : "🎤 Speak"}
    </button>
  );
}
