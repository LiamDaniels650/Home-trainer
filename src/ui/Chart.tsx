import { useEffect, useRef } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { fmtDuration } from './format';

interface Props { title: string; x: number[]; y: (number | null)[]; color: string; unit: string }

const axis = { stroke: '#8b93a3', grid: { stroke: '#2a303c', width: 1 }, ticks: { stroke: '#2a303c' } };

export function Chart({ title, x, y, color, unit }: Props) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const width = el.current.clientWidth;
    const plot = new uPlot({
      width, height: 150, legend: { show: false }, cursor: { drag: { x: false, y: false } },
      scales: { x: { time: false } },
      axes: [
        { ...axis, values: (_u, vals) => vals.map((v) => fmtDuration(v)) },
        { ...axis, size: 50 },
      ],
      series: [{}, { stroke: color, width: 2, fill: color + '22', spanGaps: false, points: { show: false } }],
    }, [x, y as number[]], el.current);
    const onResize = () => plot.setSize({ width: el.current!.clientWidth, height: 150 });
    addEventListener('resize', onResize);
    return () => { removeEventListener('resize', onResize); plot.destroy(); };
  }, [x, y]);
  return (
    <div class="card">
      <div class="small muted">{title} <span>({unit})</span></div>
      <div ref={el} />
    </div>
  );
}
