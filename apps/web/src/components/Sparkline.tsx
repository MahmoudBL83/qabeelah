interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}

export default function Sparkline({ data, width = 140, height = 36, stroke = '#B58543', fill = 'rgba(181,133,67,0.12)' }: SparklineProps) {
  if (!data || data.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <rect width="100%" height="100%" fill="transparent" />
      </svg>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const len = data.length;
  const step = width / Math.max(1, len - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / (max - min || 1)) * height;
    return `${x},${y}`;
  }).join(' ');

  const areaPath = `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={areaPath} fill={fill} strokeOpacity={0} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / (max - min || 1)) * height;
        return <circle key={i} cx={x} cy={y} r={1.6} fill={stroke} />;
      })}
    </svg>
  );
}
