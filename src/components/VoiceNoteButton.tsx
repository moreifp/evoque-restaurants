import { Mic, Square, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceTranscription } from "@/hooks/useVoiceTranscription";
import { useI18n } from "@/i18n/i18n";

interface VoiceNoteButtonProps {
  onTranscribed: (text: string) => void;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function VoiceNoteButton({ onTranscribed }: VoiceNoteButtonProps) {
  const { t } = useI18n();
  const { isRecording, isTranscribing, duration, start, stop, cancel, isSupported } =
    useVoiceTranscription(onTranscribed);

  if (!isSupported) return null;

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={isRecording ? stop : start}
        disabled={isTranscribing}
        aria-pressed={isRecording}
        aria-label={
          isTranscribing
            ? t("voiceNote.transcribing")
            : isRecording
              ? t("voiceNote.stop")
              : t("voiceNote.start")
        }
        className={cn(
          "absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur hover:bg-background z-10",
          isRecording && "text-destructive"
        )}
      >
        {isTranscribing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>

      {isRecording && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-3 rounded-md bg-background/95 backdrop-blur px-3 py-1.5 border border-border shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-0.5 h-4">
              <span className="w-0.5 bg-destructive rounded-full animate-[wave_0.9s_ease-in-out_infinite] h-2" />
              <span className="w-0.5 bg-destructive rounded-full animate-[wave_0.7s_ease-in-out_infinite] h-3" style={{ animationDelay: "0.1s" }} />
              <span className="w-0.5 bg-destructive rounded-full animate-[wave_1s_ease-in-out_infinite] h-4" style={{ animationDelay: "0.2s" }} />
              <span className="w-0.5 bg-destructive rounded-full animate-[wave_0.8s_ease-in-out_infinite] h-2.5" style={{ animationDelay: "0.3s" }} />
            </div>
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {formatDuration(duration)}
            </span>
            <span className="text-xs text-muted-foreground">{t("voiceNote.recording")}</span>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            aria-label={t("voiceNote.cancel")}
          >
            <X className="h-3 w-3" />
            {t("voiceNote.cancel")}
          </button>
        </div>
      )}

      {isTranscribing && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-md bg-background/95 backdrop-blur px-3 py-1.5 border border-border shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">{t("voiceNote.transcribing")}</span>
        </div>
      )}
    </>
  );
}
