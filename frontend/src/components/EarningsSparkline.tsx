/**
 * EarningsSparkline — a pure-SVG 30-day earnings chart for the agent
 * passport. No chart library (recharts/d3/etc) on purpose — the passport
 * page is server-rendered and we don't want to ship ~40kb of client
 * bundle for what is effectively a polyline with a gradient fill.
 *
 * The component is intentionally agnostic about data source: pass in the
 * daily buckets from `fetchAgentDailyEarnings` and it renders. Empty data
 * is handled with a flat-line placeholder so the layout doesn't collapse
 * for brand-new agents.
 */

type DailyBucket = {
  date: string;
  ethEarned: number;
  tasksPaid: number;
};

type EarningsSparklineProps = {
  buckets: DailyBucket[];
  /**
   * Height of the drawn chart area in pixels. The SVG viewBox is fixed so
   * this value controls both render size and aspect ratio via width.
   */
  height?: number;
  width?: number;
  /** Hex color for the line + gradient. Defaults to emerald. */
  color?: string;
};

function formatEthShort(value: number): string {
  if (value === 0) return '0';
  if (value < 0.001) return value.toFixed(4);
  if (value < 1) return value.toFixed(3);
  if (value < 10) return value.toFixed(2);
  return value.toFixed(1);
}

export function EarningsSparkline({
  buckets,
  height = 80,
  width = 600,
  color = '#34d399',
}: EarningsSparklineProps) {
  const totalEth = buckets.reduce((sum, bucket) => sum + bucket.ethEarned, 0);
  const totalPaid = buckets.reduce((sum, bucket) => sum + bucket.tasksPaid, 0);
  const maxValue = buckets.reduce((max, bucket) => Math.max(max, bucket.ethEarned), 0);
  const activeDays = buckets.filter((bucket) => bucket.ethEarned > 0).length;

  // Pad the viewBox horizontally so the stroke at x=0/x=max isn't clipped.
  const padX = 2;
  const padY = 4;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;

  // If every bucket is zero, render a flat line at the bottom so the chart
  // area still has structure instead of an empty white rectangle.
  const points = buckets.map((bucket, index) => {
    const x = padX + (buckets.length === 1 ? 0 : (index / (buckets.length - 1)) * chartWidth);
    const y =
      maxValue === 0
        ? padY + chartHeight
        : padY + chartHeight - (bucket.ethEarned / maxValue) * chartHeight;
    return { x, y };
  });

  const pathD = points.length === 0
    ? ''
    : points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(' ');

  // Close the path to the x-axis to fill under the line.
  const fillD = points.length === 0
    ? ''
    : `${pathD} L${(padX + chartWidth).toFixed(2)},${(padY + chartHeight).toFixed(2)} L${padX.toFixed(2)},${(padY + chartHeight).toFixed(2)} Z`;

  const gradientId = `spark-gradient-${color.replace('#', '')}`;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
            30-day earnings
          </p>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-2xl text-white">
            {formatEthShort(totalEth)} <span className="text-sm text-white/40">ETH</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">
            Paid tasks
          </p>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-2xl text-white">
            {totalPaid}
            <span className="ml-2 text-xs text-white/40">
              {activeDays}d active
            </span>
          </p>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Agent earnings over the last ${buckets.length} days, totaling ${formatEthShort(totalEth)} ETH`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 0 && (
          <>
            <path d={fillD} fill={`url(#${gradientId})`} />
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={maxValue === 0 ? 0.3 : 1}
            />
          </>
        )}
      </svg>
      {/* Bucket dots for days with non-zero activity — only rendered when
          there's actually something to highlight so we don't clutter the
          sparkline of an agent with a single lucky payout. */}
      {maxValue > 0 && activeDays <= 8 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="-mt-[80px] pointer-events-none"
          style={{ marginTop: `-${height}px` }}
        >
          {points.map((point, index) => {
            const bucket = buckets[index];
            if (!bucket || bucket.ethEarned <= 0) return null;
            return (
              <circle
                key={bucket.date}
                cx={point.x}
                cy={point.y}
                r={2}
                fill={color}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
