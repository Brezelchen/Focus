import { Dialog } from '@angular/cdk/dialog';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { addDays, formatMinutes, greeting, longDate, relativeDayName } from '../../core/dates';
import { Subtask, Task, Template } from '../../core/models';
import { PetService } from '../../core/pet.service';
import { PlannerStore } from '../../core/planner.store';
import { ProgressRing } from '../../shared/progress-ring';
import { Pup, PupMood } from '../../shared/pup';
import { TaskAction, TaskCard } from '../../shared/task-card';
import { DayReflection } from './day-reflection';
import { MorningRitual } from './morning-ritual';
import { TaskDialogs } from './task-dialogs';

/** What's being dragged: an existing task, or a template that will create a new task on drop. */
type DragItem = { kind: 'task'; task: Task } | { kind: 'template'; template: Template };

@Component({
  selector: 'app-today-page',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, TaskCard, ProgressRing, Pup, DayReflection],
  templateUrl: './today-page.html',
  styleUrl: './today-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class TodayPage {
  protected readonly store = inject(PlannerStore);
  private readonly pet = inject(PetService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly dialogs = inject(TaskDialogs);

  private readonly quickInput = viewChild<ElementRef<HTMLInputElement>>('quick');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly hello = greeting();
  protected readonly quickText = signal('');
  protected readonly search = signal('');
  protected readonly tagFilter = signal<number | null>(null);
  protected readonly showDone = signal(true);
  protected readonly adding = signal(false);

  protected readonly dayTitle = computed(() => relativeDayName(this.store.selectedDate(), this.store.today()));
  protected readonly dateLabel = computed(() => longDate(this.store.selectedDate()));
  protected readonly remaining = computed(() => formatMinutes(this.store.day()?.remainingEstimateMinutes));
  protected readonly percent = computed(() => Math.round(this.store.progress() * 100));

  /** Backlog tasks overdue or due within the next 7 days. */
  private readonly dueSoon = computed(() => {
    const limit = addDays(this.store.today(), 7);
    return this.store.backlog().filter((t) => t.dueDate && t.dueDate <= limit);
  });
  protected readonly dueCount = computed(() => this.dueSoon().length);
  protected readonly dueOnly = signal(false);

  protected readonly filteredBacklog = computed(() => {
    const q = this.search().trim().toLowerCase();
    const tag = this.tagFilter();
    const source = this.dueOnly()
      ? [...this.dueSoon()].sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)) // most urgent first
      : this.store.backlog();
    return source.filter(
      (t) => (!q || t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q)) && (tag === null || t.tag?.id === tag),
    );
  });
  /** Reordering the backlog is only meaningful when it's not filtered. */
  protected readonly backlogFiltered = computed(() => !!this.search().trim() || this.tagFilter() !== null || this.dueOnly());

  protected readonly backlogTags = computed(() => {
    const seen = new Map<number, NonNullable<Task['tag']>>();
    for (const t of this.store.backlog()) if (t.tag) seen.set(t.tag.id, t.tag);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly pupMood = computed<PupMood>(() => {
    const d = this.store.day();
    if (!d || d.planned === 0) return 'sleepy';
    if (d.done === d.planned) return 'party';
    return d.done > 0 ? 'happy' : 'idle';
  });

  protected readonly pupLine = computed(() => {
    const d = this.store.day();
    if (this.store.isPast()) return d?.planned ? `You finished ${d.done} of ${d.planned}.` : 'A quiet day.';
    if (!d || d.planned === 0) return 'Nothing planned yet. Drag something in from the backlog!';
    if (d.done === d.planned) return this.pet.kind() === 'cat' ? 'All done! Time for a cozy nap? 🐾' : 'All done! Time for a walk? 🐾';
    const left = d.planned - d.done;
    return d.done === 0 ? `${left} ${left === 1 ? 'thing' : 'things'} to do. You've got this!` : `${left} to go, nice momentum!`;
  });

  constructor() {
    // Open the morning ritual once data says so.
    effect(() => {
      if (this.store.ritual() && !this.dialog.openDialogs.length) {
        const ref = this.dialog.open(MorningRitual, { panelClass: 'focus-dialog', backdropClass: 'focus-backdrop' });
        ref.closed.subscribe(() => this.store.dismissRitual());
      }
    });
  }

  // ---- Quick add ----------------------------------------------------------------------------

  protected async quickAdd(event: Event | null, target: 'day' | 'backlog'): Promise<void> {
    event?.preventDefault();
    const text = this.quickText().trim();
    if (!text || this.adding()) return;
    this.adding.set(true);
    const created = await this.store.quickAdd(text, this.store.isPast() ? 'backlog' : target);
    this.adding.set(false);
    if (created) this.quickText.set('');
  }

  protected readonly backlogText = signal('');

  /** The add field inside the backlog panel: always adds to the backlog. */
  protected async addToBacklog(event: Event | null): Promise<void> {
    event?.preventDefault();
    const text = this.backlogText().trim();
    if (!text || this.adding()) return;
    this.adding.set(true);
    const created = await this.store.quickAdd(text, 'backlog');
    this.adding.set(false);
    if (created) this.backlogText.set('');
  }

  // ---- Drag & drop --------------------------------------------------------------------------

  protected readonly noEnter = () => false;
  protected readonly canEnterDay = () => !this.store.isPast();

  protected onDrop(event: CdkDragDrop<any, any, DragItem>, target: 'day' | 'backlog'): void {
    const item = event.item.data;
    if (item.kind === 'template') {
      void this.store.useTemplate(item.template, target, event.currentIndex);
      return;
    }
    const sameList = event.previousContainer === event.container;
    if (sameList && event.previousIndex === event.currentIndex) return;

    // Indexes from a filtered backlog view don't map to the real list; append instead.
    const index = target === 'backlog' && this.backlogFiltered() ? 0 : event.currentIndex;
    void this.store.move(item.task, target, index);
  }

  protected async onFocusDrop(event: CdkDragDrop<any, any, DragItem>): Promise<void> {
    const item = event.item.data;
    if (event.previousContainer === event.container) {
      const ids = [...this.store.focusIds()];
      moveItemInArray(ids, event.previousIndex, event.currentIndex);
      this.store.focusIds.set(ids);
      return;
    }
    if (item.kind === 'template') {
      const task = await this.store.useTemplate(item.template, this.store.isToday() ? 'day' : 'backlog');
      if (task) this.store.addToFocus(task.id, event.currentIndex);
      return;
    }
    if (item.task.status === 'open') this.store.addToFocus(item.task.id, event.currentIndex);
  }

  protected taskItem(task: Task): DragItem {
    return { kind: 'task', task };
  }

  protected templateItem(template: Template): DragItem {
    return { kind: 'template', template };
  }

  // ---- Task actions -------------------------------------------------------------------------

  protected toggle(task: Task, origin: { x: number; y: number }): void {
    if (task.status === 'done') void this.store.reopen(task);
    else void this.store.complete(task, origin);
  }

  protected onAction(task: Task, action: TaskAction): void {
    switch (action) {
      case 'edit':
        return this.edit(task);
      case 'delete':
        return void this.store.remove(task);
      case 'template':
        return void this.store.saveAsTemplate(task);
      case 'focus':
        return this.store.addToFocus(task.id);
      case 'toToday':
        return void this.store.move(task, 'day', this.store.openTasks().length);
      case 'toBacklog':
        return void this.store.move(task, 'backlog', 0);
      case 'reopen':
        return void this.store.reopen(task);
    }
  }

  protected edit(task: Task): void {
    this.dialogs.editTask(task);
  }

  protected toggleSubtask(task: Task, subtask: Subtask): void {
    void this.store.toggleSubtask(task, subtask);
  }

  protected editTemplate(template: Template, event: Event): void {
    event.preventDefault();
    this.dialogs.editTemplate(template);
  }

  protected deleteTemplate(template: Template, event: Event): void {
    event.stopPropagation();
    void this.store.deleteTemplate(template);
  }

  protected startFocus(): void {
    void this.router.navigate(['/focus']);
  }

  // ---- Keyboard shortcuts -------------------------------------------------------------------

  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || target.closest('input, textarea, [contenteditable], [role="dialog"]')) return;
    if (this.dialog.openDialogs.length) return; // e.g. the command palette, before it has focus
    if (e.key === 'n') {
      e.preventDefault();
      this.quickInput()?.nativeElement.focus();
    } else if (e.key === '/') {
      e.preventDefault();
      this.searchInput()?.nativeElement.focus();
    } else if (e.key === 'ArrowLeft') {
      void this.store.shiftDay(-1);
    } else if (e.key === 'ArrowRight') {
      void this.store.shiftDay(1);
    } else if (e.key === 't') {
      void this.store.selectDate(this.store.today());
    } else if (e.key === 'r' && !this.store.isFuture()) {
      this.store.reflectRequested.set(true);
    }
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected isShift(e: Event): boolean {
    return (e as KeyboardEvent).shiftKey;
  }
}
