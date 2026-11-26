namespace Focus.Domain.Entities;

/// <summary>A reusable todo. Instantiating it creates a fresh <see cref="TaskItem"/>; the template itself is never consumed.</summary>
public class TaskTemplate
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public string? Notes { get; set; }
    public string Icon { get; set; } = "⭐"; // star
    public int? EstimateMinutes { get; set; }
    public Priority Priority { get; set; } = Priority.Normal;

    public int? TagId { get; set; }
    public Tag? Tag { get; set; }

    /// <summary>Checklist item titles copied into every task created from this template.</summary>
    public List<string> Checklist { get; set; } = [];

    public int UseCount { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    // ---- Repeat rule (all null/default = not recurring) -----------------------------------------

    /// <summary>How often a copy lands on Today automatically. <c>null</c> = doesn't repeat.</summary>
    public RepeatFrequency? RepeatFrequency { get; set; }

    /// <summary>Every N days / weeks / months.</summary>
    public int RepeatInterval { get; set; } = 1;

    /// <summary>Weekly: chosen weekdays as a bitmask (see <see cref="Recurrence.WeekdayBit"/>).</summary>
    public int RepeatWeekdays { get; set; }

    /// <summary>Monthly: day of the month (1–31).</summary>
    public int? RepeatMonthDay { get; set; }

    /// <summary>First possible occurrence; "every N" counts from here.</summary>
    public DateOnly? RepeatStart { get; set; }

    /// <summary>Last day the rule was applied, so a day is only processed once.</summary>
    public DateOnly? RepeatLastRun { get; set; }

    public bool Repeats => RepeatFrequency is not null;

    public bool OccursOn(DateOnly date) =>
        RepeatFrequency is { } f && RepeatStart is { } start
        && Recurrence.Occurs(f, RepeatInterval, RepeatWeekdays, RepeatMonthDay, start, date);

    public void ClearRepeat()
    {
        RepeatFrequency = null;
        RepeatInterval = 1;
        RepeatWeekdays = 0;
        RepeatMonthDay = null;
        RepeatStart = null;
        RepeatLastRun = null;
    }
}
