import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";

/** Dois botões grandes: "Só os pratos" | "Com explicação". */
export function MenuExplainToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const opcoes: Array<[boolean, string]> = [
    [false, t("menuView.dishesOnly")],
    [true, t("menuView.withExplanation")],
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1" role="radiogroup">
      {opcoes.map(([v, rotulo]) => (
        <button
          key={rotulo}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-12 rounded-xl text-base font-semibold transition-colors",
            value === v ? "bg-background text-[#0d1a2d] shadow" : "text-muted-foreground",
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
