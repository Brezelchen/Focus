using Focus.Application.Tasks;
using Focus.Domain.Entities;

namespace Focus.Application.Templates;

/// <summary>Copies between tasks and templates, shared by "save as template", instantiation and recurrence.</summary>
internal static class TemplateFactory
{
    public const string DefaultIcon = "⭐"; // star

    /// <summary>A new template with the task's fields and checklist titles. Counts as one use (the task itself).</summary>
    public static TaskTemplate FromTask(TaskItem task, DateTime now) => new()
    {
        Title = task.Title,
        Notes = task.Notes,
        EstimateMinutes = task.EstimateMinutes,
        Priority = task.Priority,
        TagId = task.TagId,
        Checklist = task.Subtasks.OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => s.Title).ToList(),
        Icon = DefaultIcon,
        CreatedAt = now,
        UseCount = 1,
        LastUsedAt = now,
    };

    /// <summary>A fresh, unsaved task from a template, with an unticked checklist.</summary>
    public static TaskItem NewTask(TaskTemplate template) => new()
    {
        Title = template.Title,
        Notes = template.Notes,
        EstimateMinutes = template.EstimateMinutes,
        Priority = template.Priority,
        TagId = template.TagId,
        TemplateId = template.Id,
        Subtasks = TaskService.NewSubtasks(template.Checklist),
    };
}
