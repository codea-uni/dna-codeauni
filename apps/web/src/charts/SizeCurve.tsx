import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import type { FragmentationResult } from '@blastlab/core';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

/** Curva granulométrica: % pasante vs tamaño [cm], eje log. Rosin-Rammler y Swebrec. */
export default function SizeCurve({ result }: { result: FragmentationResult }) {
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
    const cm = (m: number) => Number((m * 100).toPrecision(4));
    const series = (key: 'rosinRammler' | 'swebrec') =>
      result.curve.map((p) => [cm(p.size), Number((p[key] * 100).toFixed(2))]);
    chart.current?.setOption(
      {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 40, right: 14, top: 30, bottom: 34 },
        legend: { top: 0, textStyle: { color: '#c9d1d9', fontSize: 11 }, itemHeight: 8 },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)} %` : String(v)),
        },
        xAxis: {
          type: 'log',
          name: 'cm',
          nameGap: 4,
          min: 0.1,
          axisLabel: { color: '#8b949e' },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { color: '#8b949e', formatter: '{value} %' },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        series: [
          {
            name: 'Swebrec (KCO)',
            type: 'line',
            showSymbol: false,
            data: series('swebrec'),
            lineStyle: { width: 2, color: '#ff7b39' },
            itemStyle: { color: '#ff7b39' },
            markLine: {
              symbol: 'none',
              label: { color: '#8b949e', fontSize: 10, formatter: '{b}' },
              lineStyle: { color: '#8b949e', type: 'dashed' },
              data: [
                { name: 'P80', yAxis: 80 },
                { name: 'P50', yAxis: 50 },
              ],
            },
          },
          {
            name: 'Rosin-Rammler',
            type: 'line',
            showSymbol: false,
            data: series('rosinRammler'),
            lineStyle: { width: 1.5, color: '#58a6ff', type: 'dashed' },
            itemStyle: { color: '#58a6ff' },
          },
        ],
      },
      true,
    );
  }, [result]);

  return <div ref={ref} className="chart tall" />;
}
