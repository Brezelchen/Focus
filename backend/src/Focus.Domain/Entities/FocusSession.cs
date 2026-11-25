namespace Focus.Domain.Entities;

public class FocusSession
{
    public int Id { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public int PlannedMinutes { get; set; }

    /// <summary>Focused seconds actually spent (pauses excluded), reported by the client.</summary>
    public int ActualSeconds { get; set; }

    public FocusSessionStatus Status { get; set; } = FocusSessionStatus.Running;

    /// <summary>The local day the session started on (used for per-day stats).</summary>
    public DateOnly Date { get; set; }

    public List<FocusSessionTask> Tasks { get; set; } = [];
}

public class FocusSessionTask
{
    public int FocusSessionId { get; set; }
    public FocusSession FocusSession { get; set; } = null!;

    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;

    public bool CompletedInSession { get; set; }
}
