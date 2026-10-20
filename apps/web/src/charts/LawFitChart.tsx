import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import type { VibrationFit } from '@cronos/core';
import { formatNumber, useLocale, useT } from '../i18n';

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

/**
 * Calibración de la ley de vibración en log-log: mediciones (PPV vs distancia escalada), recta de
 * la mediana (50 %) y envolvente al 95 %.
 */
export default function LawFitChart({ fit }: { fit: VibrationFit }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const locale = useLocale((s) => s.locale);
  const t = useT();

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
    const mm = (v: number) => Number((v * 1000).toPrecision(4));
    // Las rectas cubren el rango de los datos y un poco más (extrapolar se ve punteado aparte).
    const lo = fit.sdMin / 1.5;
    const hi = fit.sdMax * 1.5;
    const line = (k: number) =>
      [lo, hi].map((sd) => [Number(sd.toPrecision(4)), mm(k * Math.pow(sd, -fit.beta))]);
    chart.current?.setOption(
      {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 46, right: 14, top: 30, bottom: 36 },
        legend: { top: 0, textStyle: { color: '#c9d1d9', fontSize: 11 }, itemHeight: 8 },
        tooltip: {
          trigger: 'item',
          formatter: (p: { value: [number, number] }) =>
            `SD ${formatNumber(p.value[0], 1, locale)} · ${formatNumber(p.value[1], 1, locale)} mm/s`,
        },
        xAxis: {
          type: 'log',
          name: fit.scaling === 'square-root' ? 'R/√W' : 'R/∛W',
          nameLocation: 'middle',
          nameGap: 22,
          min: lo,
          max: hi,
          axisLabel: { color: '#8b949e' },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        yAxis: {
          type: 'log',
          name: 'mm/s',
          nameGap: 8,
          axisLabel: { color: '#8b949e' },
          splitLine: { lineStyle: { color: '#21262d' } },
        },
        series: [
          {
            name: t('mv.chart.records'),
            type: 'scatter',
            symbolSize: 6,
            data: fit.points.map((p) => [Number(p.sd.toPrecision(4)), mm(p.ppv)]),
            itemStyle: { color: '#c9d1d9' },
          },
          {
            name: '50 %',
            type: 'line',
            showSymbol: false,
            data: line(fit.k),
            lineStyle: { width: 2, color: '#58a6ff' },
            itemStyle: { color: '#58a6ff' },
          },
          {
            name: '95 %',
            type: 'line',
            showSymbol: false,
            data: line(fit.k95),
            lineStyle: { width: 2, color: '#ff7b39', type: 'dashed' },
            itemStyle: { color: '#ff7b39' },
          },
        ],
      },
      true,
    );
  }, [fit, locale, t]);

  return <div ref={ref} className="chart tall" />;
}
