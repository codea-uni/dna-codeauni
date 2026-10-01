import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import type { MuckpileProfile } from '@cronos/core';
import { formatNumber, t, useLocale } from '../i18n';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);

/**
 * Perfil de la pila en una sección (A7): superficie antes y después de la voladura y terreno
 * fijo, con la cota del throw (del material in situ al pie de la pila) y la mayor bajada (drop).
 * `toUi` convierte metros a la unidad de longitud de la interfaz.
 */
export default function ProfileChart({
  profile,
  toUi,
  unit,
}: {
  profile: MuckpileProfile;
  toUi: (m: number) => number;
  unit: string;
}) {
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
    const p = profile;
    const round = (v: number) => Number(toUi(v).toFixed(2));
    const series = (z: Float64Array) =>
      Array.from(p.s, (s, i) => {
        const v = z[i] ?? NaN;
        return [round(s), Number.isFinite(v) ? round(v) : null];
      });
    const f = (v: number) => formatNumber(toUi(v), 1, locale);
    const marks: { xAxis: number; label: { formatter: string } }[] = [];
    if (Number.isFinite(p.throw.value))
      marks.push(
        { xAxis: round(p.throw.from), label: { formatter: t('muckpile.chart.face') } },
        {
          xAxis: round(p.throw.to),
          label: { formatter: t('muckpile.chart.throw', { v: f(p.throw.value), unit }) },
        },
      );
    if (Number.isFinite(p.maxDrop.value) && p.maxDrop.value > 0)
      marks.push({
        xAxis: round(p.maxDrop.s),
        label: { formatter: t('muckpile.chart.drop', { v: f(p.maxDrop.value), unit }) },
      });
    chart.current?.setOption(
      {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 52, right: 16, top: 34, bottom: 34 },
        legend: { top: 0, right: 0, textStyle: { color: '#c9d1d9', fontSize: 11 }, itemHeight: 8 },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: unknown) =>
            typeof v === 'number' ? `${formatNumber(v, 2, locale)} ${unit}` : '—',
        },
        xAxis: {
          type: 'value',
          name: t('muckpile.chart.distance', { unit }),
          nameLocation: 'middle',
          nameGap: 22,
          min: 0,
          max: round(p.length),
          axisLabel: { color: '#8b949e' },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        yAxis: {
          type: 'value',
          name: t('muckpile.chart.elevation', { unit }),
          nameLocation: 'middle',
          nameGap: 40,
          scale: true,
          axisLabel: { color: '#8b949e' },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        series: [
          {
            name: t('muckpile.chart.base'),
            type: 'line',
            showSymbol: false,
            data: series(p.base),
            lineStyle: { color: '#6e7681', width: 1, type: 'dashed' },
            itemStyle: { color: '#6e7681' },
          },
          {
            name: t('muckpile.chart.before'),
            type: 'line',
            showSymbol: false,
            data: series(p.before),
            lineStyle: { color: '#8ab4f8', width: 1.5 },
            itemStyle: { color: '#8ab4f8' },
          },
          {
            name: t('muckpile.chart.after'),
            type: 'line',
            showSymbol: false,
            data: series(p.after),
            areaStyle: { color: 'rgba(210, 153, 34, 0.25)', origin: 'start' },
            lineStyle: { color: '#d29922', width: 2 },
            itemStyle: { color: '#d29922' },
            markLine: {
              symbol: 'none',
              lineStyle: { color: '#f0f6fc', type: 'dotted' },
              label: { color: '#f0f6fc', fontSize: 10, position: 'insideEndTop' },
              data: marks,
            },
          },
        ],
      },
      true,
    );
  }, [profile, locale, toUi, unit]);

  return <div ref={ref} className="chart" style={{ height: 230 }} />;
}
