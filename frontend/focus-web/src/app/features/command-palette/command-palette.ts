import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { addDays, longDate, relativeDayName } from '../../core/dates';
import { fuzzyScore } from '../../core/fuzzy';
import { Task } from '../../core/models';
import { PetService } from '../../core/pet.service';
import { PlannerStore } from '../../core/planner.store';
import { PwaService } from '../../core/pwa.service';
import { parseQuickAdd } from '../../core/quick-add';
import { PALETTES, ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { TaskDialogs } from '../today/task-dialogs';

export interface PaletteItem {
  id: string;
  icon: string;
  label: string;
  /** Small tag on the right: a section name, keyboard shortcut or detail. */
  hint?: string;
  /** Extra words that should match, e.g. synonyms. */
  keywords?: string;
  /** Runs the item. Return 'stay' to keep the palette open (e.g. after drilling into a task). */
  run: () => void | 'stay' | Promise<void | 'stay'>;
}

type Mode = { kind: 'root' } | { kind: 'task'; task: Task } | { kind: 'add' };

/** Score given to "add a task" items, so strong matches (substrings) rank above them and weak ones below. */
const CREATE_SCORE = 60;
const MAX_TASKS = 8;

/**
 * Ctrl+K command palette: navigate, jump to days, find tasks and act on them, add tasks, toggle settings,
 * all from the keyboard.
 */
@Component({
  selector: 'app-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onStrayKey($event)' },
  template: `
    <div class="palette glass">
      <div class="search">
        @if (mode().kind !== 'root') {
          <button class="crumb" type="button" (click)="back()" title="Back (Backspace)">
            ‹ {{ crumb() }}
          </button>
        } @else {
          <span class="glyph" aria-hidden="true">⌘</span>
        }
        <input
          #input
          class="query"
          [value]="query()"
          (input)="setQuery($event)"
          (keydown)="onKey($event)"
          [placeholder]="placeholder()"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="palette-list"
          [attr.aria-activedescendant]="items().length ? 'palette-item-' + active() : null"
          autocomplete="off"
          spellcheck="false"
          maxlength="300"
        />
        <kbd class="esc">Esc</kbd>
      </div>

      <ul id="palette-list" class="list" role="listbox" #list>
        @for (item of items(); track item.id; let i = $index) {
          <li
            [id]="'palette-item-' + i"
            role="option"
            class="item"
            [class.active]="i === active()"
            [attr.aria-selected]="i === active()"
            (mousemove)="active.set(i)"
            (click)="runItem(item)"
          >
            <span class="icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="label">{{ item.label }}</span>
            @if (item.hint) {
              <span class="hint">{{ item.hint }}</span>
            }
          </li>
        } @empty {
          <li class="empty muted">No matches. Try another word.</li>
        }
      </ul>

      <div class="footer muted">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> run</span>
        @if (mode().kind !== 'root') {
          <span><kbd>⌫</kbd> back</span>
        } @else {
          <span>type to add a task</span>
        }
      </div>
    </div>
  `,
  styles: `
    .palette { width: 620px; max-width: 100%; overflow: hidden; background: var(--surface-strong); }
    .search { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--surface-border); }
    .glyph {
      display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 10px;
      color: #fff; background: var(--accent-grad); font-size: 15px;
    }
    .crumb {
      flex: none; max-width: 45%; height: 30px; padding: 0 10px; border: 0; border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--accent-2) 18%, transparent); color: var(--text); font-weight: 700; font-size: 13px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
    }
    .query { flex: 1; min-width: 0; height: 36px; border: 0; background: transparent; font-size: 17px; }
    .query:focus { outline: none; box-shadow: none; }
    .query::placeholder { color: var(--text-faint); }
    .esc { flex: none; }
    .list { list-style: none; margin: 0; padding: 6px; max-height: min(420px, 60dvh); overflow-y: auto; }
    .item {
      display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 12px; cursor: pointer;
      scroll-margin: 6px;
    }
    .item.active { background: color-mix(in srgb, var(--accent-2) 16%, var(--surface-hover)); }
    .icon { flex: none; width: 24px; text-align: center; font-size: 17px; }
    .label { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hint { flex: none; font-size: 12px; font-weight: 600; color: var(--text-muted); }
    .empty { padding: 18px 12px; text-align: center; }
    .footer {
      display: flex; gap: 16px; padding: 8px 16px; border-top: 1px solid var(--surface-border); font-size: 12px;
      kbd { margin-right: 2px; }
    }
    @media (max-width: 520px) {
      .esc, .footer { display: none; }
    }
  `,
})
export class CommandPalette {
  private readonly ref = inject(DialogRef);
  private readonly router = inject(Router);
  private readonly store = inject(PlannerStore);
  private readonly theme = inject(ThemeService);
  private readonly pet = inject(PetService);
  private readonly pwa = inject(PwaService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(TaskDialogs);

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

  protected readonly query = signal('');
  protected readonly mode = signal<Mode>({ kind: 'root' });
  protected readonly active = signal(0);

  protected readonly crumb = computed(() => {
    const m = this.mode();
    return m.kind === 'task' ? m.task.title : m.kind === 'add' ? 'New task' : '';
  });

  protected readonly placeholder = computed(() => {
    switch (this.mode().kind) {
      case 'task':
        return 'What should happen to this task?';
      case 'add':
        return 'Write report #work ~45m !high @fri';
      default:
        return 'Search commands and tasks, or type a new task…';
    }
  });

  /** The day "add" puts tasks on: the selected day, or today when looking at the past. */
  private readonly addDay = computed(() => (this.store.isPast() ? this.store.today() : this.store.selectedDate()));
  private readonly addDayName = computed(() => relativeDayName(this.addDay(), this.store.today()));

  protected readonly items = computed<PaletteItem[]>(() => {
    const mode = this.mode();
    const q = this.query().trim();
    if (mode.kind === 'task') return filter(this.taskActions(mode.task), q);
    if (mode.kind === 'add') return q ? this.createItems(q) : [];

    if (!q) return [...this.commands(), ...this.todaysTasks()];

    const ranked: { item: PaletteItem; score: number }[] = [];
    for (const item of this.commands()) {
      const score = fuzzyScore(q, `${item.label} ${item.keywords ?? ''}`);
      if (score !== null) ranked.push({ item, score });
    }
    const jump = this.dateJump(q);
    if (jump) ranked.push({ item: jump, score: 150 });
    ranked.push(...this.matchingTasks(q));
    ranked.push(...this.createItems(q).map((item, i) => ({ item, score: CREATE_SCORE - i })));
    return ranked.sort((a, b) => b.score - a.score).map((r) => r.item);
  });

  constructor() {
    // Keep the highlighted row in range and visible.
    effect(() => {
      const count = this.items().length;
      if (this.active() >= count) this.active.set(Math.max(0, count - 1));
    });
    effect(() => {
      const i = this.active();
      this.list().nativeElement.querySelector(`#palette-item-${i}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ---- Input & keyboard -------------------------------------------------------------------------

  protected setQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.active.set(0);
  }

  /**
   * The dialog moves focus into the palette a frame after opening. Characters typed in between (fast
   * typists right after Ctrl+K) would otherwise be lost, so they're added to the query here.
   */
  protected onStrayKey(e: KeyboardEvent): void {
    const input = this.input().nativeElement;
    if (e.target === input || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    this.query.update((q) => q + e.key);
    this.active.set(0);
    input.focus();
    queueMicrotask(() => input.setSelectionRange(input.value.length, input.value.length));
  }

  protected onKey(e: KeyboardEvent): void {
    const count = this.items().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (count) this.active.set((this.active() + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (count) this.active.set((this.active() - 1 + count) % count);
        break;
      case 'Enter': {
        e.preventDefault();
        // Shift+Enter adds the typed text to the backlog, like quick add on Today.
        const q = this.query().trim();
        if (e.shiftKey && q && this.mode().kind !== 'task') {
          void this.add(q, 'backlog');
          return;
        }
        const item = this.items()[this.active()];
        if (item) void this.runItem(item);
        break;
      }
      case 'Backspace':
        if (!this.query() && this.mode().kind !== 'root') {
          e.preventDefault();
          this.back();
        }
        break;
    }
  }

  protected back(): void {
    this.mode.set({ kind: 'root' });
    this.query.set('');
    this.active.set(0);
    this.input().nativeElement.focus();
  }

  protected async runItem(item: PaletteItem): Promise<void> {
    const result = await item.run();
    if (result === 'stay') {
      this.query.set('');
      this.active.set(0);
      this.input().nativeElement.focus();
    } else {
      this.ref.close();
    }
  }

  // ---- Item sources -----------------------------------------------------------------------------

  private commands(): PaletteItem[] {
    const s = this.store;
    const today = s.today();
    const focusCount = s.focusTasks().length;
    const themeNext = { auto: 'light', light: 'dark', dark: 'automatic' }[this.theme.mode()];
    const items: PaletteItem[] = [
      { id: 'new', icon: '＋', label: 'New task…', hint: 'N', keywords: 'add create todo', run: () => this.enter({ kind: 'add' }) },
      { id: 'go-today', icon: '🗓️', label: 'Go to Today', hint: 'T', keywords: 'home day plan', run: () => this.goToDay(today) },
      { id: 'go-tomorrow', icon: '🌅', label: 'Plan tomorrow', keywords: 'next day go', run: () => this.goToDay(addDays(today, 1)) },
      { id: 'go-yesterday', icon: '⏪', label: 'Look back at yesterday', keywords: 'previous day go', run: () => this.goToDay(addDays(today, -1)) },
      {
        id: 'focus',
        icon: '🎧',
        label: focusCount ? `Start focus (${focusCount} ${focusCount === 1 ? 'task' : 'tasks'})` : 'Open focus mode',
        keywords: 'timer pomodoro session lofi',
        run: () => void this.router.navigate(['/focus']),
      },
      {
        id: 'reflect',
        icon: '🌙',
        label: 'Reflect on today',
        hint: 'R',
        keywords: 'journal mood note end of day diary',
        run: async () => {
          await this.router.navigate(['/']);
          if (!s.isToday()) await s.selectDate(today);
          s.reflectRequested.set(true);
        },
      },
      { id: 'stats', icon: '📈', label: 'Go to Stats', keywords: 'progress charts streak heatmap', run: () => void this.router.navigate(['/stats']) },
      { id: 'theme', icon: '🌗', label: `Switch to ${themeNext} theme`, keywords: 'dark light mode appearance', run: () => this.theme.cycle() },
      ...PALETTES.filter((p) => p.id !== this.theme.palette()).map((p) => ({
        id: `palette-${p.id}`,
        icon: '🎨',
        label: `Colour theme: ${p.name}`,
        keywords: `theme colour color palette appearance ${p.description.toLowerCase()}`,
        run: () => this.theme.setPalette(p.id),
      })),
      {
        id: 'pet',
        icon: this.pet.kind() === 'dog' ? '🐱' : '🐶',
        label: `Switch companion to a ${this.pet.kind() === 'dog' ? 'cat' : 'dog'}`,
        keywords: 'pet dog cat mascot',
        run: () => this.pet.toggle(),
      },
    ];
    if (focusCount) {
      items.push({ id: 'focus-clear', icon: '⟲', label: 'Clear focus list', keywords: 'reset tray', run: () => s.clearFocus() });
    }
    if (this.pwa.canInstall()) {
      items.push({ id: 'install', icon: '⬇️', label: 'Install Focus as an app', keywords: 'pwa desktop download', run: () => void this.pwa.install() });
    }
    return items;
  }

  /** With an empty query: the open tasks of today, so you can act on them right away. */
  private todaysTasks(): PaletteItem[] {
    return (this.store.isToday() ? this.store.openTasks() : []).slice(0, 5).map((t) => this.taskItem(t, 'Today'));
  }

  private matchingTasks(q: string): { item: PaletteItem; score: number }[] {
    const seen = new Set<number>();
    const pool: { task: Task; where: string }[] = [];
    const dayName = relativeDayName(this.store.selectedDate(), this.store.today());
    for (const task of this.store.day()?.tasks ?? []) {
      seen.add(task.id);
      pool.push({ task, where: task.status === 'done' ? '✓ done' : dayName });
    }
    for (const task of this.store.backlog()) if (!seen.has(task.id)) pool.push({ task, where: 'Backlog' });

    return pool
      .map(({ task, where }) => ({ task, where, score: fuzzyScore(q, `${task.title} ${task.tag ? '#' + task.tag.name : ''}`) }))
      .filter((r): r is { task: Task; where: string; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TASKS)
      .map(({ task, where, score }) => ({ item: this.taskItem(task, where), score }));
  }

  private taskItem(task: Task, where: string): PaletteItem {
    return {
      id: `task-${task.id}`,
      icon: task.status === 'done' ? '✅' : '◻️',
      label: task.title,
      hint: where,
      run: () => this.enter({ kind: 'task', task }),
    };
  }

  private taskActions(task: Task): PaletteItem[] {
    const s = this.store;
    const open = task.status === 'open';
    const onToday = task.plannedDate === s.today();
    const items: PaletteItem[] = [];
    if (open) {
      items.push({ id: 'complete', icon: '✅', label: 'Mark as done', keywords: 'complete finish check', run: () => s.complete(task) });
    } else {
      items.push({ id: 'reopen', icon: '↩️', label: 'Mark as not done', keywords: 'reopen undo', run: () => s.reopen(task) });
    }
    items.push({ id: 'edit', icon: '✏️', label: 'Edit…', keywords: 'rename checklist notes estimate tag due', run: () => this.dialogs.editTask(task) });
    if (open && !onToday) {
      items.push({
        id: 'to-today',
        icon: '☀️',
        label: 'Move to today',
        keywords: 'plan schedule',
        run: async () => {
          if (!s.isToday()) await s.selectDate(s.today());
          await s.move(task, 'day', s.openTasks().length);
          this.toast.show(`Moved "${task.title}" to today`);
        },
      });
    }
    if (open && task.plannedDate) {
      items.push({
        id: 'to-backlog',
        icon: '📥',
        label: 'Back to backlog',
        keywords: 'later unplan',
        run: async () => {
          await s.move(task, 'backlog', 0);
          this.toast.show(`Moved "${task.title}" to the backlog`);
        },
      });
    }
    if (open && !s.focusIds().includes(task.id)) {
      items.push({
        id: 'focus',
        icon: '🎧',
        label: 'Add to focus',
        keywords: 'tray session',
        run: () => {
          s.addToFocus(task.id);
          this.toast.show(`"${task.title}" is ready for focus mode 🎧`);
        },
      });
    }
    if (task.templateId) {
      items.push({ id: 'untemplate', icon: '☆', label: 'Remove from templates', keywords: 'unstar template delete repeat stop', run: () => s.removeFromTemplates(task) });
    } else {
      items.push({ id: 'template', icon: '⭐', label: 'Save as template', keywords: 'reuse', run: () => s.saveAsTemplate(task) });
    }
    items.push({ id: 'delete', icon: '🗑️', label: 'Delete', keywords: 'remove', run: () => s.remove(task) });
    return items;
  }

  private createItems(text: string): PaletteItem[] {
    const label = text.length > 60 ? text.slice(0, 57) + '…' : text;
    return [
      { id: 'add-day', icon: '＋', label: `Add “${label}”`, hint: `to ${this.addDayName()}`, run: () => this.add(text, 'day') },
      { id: 'add-backlog', icon: '📥', label: `Add “${label}”`, hint: 'to backlog · Shift+Enter', run: () => this.add(text, 'backlog') },
    ];
  }

  /** "fri", "tomorrow", "24.12", "2026-12-24" → jump to that day. */
  private dateJump(q: string): PaletteItem | null {
    const token = q.replace(/^(go to|goto|jump to|open)\s+/i, '').trim();
    if (!token || token.includes(' ')) return null;
    const parsed = parseQuickAdd('@' + token.replace(/^@/, ''), this.store.today());
    const date = parsed.dueDate;
    if (!date || parsed.title || parsed.errors.length) return null;
    return {
      id: 'jump',
      icon: '📅',
      label: `Go to ${relativeDayName(date, this.store.today())}, ${longDate(date)}`,
      hint: 'Jump',
      run: () => this.goToDay(date),
    };
  }

  // ---- Actions ----------------------------------------------------------------------------------

  private enter(mode: Mode): 'stay' {
    this.mode.set(mode);
    return 'stay';
  }

  private async goToDay(date: string): Promise<void> {
    await this.router.navigate(['/']);
    await this.store.selectDate(date);
  }

  private async add(text: string, target: 'day' | 'backlog'): Promise<void> {
    const day = this.addDayName();
    const where = target === 'backlog' ? 'the backlog' : day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day;
    if (target === 'day' && this.store.isPast()) await this.store.selectDate(this.store.today());
    this.ref.close();
    const task = await this.store.quickAdd(text, target);
    if (task) this.toast.show(`Added "${task.title}" to ${where}`, 'success');
  }
}

function filter(items: PaletteItem[], q: string): PaletteItem[] {
  if (!q) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(q, `${item.label} ${item.keywords ?? ''}`) }))
    .filter((r): r is { item: PaletteItem; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
