import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/i18n";

const MAX_DURATION_MS = 120_000; // 2 minutes

function pickMimeType(): string | null {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg;codecs=opus",
  ];
  const supports = (t: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t);
  for (const c of candidates) if (supports(c)) return c;
  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface UseVoiceTranscriptionResult {
  isRecording: boolean;
  isTranscribing: boolean;
  duration: number; // seconds
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  isSupported: boolean;
}

export function useVoiceTranscription(onTranscribed: (text: string) => void): UseVoiceTranscriptionResult {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const isSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (autoStopRef.current) { window.clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const transcribe = useCallback(async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    try {
      const base64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio: base64, mimeType, language },
      });
      if (error) throw error;
      const text = (data?.text ?? "").trim();
      if (!text) {
        toast({ title: t("voiceNote.empty"), variant: "destructive" });
        return;
      }
      onTranscribed(text);
    } catch (e: any) {
      console.error("[voice] transcribe error", e);
      const msg = e?.message || "";
      if (msg.includes("429") || msg.includes("rate_limit")) {
        toast({ title: t("voiceNote.rateLimit"), variant: "destructive" });
      } else if (msg.includes("402") || msg.includes("no_credits")) {
        toast({ title: t("voiceNote.noCredits"), variant: "destructive" });
      } else {
        toast({ title: t("voiceNote.error"), variant: "destructive" });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [language, onTranscribed, toast, t]);

  const start = useCallback(async () => {
    if (!isSupported) {
      toast({ title: t("voiceNote.notSupported"), variant: "destructive" });
      return;
    }
    try {
      cancelledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const actualMime = recorder.mimeType || mime || "audio/webm";
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const wasCancelled = cancelledRef.current;
        const chunks = chunksRef.current.slice();
        cleanup();
        if (wasCancelled || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: actualMime });
        void transcribe(blob, actualMime);
      };

      recorder.start();
      setIsRecording(true);
      setDuration(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
      autoStopRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          toast({ title: t("voiceNote.tooLong") });
          recorderRef.current.stop();
        }
      }, MAX_DURATION_MS);
    } catch (e: any) {
      console.error("[voice] start error", e);
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast({ title: t("voiceNote.permissionDenied"), variant: "destructive" });
      } else {
        toast({ title: t("voiceNote.error"), variant: "destructive" });
      }
      cleanup();
    }
  }, [cleanup, isSupported, toast, t, transcribe]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      cancelledRef.current = false;
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      cleanup();
    }
  }, [cleanup]);

  return { isRecording, isTranscribing, duration, start, stop, cancel, isSupported };
}
