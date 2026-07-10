import { transitionJob } from "@/lib/actions";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/types";

/** Advance / regress controls backed by the single transition server action. */
export default function StageActions({
  jobId,
  stage,
  compact = false,
}: {
  jobId: number;
  stage: Stage;
  compact?: boolean;
}) {
  const idx = STAGES.indexOf(stage);
  const prev = idx > 0 ? STAGES[idx - 1] : null;
  const next = idx < STAGES.length - 1 ? STAGES[idx + 1] : null;

  const btn = compact
    ? "block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100"
    : "rounded-md px-3 py-1.5 text-sm font-medium";

  return (
    <div className={compact ? "" : "flex flex-wrap gap-2"}>
      {next ? (
        <form action={transitionJob}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="toStage" value={next} />
          <button
            type="submit"
            className={
              compact
                ? `${btn} font-medium text-emerald-700`
                : `${btn} bg-emerald-600 text-white hover:bg-emerald-700`
            }
          >
            Advance → {STAGE_LABELS[next]}
          </button>
        </form>
      ) : null}
      {prev ? (
        <form action={transitionJob}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="toStage" value={prev} />
          <button
            type="submit"
            className={
              compact
                ? `${btn} text-slate-600`
                : `${btn} border border-slate-300 text-slate-700 hover:bg-slate-100`
            }
          >
            ← Back to {STAGE_LABELS[prev]}
          </button>
        </form>
      ) : null}
    </div>
  );
}
