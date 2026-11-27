namespace Focus.Domain.Entities;

public class TaskItem : IUserOwned
{
    public const int TitleMaxLength = 200;

    public int? UserId { get; set; }
    public int Id { get; set; }
    public required string Title { get; set; }
    public string? Notes { get; set; }
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Open;

    /// <summary>The day this task is planned for. <c>null</c> means it lives in the backlog.</summary>
    public DateOnly? PlannedDate { get; set; }

    /// <summary>Manual order within its list (a day or the backlog).</summary>
    public int SortOrder { get; set; }

    /// <summary>When the task must be done by. Independent of <see cref="PlannedDate"/> (when you plan to do it).</summary>
    public DateOnly? DueDate { get; set; }

    public int? EstimateMinutes { get; set; }
    public Priority Priority { get; set; } = Priority.Normal;

    public int? TagId { get; set; }
    public Tag? Tag { get; set; }

    public int? TemplateId { get; set; }
    public TaskTemplate? Template { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public List<DayPlanEntry> PlanEntries { get; set; } = [];

    /// <summary>Checklist items, ordered by <see cref="Subtask.SortOrder"/>.</summary>
    public List<Subtask> Subtasks { get; set; } = [];
}
