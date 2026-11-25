import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { addDays, formatMinutes, parseIsoDate, todayIso } from '../../core/dates';
import { StatsInsights, StatsSummary } from '../../core/models';
import { ThemeService } from '../../core/theme.service';
import { ProgressRing } from '../../shared/progress-ring';

type Range = 7 | 30;

/** Chart colors, validated for colorblind separation and contrast against each mode's surface. */
const PALETTE = {
  light: { done: '#7c5cff', planned: '#d9567f', text: '#6f6485', grid: 'rgba(111,100,133,0.15)', empty: 'rgba(111,100,133,0.10)', ramp: ['#e4dcff', '#b9a6ff', '#8f74ff', '#6a48e6', '#4a2cb3'] },
  dark: { done: '#8f74ff', planned: '#e0668c', text: '#b5abd3', grid: 'rgba(181,171,211,0.14)', empty: 'rgba(181,171,211,0.08)', ramp: ['#2f2766', '#4b3a9e', '#6c55d6', '#9583ff', '#c4b8ff'] },
};

const HEATMAP_WEEKS = 26;

@Component({
  selector: 'app-stats-page',
  imports: [NgxEchartsDirective, ProgressRing],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsPage {
  private readonly api = inject(Api);
  private readonly theme = inject(ThemeService);

  protected readonly range = signal<Range>(7);
  protected readonly summary = signal<StatsSummary | null>(null);
  protected readonly year = signal<StatsSummary | null>(null);
  protected readonly insights = signal<StatsInsights | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly showTable = signal(false);

  private readonly colors = computed(() => (this.theme.isDark() ? PALETTE.dark : PALETTE.light));

  protected readonly todayStat = computed(() => this.year()?.days.at(-1) ?? null);
  protected readonly todayRate = computed(() => {
    const t = this.todayStat();
    return t?.planned ? t.done / t.planned : 0;
  });
  protected readonly ratePercent = computed(() => Math.round((this.summary()?.totals.completionRate ?? 0) * 100));
  protected readonly focusLabel = computed(() => formatMinutes(this.summary()?.totals.focusMinutes) || '0m');
  protected readonly hasAnyData = computed(() => (this.year()?.days ?? []).some((d) => d.planned > 0 || d.focusMinutes > 0));
  protected readonly fmt = formatMinutes;

  protected readonly dailyChart = computed<EChartsCoreOption | null>(() => {
    const s = this.summary();
    if (!s) return null;
    const c = this.colors();
    const labels = s.days.map((d) => axisLabel(d.date, s.days.length));
    const bar = (name: string, color: string, data: number[]) => ({
      name,
      type: 'bar',
      data,
      barMaxWidth: 18,
      barGap: '20%',
      itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      emphasis: { focus: 'none', itemStyle: { opacity: 0.85 } },
      animationDelay: (i: number) => i * 30,
    });
    return {
      animationEasing: 'cubicOut',
      grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: c.text, fontWeight: 600 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: c.grid } }, ...tooltipStyle(this.theme.isDark()) },
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.text } },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.text } },
      series: [bar('Planned', c.planned, s.days.map((d) => d.planned)), bar('Done', c.done, s.days.map((d) => d.done))],
    };
  });

  protected readonly focusChart = computed<EChartsCoreOption | null>(() => {
    const s = this.summary();
    if (!s) return null;
    const c = this.colors();
    return {
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: c.grid } },
        valueFormatter: (v: number) => formatMinutes(v) || '0m',
        ...tooltipStyle(this.theme.isDark()),
      },
      xAxis: { type: 'category', data: s.days.map((d) => axisLabel(d.date, s.days.length)), axisTick: { show: false }, axisLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.text } },
      yAxis: { type: 'value', minInterval: 5, splitLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.text, formatter: (v: number) => `${v}m` } },
      series: [
        {
          name: 'Focus',
          type: 'bar',
          data: s.days.map((d) => d.focusMinutes),
          barMaxWidth: 18,
          itemStyle: { color: c.done, borderRadius: [4, 4, 0, 0] },
          animationDelay: (i: number) => i * 30,
        },
      ],
    };
  });

  protected readonly heatmap = computed<EChartsCoreOption | null>(() => {
    const y = this.year();
    if (!y) return null;
    const c = this.colors();
    const data = y.days.map((d) => [d.date, d.planned ? Math.round((d.done / d.planned) * 100) : null, d.done, d.planned]);
    return {
      tooltip: {
        ...tooltipStyle(this.theme.isDark()),
        formatter: (p: { value: [string, number | null, number, number] }) => {
          const [date, rate, done, planned] = p.value;
          const label = parseIsoDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return planned ? `<b>${label}</b><br/>${done} of ${planned} done (${rate}%)` : `<b>${label}</b><br/>Nothing planned`;
        },
      },
      visualMap: {
        type: 'piecewise',
        show: false,
        dimension: 1,
        pieces: [
          { min: 0, max: 24, color: c.ramp[0] },
          { min: 25, max: 49, color: c.ramp[1] },
          { min: 50, max: 74, color: c.ramp[2] },
          { min: 75, max: 99, color: c.ramp[3] },
          { min: 100, max: 100, color: c.ramp[4] },
        ],
        outOfRange: { color: c.empty },
      },
      calendar: {
        range: [y.from, y.to],
        top: 24,
        left: 34,
        right: 8,
        bottom: 4,
        cellSize: ['auto', 15],
        splitLine: { show: false },
        itemStyle: { color: c.empty, borderColor: this.theme.isDark() ? '#1b1638' : '#ffffff', borderWidth: 3, borderRadius: 4 },
        yearLabel: { show: false },
        monthLabel: { color: c.text, nameMap: 'EN' },
        dayLabel: { color: c.text, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: data.map((d) => [d[0], d[1] ?? -1, d[2], d[3]]) }],
    };
  });

  constructor() {
    void this.loadAllTime();
    effect(() => void this.loadRange(this.range()));
  }

  private async loadRange(range: Range): Promise<void> {
    const to = todayIso();
    try {
      this.summary.set(await firstValueFrom(this.api.statsSummary(addDays(to, -(range - 1)), to)));
      this.error.set(null);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  private async loadAllTime(): Promise<void> {
    const to = todayIso();
    try {
      const [year, insights] = await Promise.all([
        firstValueFrom(this.api.statsSummary(addDays(to, -(HEATMAP_WEEKS * 7 - 1)), to)),
        firstValueFrom(this.api.statsInsights()),
      ]);
      this.year.set(year);
      this.insights.set(insights);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  protected weekdayName(day: string): string {
    return day.charAt(0).toUpperCase() + day.slice(1);
  }

  protected rowDate(iso: string): string {
    return parseIsoDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function axisLabel(iso: string, count: number): string {
  const d = parseIsoDate(iso);
  return count <= 7 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : `${d.getDate()}.${d.getMonth() + 1}.`;
}

function tooltipStyle(dark: boolean) {
  return {
    backgroundColor: dark ? 'rgba(44,37,84,0.95)' : 'rgba(255,255,255,0.96)',
    borderColor: 'transparent',
    textStyle: { color: dark ? '#f2eefe' : '#2d2340' },
    extraCssText: 'border-radius:12px;box-shadow:0 10px 30px -12px rgba(60,30,90,.45);',
  };
}
