import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { parseIsoDate } from '../../core/dates';
import { fillRatio, progressLabel } from '../../core/habits';
import { Habit, HabitCellState, HabitHistory } from '../../core/models';
import { ThemeService } from '../../core/theme.service';
import { mix, tooltipStyle } from '../stats/chart-helpers';

const STATE_LABEL: Record<HabitCellState, string> = {
  notDue: 'Not scheduled',
  open: 'Not done yet',
  partial: 'Partly done',
  done: 'Done',
  skipped: 'Rest day',
  future: '',
  missed: 'Missed',
};

/** "Year in pixels" for one habit: the last 12 months as a calendar heatmap, plus totals. */
@Component({
  selector: 'app-habit-history',
  imports: [NgxEchartsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box glass">
      <header>
        <h2><span aria-hidden="true">{{ data.icon }}</span> {{ data.title }}</h2>
        <button class="icon-btn" type="button" (click)="ref.close()" aria-label="Close">✕</button>
      </header>
      @if (history(); as h) {
        <div class="facts">
          <div><strong>{{ h.row.total }}</strong><small>{{ totalLabel() }}</small></div>
          <div><strong>🔥 {{ h.row.currentStreak }}</strong><small>current streak</small></div>
          <div><strong>🏆 {{ h.row.bestStreak }}</strong><small>longest streak</small></div>
          <div><strong>{{ h.row.rate === null ? '–' : rate(h.row.rate) + '%' }}</strong><small>of due days done</small></div>
        </div>
        <div class="chart" echarts [options]="chart()" [autoResize]="true" role="img" [attr.aria-label]="'A year of ' + data.title"></div>
        <p class="legend muted">Darker = done · lighter = partly · pink = missed · dark grey = rest day · pale = not scheduled</p>
      } @else if (error()) {
        <p class="muted">{{ error() }}</p>
      } @else {
        <p class="muted">Loading…</p>
      }
    </div>
  `,
  styles: `
    .box { width: 860px; max-width: 100%; padding: 22px; background: var(--surface-strong); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    h2 { font-size: 20px; margin: 0; }
    .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0 8px; }
    .facts div { display: flex; flex-direction: column; padding: 10px 12px; border-radius: var(--radius); background: var(--surface); }
    .facts strong { font-size: 20px; }
    .facts small { color: var(--text-muted); font-weight: 600; }
    .chart { height: 170px; }
    .legend { font-size: 12px; margin: 4px 0 0; }
    @media (max-width: 640px) {
      .facts { grid-template-columns: repeat(2, 1fr); }
      .chart { height: 150px; overflow-x: auto; }
    }
  `,
})
export class HabitHistoryDialog {
  protected readonly data = inject<Habit>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly api = inject(Api);
  private readonly theme = inject(ThemeService);

  protected readonly history = signal<HabitHistory | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly totalLabel = computed(() => {
    const h = this.data;
    if (h.target === null) return h.kind === 'avoid' ? 'days clear' : 'times done';
    return `${h.unit ?? 'counted'} in total`;
  });

  protected readonly chart = computed<EChartsCoreOption>(() => {
    const h = this.history();
    const dark = this.theme.isDark();
    const { accent2, background } = this.theme.accents();
    const empty = dark ? 'rgba(181,171,211,0.08)' : 'rgba(111,100,133,0.08)';
    const missed = dark ? 'rgba(224,102,140,0.35)' : 'rgba(217,86,127,0.28)';
    const text = dark ? '#b5abd3' : '#6f6485';
    const habit = this.data;

    // Value: 0 = not scheduled, 1 = missed, 2 = rest day, 3..6 = partly → done.
    const data = (h?.row.cells ?? []).map((c) => {
      let v = 0;
      if (c.state === 'missed') v = 1;
      else if (c.state === 'skipped') v = 2;
      else if (c.state === 'partial' || c.state === 'open') v = 3 + Math.round(fillRatio(habit, c.count) * 2);
      else if (c.state === 'done') v = 6;
      return [c.date, v, c.count, c.state];
    });

    return {
      tooltip: {
        ...tooltipStyle(dark),
        formatter: (p: { value: [string, number, number, HabitCellState] }) => {
          const [date, , count, state] = p.value;
          const label = parseIsoDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
          const progress = habit.target !== null && state !== 'notDue' && state !== 'skipped' ? ` · ${progressLabel(habit, count)}` : '';
          return `<b>${label}</b><br/>${STATE_LABEL[state]}${progress}`;
        },
      },
      visualMap: {
        type: 'piecewise',
        show: false,
        dimension: 1,
        pieces: [
          { value: 0, color: empty },
          { value: 1, color: missed },
          { value: 2, color: dark ? '#4a4366' : '#ddd6ea' },
          { value: 3, color: mix(accent2, dark ? '#000000' : '#ffffff', 0.75) },
          { value: 4, color: mix(accent2, dark ? '#000000' : '#ffffff', 0.5) },
          { value: 5, color: mix(accent2, dark ? '#000000' : '#ffffff', 0.25) },
          { value: 6, color: accent2 },
        ],
      },
      calendar: {
        range: h ? [h.from, h.to] : undefined,
        top: 24,
        left: 30,
        right: 8,
        bottom: 4,
        cellSize: ['auto', 15],
        splitLine: { show: false },
        itemStyle: { color: empty, borderColor: dark ? background : '#ffffff', borderWidth: 3, borderRadius: 4 },
        yearLabel: { show: false },
        monthLabel: { color: text, nameMap: 'EN' },
        dayLabel: { color: text, firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }],
    };
  });

  constructor() {
    void firstValueFrom(this.api.habitHistory(this.data.id))
      .then((h) => this.history.set(h))
      .catch((err) => this.error.set(errorMessage(err)));
  }

  protected rate(r: number): number {
    return Math.round(r * 100);
  }
}
