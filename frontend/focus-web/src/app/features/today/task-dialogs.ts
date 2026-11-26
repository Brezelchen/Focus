import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import { Task, Template, TemplateInput } from '../../core/models';
import { PlannerStore } from '../../core/planner.store';
import { TaskEditor, TaskEditorData } from './task-editor';

/** Opens the task/template editor and saves the result. Used by Today and the command palette. */
@Injectable({ providedIn: 'root' })
export class TaskDialogs {
  private readonly dialog = inject(Dialog);
  private readonly store = inject(PlannerStore);

  editTask(task: Task): void {
    this.open({ item: task, kind: 'task' }, (input) => this.store.update(task, input));
  }

  editTemplate(template: Template): void {
    this.open({ item: template, kind: 'template' }, (input) => this.store.updateTemplate(template, input));
  }

  private open(data: TaskEditorData, save: (input: TemplateInput) => Promise<void>): void {
    const ref = this.dialog.open<TemplateInput, TaskEditorData>(TaskEditor, {
      data,
      panelClass: 'focus-dialog',
      backdropClass: 'focus-backdrop',
    });
    ref.closed.subscribe((input) => input && void save(input));
  }
}
