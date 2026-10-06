import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';

type ChartPoint = {
  label: string;
  value: number;
};

type ChartSeries = {
  name: string;
  color: string;
  fill: string;
  points: ChartPoint[];
};

type TooltipState = {
  index: number;
  x: number;
  y: number;
} | null;

type LineChartCardProps = {
  title: string;
  subtitle?: string;
  series: ChartSeries[];
  height?: number;
};

const CHART_PADDING = { top: 18, right: 20, bottom: 42, left: 52 };
const GRID_LINES = 4;

const formatNumber = (value: number) => value.toLocaleString('ar-SA');

export default function LineChartCard({ title, subtitle, series, height = 260 }: LineChartCardProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const pointsCount = Math.max(...series.map((item) => item.points.length), 0);

  const chart = useMemo(() => {
    const width = 760;
    const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

    const allValues = series.flatMap((item) => item.points.map((point) => point.value));
    const minValue = Math.min(...allValues, 0);
    const maxValue = Math.max(...allValues, 1);
    const valueRange = Math.max(maxValue - minValue, 1);
    const step = pointsCount > 1 ? innerWidth / (pointsCount - 1) : 0;

    const normalizedSeries = series.map((item) => ({
      ...item,
      points: item.points.map((point, index) => {
        const x = CHART_PADDING.left + index * step;
        const y = CHART_PADDING.top + innerHeight - ((point.value - minValue) / valueRange) * innerHeight;
        return { ...point, x, y };
      })
    }));

    const gridTicks = Array.from({ length: GRID_LINES + 1 }, (_, index) => {
      const value = minValue + ((maxValue - minValue) * (GRID_LINES - index)) / GRID_LINES;
      const y = CHART_PADDING.top + (innerHeight * index) / GRID_LINES;
      return { value, y };
    });

    return {
      width,
      height,
      innerWidth,
      innerHeight,
      minValue,
      maxValue,
      step,
      series: normalizedSeries,
      gridTicks
    };
  }, [height, pointsCount, series]);

  const activeIndex = tooltip?.index ?? null;

  const activeItems = useMemo(() => {
    if (activeIndex === null) return [];
    return chart.series.map((item) => {
      const point = item.points[activeIndex];
      return point ? { ...point, name: item.name, color: item.color, fill: item.fill } : null;
    }).filter(Boolean) as Array<ChartPoint & { name: string; color: string; fill: string; x: number; y: number }>;
  }, [activeIndex, chart.series]);

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clampedX = Math.max(CHART_PADDING.left, Math.min(rect.width - CHART_PADDING.right, x));
    const index = pointsCount <= 1 ? 0 : Math.round((clampedX - CHART_PADDING.left) / chart.step);
    const nextIndex = Math.max(0, Math.min(pointsCount - 1, index));
    const point = chart.series[0]?.points[nextIndex];

    if (!point) return;

    setTooltip({
      index: nextIndex,
      x: point.x,
      y: point.y
    });
  };

  const handlePointerLeave = () => setTooltip(null);

  return (
    <div className=" border-surface-variant bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">{title}</p>
          {subtitle ? <p className="text-xs text-on-surface-variant mt-1">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
          {series.map((item) => (
            <span key={item.name} className="inline-flex items-center gap-1 rounded-full border border-surface-variant bg-surface-container-lowest px-2 py-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block h-auto w-full touch-none select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerMove}
        >
          <defs>
            {chart.series.map((item) => (
              <linearGradient key={item.name} id={`fill-${item.name.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.fill} stopOpacity="0.34" />
                <stop offset="100%" stopColor={item.fill} stopOpacity="0.02" />
              </linearGradient>
            ))}
            <filter id="chart-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.10" />
            </filter>
          </defs>

          {chart.gridTicks.map((tick, index) => (
            <g key={index}>
              <line
                x1={CHART_PADDING.left}
                y1={tick.y}
                x2={chart.width - CHART_PADDING.right}
                y2={tick.y}
                stroke="rgba(0,0,0,0.08)"
                strokeDasharray="4 4"
              />
              <text x={CHART_PADDING.left - 10} y={tick.y + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-on-surface-variant">
                {formatNumber(Math.round(tick.value))}
              </text>
            </g>
          ))}

          <line
            x1={CHART_PADDING.left}
            y1={chart.height - CHART_PADDING.bottom}
            x2={chart.width - CHART_PADDING.right}
            y2={chart.height - CHART_PADDING.bottom}
            stroke="currentColor"
            strokeOpacity="0.25"
          />
          <line
            x1={CHART_PADDING.left}
            y1={CHART_PADDING.top}
            x2={CHART_PADDING.left}
            y2={chart.height - CHART_PADDING.bottom}
            stroke="currentColor"
            strokeOpacity="0.25"
          />

          {chart.series.map((item) => {
            const path = item.points
              .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
              .join(' ');

            const areaPath = `${path} L ${item.points[item.points.length - 1]?.x ?? CHART_PADDING.left} ${chart.height - CHART_PADDING.bottom} L ${item.points[0]?.x ?? CHART_PADDING.left} ${chart.height - CHART_PADDING.bottom} Z`;

            return (
              <g key={item.name}>
                <path d={areaPath} fill={`url(#fill-${item.name.replace(/\s+/g, '-')})`} stroke="none" />
                <path d={path} fill="none" stroke={item.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" filter="url(#chart-shadow)" />
                {item.points.map((point, index) => (
                  <circle key={`${item.name}-${index}`} cx={point.x} cy={point.y} r={tooltip?.index === index ? 5 : 3.2} fill={item.color} stroke="#fff" strokeWidth="2" />
                ))}
              </g>
            );
          })}

          {activeIndex !== null && activeItems.length > 0 && (
            <g>
              <line
                x1={activeItems[0].x}
                y1={CHART_PADDING.top}
                x2={activeItems[0].x}
                y2={chart.height - CHART_PADDING.bottom}
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeDasharray="5 5"
              />
              {activeItems.map((item) => (
                <circle key={item.name} cx={item.x} cy={item.y} r={6.5} fill="#fff" stroke={item.color} strokeWidth="3" />
              ))}
            </g>
          )}

          {chart.series[0]?.points.map((point, index) => (
            <text key={`x-${index}`} x={point.x} y={chart.height - 16} textAnchor="middle" fontSize="11" fill="currentColor" className="text-on-surface-variant">
              {point.label}
            </text>
          ))}
        </svg>

        {tooltip && activeItems.length > 0 && (
          <div
            className="pointer-events-none absolute z-10 rounded-2xl border border-surface-variant bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(tooltip.x + 14, 8), 520),
              top: Math.max(tooltip.y - 18, 12),
              transform: 'translateY(-100%)'
            }}
          >
            <div className="font-bold text-on-surface">{chart.series[0]?.points[tooltip.index]?.label}</div>
            <div className="mt-1 space-y-1">
              {activeItems.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-on-surface-variant">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}:</span>
                  <span className="font-bold text-on-surface">{formatNumber(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}