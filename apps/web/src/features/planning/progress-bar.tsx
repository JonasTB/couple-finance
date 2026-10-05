/** A 0–100% progress bar (single series, primary hue); the label carries the value. */
export function ProgressBar({ bps, label }: { bps: number; label: string }) {
  const percent = Math.min(Math.max(bps, 0), 10000) / 100;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="block h-2.5 rounded-sm bg-muted"
    >
      <span
        className="block h-full rounded-r bg-primary"
        style={{ width: `${String(percent)}%` }}
      />
    </span>
  );
}
