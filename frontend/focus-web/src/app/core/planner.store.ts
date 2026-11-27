import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Api, errorMessage } from './api';
import { CelebrateService } from './celebrate.service';
import { addDays, todayIso } from './dates';
import { Day, DayNote, IsoDate, Mood, RolloverResult, Subtask, Tag, Task, TaskInput, Template, TemplateInput } from './models';
import { ToastService } from './toast.service';
import { parseQuickAdd } from './quick-add';
import { describeRepeat, lowerFirst, sameRepeat } from './recurrence';

const RITUAL_KEY = 'focus.ritualShownOn';
const FOCUS_KEY = 'focus.selection';

/**
 * State for planning: the selected day, the backlog, templates, tags and the tasks picked for Focus Mode.
 * Mutations update local state first (so drag & drop feels instant), call the API, then re-sync from the server.
 */
@Injectable({ providedIn: 'root' })
export class PlannerStore {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly celebrate = inject(CelebrateService);

  readonly today = signal(todayIso());
  readonly selectedDate = signal(todayIso());
  readonly day = signal<Day | null>(null);
  readonly backlog = signal<Task[]>([]);
  readonly templates = signal<Template[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly ritual = signal<RolloverResult | null>(null);
  readonly loaded = signal(false);
  readonly offline = signal(false);
  /** Set to ask the reflection card on Today to open and focus (e.g. from the command palette); the card clears it. */
  readonly reflectRequested = signal(false);

  /** Task ids dropped into the focus zone, in order. */
  readonly focusIds = signal<number[]>(readFocusIds());

  readonly openTasks = computed(() => this.day()?.tasks.filter((t) => t.status === 'open') ?? []);
  readonly doneTasks = computed(() => this.day()?.tasks.filter((t) => t.status === 'done') ?? []);
  readonly isPast = computed(() => this.selectedDate() < this.today());
  readonly isToday = computed(() => this.selectedDate() === this.today());
  readonly isFuture = computed(() => this.selectedDate() > this.today());
  readonly progress = computed(() => {
    const d = this.day();
    return d && d.planned ? d.done / d.planned : 0;
  });

  /** Tasks picked for focus that still exist and are open, resolved from today + backlog. */
  readonly focusTasks = computed(() => {
    const pool = new Map<number, Task>();
    for (const t of [...this.backlog(), ...(this.isToday() ? (this.day()?.tasks ?? []) : [])]) pool.set(t.id, t);
    return this.focusIds()
      .map((id) => pool.get(id))
      .filter((t): t is Task => !!t && t.status === 'open');
  });

  private dayRequest = 0;

  /** App start: send yesterday's leftovers back to the backlog, then load everything. */
  async init(): Promise<void> {
    // Without a network the rollover can't run; cached reads (service worker) still load below.
    if (!navigator.onLine) {
      await Promise.all([this.refresh(), this.loadTemplates(), this.loadTags()]).catch(() => undefined);
      this.loaded.set(true);
      return;
    }
    try {
      const result = await firstValueFrom(this.api.rollover());
      this.offline.set(false);
      if (result.previousDay && localGet(RITUAL_KEY) !== this.today()) {
        this.ritual.set(result);
      }
    } catch (err) {
      this.offline.set(true);
      this.toast.error(errorMessage(err));
    }
    await Promise.all([this.refresh(), this.loadTemplates(), this.loadTags()]);
    this.loaded.set(true);
  }

  /** Re-checks the calendar date (e.g. after midnight or when the app comes back to the foreground). */
  async checkNewDay(): Promise<void> {
    const now = todayIso();
    if (now === this.today()) return;
    const wasOnToday = this.isToday();
    this.today.set(now);
    if (wasOnToday) this.selectedDate.set(now);
    await this.init();
  }

  dismissRitual(): void {
    localSet(RITUAL_KEY, this.today());
    this.ritual.set(null);
  }

  async selectDate(date: IsoDate): Promise<void> {
    this.selectedDate.set(date);
    await this.loadDay();
  }

  shiftDay(delta: number): Promise<void> {
    return this.selectDate(addDays(this.selectedDate(), delta));
  }

  async refresh(): Promise<void> {
    await Promise.all([this.loadDay(), this.loadBacklog()]);
  }

  async loadDay(): Promise<void> {
    const request = ++this.dayRequest;
    const date = this.selectedDate();
    try {
      const day = await firstValueFrom(this.api.day(date));
      if (request === this.dayRequest) this.day.set(day); // ignore stale responses when clicking through days quickly
      this.offline.set(false);
    } catch (err) {
      this.offline.set(true);
      throw err;
    }
  }

  async loadBacklog(): Promise<void> {
    this.backlog.set(await firstValueFrom(this.api.backlog()));
  }

  async loadTemplates(): Promise<void> {
    this.templates.set(await firstValueFrom(this.api.templates()));
  }

  async loadTags(): Promise<void> {
    this.tags.set(await firstValueFrom(this.api.tags()));
  }

  // ---- Task actions -------------------------------------------------------------------------

  async quickAdd(text: string, target: 'day' | 'backlog'): Promise<Task | null> {
    const { errors } = parseQuickAdd(text);
    if (errors.length) {
      this.toast.error(errors[0]);
      return null;
    }
    const date = target === 'day' && !this.isPast() ? this.selectedDate() : null;
    const task = await this.run(this.api.quickAdd(text, date));
    if (task) {
      if (task.tag && !this.tags().some((t) => t.id === task.tag!.id)) void this.loadTags();
      await this.refresh();
    }
    return task;
  }

  /**
   * Moves a task to the selected day or the backlog at an index among that list's open tasks.
   * Local lists are updated immediately; the server response re-syncs them.
   */
  async move(task: Task, target: 'day' | 'backlog', index: number): Promise<void> {
    const date = target === 'day' ? this.selectedDate() : null;
    this.applyLocalMove(task, target, index);
    await this.run(this.api.move(task.id, date, index));
    await this.refresh();
  }

  async complete(task: Task, origin?: { x: number; y: number }): Promise<void> {
    const before = this.day();
    this.patchLocal(task.id, { status: 'done', completedAt: new Date().toISOString() });
    this.celebrate.taskDone(origin);

    const result = await this.run(this.api.complete(task.id));
    if (!result) return this.refresh();
    await this.refresh();

    const after = this.day();
    const viewingToday = after?.date === this.today();
    if (viewingToday && after.planned > 0 && after.done === after.planned && before && before.done < before.planned) {
      setTimeout(() => this.celebrate.big(), 300);
      this.toast.show('Everything you planned today is done. Amazing! 🎉', 'success');
    }
  }

  /**
   * Morning recap: records a task returned by the rollover as done on the previous day (the user forgot to tick it off).
   * Returns false on failure.
   */
  async completeOnPreviousDay(task: Task): Promise<boolean> {
    const prev = this.ritual()?.previousDay;
    if (!prev) return false;
    const result = await this.run(this.api.complete(task.id, prev.date));
    if (!result) return false;
    this.ritual.update((r) =>
      r?.previousDay ? { ...r, previousDay: { ...r.previousDay, done: r.previousDay.done + 1 } } : r,
    );
    this.backlog.update((list) => list.filter((t) => t.id !== task.id));
    this.removeFromFocus(task.id);
    await this.refresh();
    return true;
  }

  async reopen(task: Task): Promise<void> {
    this.patchLocal(task.id, { status: 'open', completedAt: null });
    await this.run(this.api.reopen(task.id));
    await this.refresh();
  }

  async update(task: Task, input: TaskInput): Promise<void> {
    const { repeat, ...fields } = input;
    if (!(await this.run(this.api.updateTask(task.id, fields)))) return;

    // The repeat rule lives on the task's series (a template), so it's saved separately and only when changed.
    if (repeat !== undefined && !sameRepeat(repeat, task.repeat)) {
      const updated = await this.run(this.api.setRepeat(task.id, repeat));
      if (updated?.repeat) {
        const moved = updated.plannedDate === this.today() && task.plannedDate !== this.today();
        this.toast.show(
          `🔁 "${updated.title}" repeats ${lowerFirst(describeRepeat(updated.repeat))}${moved ? ', starting today' : ''}.`,
          'success',
        );
      }
      await this.loadTemplates();
    }
    await this.refresh();
  }

  async remove(task: Task): Promise<void> {
    this.day.update((d) => (d ? { ...d, tasks: d.tasks.filter((t) => t.id !== task.id) } : d));
    this.backlog.update((list) => list.filter((t) => t.id !== task.id));
    this.removeFromFocus(task.id);
    await this.run(this.api.deleteTask(task.id));
    await this.refresh();
    this.toast.show(`Deleted "${task.title}"`);
  }

  // ---- Checklist ----------------------------------------------------------------------------

  async toggleSubtask(task: Task, subtask: Subtask): Promise<void> {
    const isDone = !subtask.isDone;
    const subtasks = task.subtasks.map((s) => (s.id === subtask.id ? { ...s, isDone } : s));
    this.patchLocal(task.id, { subtasks });

    const updated = await this.run(this.api.updateSubtask(task.id, subtask.id, { isDone }));
    if (!updated) return;
    this.replaceLocal(updated);

    // Every step ticked off: offer to finish the task itself.
    if (isDone && updated.status === 'open' && updated.subtasks.length > 1 && updated.subtasks.every((s) => s.isDone)) {
      this.toast.show(`All steps of "${updated.title}" are done.`, 'success', {
        label: 'Complete task',
        run: () => void this.complete(updated),
      });
    }
  }

  async addSubtask(task: Task, title: string): Promise<boolean> {
    const updated = await this.run(this.api.addSubtask(task.id, title));
    if (updated) this.replaceLocal(updated);
    return !!updated;
  }

  async deleteSubtask(task: Task, subtask: Subtask): Promise<void> {
    this.patchLocal(task.id, { subtasks: task.subtasks.filter((s) => s.id !== subtask.id) });
    const updated = await this.run(this.api.deleteSubtask(task.id, subtask.id));
    if (updated) this.replaceLocal(updated);
  }

  // ---- End-of-day reflection ----------------------------------------------------------------

  /** Saves the reflection for a day. An empty mood + text deletes it. Returns false on failure. */
  async saveNote(date: IsoDate, mood: Mood | null, reflection: string): Promise<boolean> {
    const text = reflection.trim();
    let note: DayNote | null;
    try {
      // The server answers 204 (null) when an empty note was deleted.
      note = await firstValueFrom(this.api.saveNote(date, mood, text || null), { defaultValue: null });
    } catch (err) {
      this.toast.error(errorMessage(err));
      return false;
    }
    this.day.update((d) => (d && d.date === date ? { ...d, note } : d));
    if (note) this.toast.show(date === this.today() ? 'Saved. Rest well 🌙' : 'Reflection saved 🌙', 'success');
    return true;
  }

  // ---- Templates ----------------------------------------------------------------------------

  async saveAsTemplate(task: Task): Promise<void> {
    const template = await this.run(this.api.saveAsTemplate(task.id));
    if (template) {
      await Promise.all([this.loadTemplates(), this.refresh()]);
      this.toast.show(`"${template.title}" is now a reusable template ⭐`, 'success');
    }
  }

  /** Creates a fresh task from a template on the selected day (or the backlog). */
  async useTemplate(template: Template, target: 'day' | 'backlog', index: number | null = null): Promise<Task | null> {
    const date = target === 'day' && !this.isPast() ? this.selectedDate() : null;
    const task = await this.run(this.api.instantiate(template.id, date, index));
    await Promise.all([this.refresh(), this.loadTemplates()]);
    return task;
  }

  async updateTemplate(template: Template, input: TemplateInput): Promise<void> {
    const { repeat, ...fields } = input;
    if (!(await this.run(this.api.updateTemplate(template.id, fields)))) return;
    if (repeat !== undefined && !sameRepeat(repeat, template.repeat)) await this.run(this.api.setTemplateRepeat(template.id, repeat));
    // A repeating template may put a task on today right away, so the day is refreshed too.
    await Promise.all([this.loadTemplates(), this.refresh()]);
  }

  async deleteTemplate(template: Template): Promise<boolean> {
    return this.deleteTemplateById(template.id);
  }

  /**
   * "Remove from templates" on a task: deletes the template it came from. The task (and other copies) stay,
   * just no longer linked; a repeating series stops repeating.
   */
  async removeFromTemplates(task: Task): Promise<void> {
    if (task.templateId === null) return;
    const repeated = !!task.repeat;
    if (await this.deleteTemplateById(task.templateId)) {
      this.toast.show(`"${task.title}" is no longer a template${repeated ? ' and stops repeating' : ''}.`);
    }
  }

  private async deleteTemplateById(id: number): Promise<boolean> {
    this.templates.update((list) => list.filter((t) => t.id !== id));
    // Tasks made from it stay, but are no longer linked (no ⭐, no 🔁). The server does the same.
    const unlink = (t: Task): Task => (t.templateId === id ? { ...t, templateId: null, repeat: null } : t);
    this.day.update((d) => (d ? { ...d, tasks: d.tasks.map(unlink) } : d));
    this.backlog.update((list) => list.map(unlink));
    let ok = true;
    try {
      await firstValueFrom(this.api.deleteTemplate(id), { defaultValue: undefined });
    } catch (err) {
      ok = false;
      this.toast.error(errorMessage(err));
    }
    await Promise.all([this.loadTemplates(), this.refresh()]);
    return ok;
  }

  async createTag(name: string): Promise<Tag | null> {
    const tag = await this.run(this.api.createTag(name));
    if (tag) await this.loadTags();
    return tag;
  }

  // ---- Focus selection ----------------------------------------------------------------------

  addToFocus(taskId: number, index?: number): void {
    this.focusIds.update((ids) => {
      const next = ids.filter((id) => id !== taskId);
      next.splice(index ?? next.length, 0, taskId);
      return next;
    });
    this.persistFocus();
  }

  removeFromFocus(taskId: number): void {
    this.focusIds.update((ids) => ids.filter((id) => id !== taskId));
    this.persistFocus();
  }

  clearFocus(): void {
    this.focusIds.set([]);
    this.persistFocus();
  }

  /** Focus tasks must be on today's list; backlog picks are moved to today when a session starts. */
  async prepareFocusTasks(): Promise<Task[]> {
    if (!this.isToday()) await this.selectDate(this.today());
    const fromBacklog = this.focusTasks().filter((t) => t.plannedDate !== this.today());
    for (const task of fromBacklog) {
      await this.run(this.api.move(task.id, this.today(), Number.MAX_SAFE_INTEGER));
    }
    if (fromBacklog.length) await this.refresh();
    return this.focusTasks();
  }

  // ---- Helpers ------------------------------------------------------------------------------

  /** Runs an API call, turning failures into a toast + a re-sync. Returns null on failure. */
  private async run<T>(request: Observable<T>): Promise<T | null> {
    try {
      const result = await firstValueFrom(request, { defaultValue: null as T });
      this.offline.set(false);
      return result;
    } catch (err) {
      this.toast.error(errorMessage(err));
      void this.refresh().catch(() => undefined);
      return null;
    }
  }

  private patchLocal(id: number, patch: Partial<Task>): void {
    this.day.update((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : d));
    this.backlog.update((list) => (list.some((t) => t.id === id) ? list.map((t) => (t.id === id ? { ...t, ...patch } : t)) : list));
  }

  /** Swaps in a fresh copy of a task from the server wherever it's shown. */
  private replaceLocal(task: Task): void {
    this.patchLocal(task.id, task);
  }

  private applyLocalMove(task: Task, target: 'day' | 'backlog', index: number): void {
    const moved: Task = { ...task, plannedDate: target === 'day' ? this.selectedDate() : null };
    const day = this.day();
    const open = this.openTasks().filter((t) => t.id !== task.id);
    const backlog = this.backlog().filter((t) => t.id !== task.id);

    if (target === 'day') open.splice(index, 0, moved);
    else backlog.splice(index, 0, moved);

    if (day) this.day.set({ ...day, tasks: [...open, ...this.doneTasks()] });
    this.backlog.set(backlog);
  }

  private persistFocus(): void {
    localSet(FOCUS_KEY, JSON.stringify(this.focusIds()));
  }
}

function readFocusIds(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
