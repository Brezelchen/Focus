using System.Linq.Expressions;
using Focus.Domain.Entities;

namespace Focus.Application.Common;

/// <summary>EF-translatable projections so list queries stay a single SQL statement.</summary>
public static class Projections
{
    public static readonly Expression<Func<TaskItem, TaskDto>> Task = t => new TaskDto(
        t.Id,
        t.Title,
        t.Notes,
        t.Status,
        t.PlannedDate,
        t.DueDate,
        t.SortOrder,
        t.EstimateMinutes,
        t.Priority,
        t.Tag == null ? null : new TagDto(t.Tag.Id, t.Tag.Name, t.Tag.Color),
        t.TemplateId,
        t.CreatedAt,
        t.CompletedAt,
        t.PlanEntries.Count(e => e.Outcome == PlanOutcome.NotCompleted),
        t.Subtasks.OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => new SubtaskDto(s.Id, s.Title, s.IsDone)).ToList());

    public static readonly Expression<Func<TaskTemplate, TemplateDto>> Template = t => new TemplateDto(
        t.Id,
        t.Title,
        t.Notes,
        t.Icon,
        t.EstimateMinutes,
        t.Priority,
        t.Tag == null ? null : new TagDto(t.Tag.Id, t.Tag.Name, t.Tag.Color),
        t.Checklist,
        t.UseCount,
        t.LastUsedAt);
}
