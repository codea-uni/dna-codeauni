import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import { formatNumber, t, useLocale } from '../i18n';

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
  const locale = useLocale((s) => s.locale);

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
            typeof v === 'number' ? formatNumber(v, v % 1 === 0 ? 0 : 1, locale) : String(v),
        },
        xAxis: {
          type: 'category',
          data: starts.map(
            (s) => `${formatNumber(s, 0, locale)}–${formatNumber(s + binMs, 0, locale)} ms`,
          ),
          axisLabel: { formatter: (v: string) => v.split('–')[0] ?? v, color: '#8b949e' },
        },
        yAxis: [
          {
            type: 'value',
            name: t('chart.holesAxis'),
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
            name: t('chart.holes'),
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
  }, [starts, holes, kg, binMs, locale]);

  return <div ref={ref} className="chart" />;
}
