namespace Focus.Domain.Entities;

/// <summary>
/// History record: "this task was on the list for this day". Kept even when the task later leaves the day,
/// so stats reflect what was actually planned. One entry per (Date, Task).
/// </summary>
public class DayPlanEntry
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }

    public int TaskItemId { get; set; }
    public TaskItem TaskItem { get; set; } = null!;

    public DateTime AddedAt { get; set; }
    public DateTime? RemovedAt { get; set; }
    public PlanOutcome Outcome { get; set; } = PlanOutcome.Pending;
}
