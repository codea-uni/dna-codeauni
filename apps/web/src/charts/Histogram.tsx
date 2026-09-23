import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

export interface HistogramProps {
  /** Inicio de cada intervalo [ms]. */
  starts: number[];
  holes: number[];
  kg: number[];
  binMs: number;
}

/** Taladros y kg por intervalo de tiempo (el intervalo es la ventana de coincidencia). */
export default function Histogram({ starts, holes, kg, binMs }: HistogramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, 'dark', { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => {
      c.resize();
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(
      {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 36, right: 40, top: 16, bottom: 28 },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: unknown) =>
            typeof v === 'number' ? v.toFixed(v % 1 === 0 ? 0 : 1) : String(v),
        },
        xAxis: {
          type: 'category',
          data: starts.map((s) => `${s.toFixed(0)}–${(s + binMs).toFixed(0)} ms`),
          axisLabel: { formatter: (v: string) => v.split('–')[0] ?? v, color: '#8b949e' },
        },
        yAxis: [
          {
            type: 'value',
            name: 'taladros',
            minInterval: 1,
            axisLabel: { color: '#8b949e' },
            splitLine: { lineStyle: { color: '#21262d' } },
          },
          {
            type: 'value',
            name: 'kg',
            axisLabel: { color: '#8b949e' },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: 'Taladros',
            type: 'bar',
            data: holes,
            itemStyle: { color: '#58a6ff' },
            barCategoryGap: '10%',
          },
          {
            name: 'kg',
            type: 'bar',
            yAxisIndex: 1,
            data: kg,
            itemStyle: { color: '#ff7b39', opacity: 0.6 },
            barGap: '-100%',
          },
        ],
      },
      true,
    );
  }, [starts, holes, kg, binMs]);

  return <div ref={ref} className="chart" />;
}
