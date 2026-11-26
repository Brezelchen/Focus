namespace Focus.Domain.Entities;

/// <summary>A checklist item inside a task.</summary>
public class Subtask
{
    public const int TitleMaxLength = 200;

    /// <summary>Most checklist items a single task (or template) may have.</summary>
    public const int MaxPerTask = 50;

    public int Id { get; set; }

    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;

    public required string Title { get; set; }
    public bool IsDone { get; set; }

    /// <summary>Order within the task's checklist.</summary>
    public int SortOrder { get; set; }
}
