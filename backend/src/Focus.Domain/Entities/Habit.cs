namespace Focus.Domain.Entities;

public enum HabitKind
{
    /// <summary>Something to do: done when the count reaches the target (or it's ticked).</summary>
    Build = 0,

    /// <summary>Something to stay clear of. Ticked = stayed clear; with a target it's a limit (done while count ≤ target).</summary>
    Avoid = 1,
}

public enum HabitTimeOfDay
{
    Anytime = 0,
    Morning = 1,
    Evening = 2,
}

/// <summary>
/// A habit you tick off on the days its repeat rule matches. Unlike recurring tasks nothing is created per day:
/// whether it's due is computed from the rule, and what you did is stored as a <see cref="HabitCheckIn"/>.
/// </summary>
public class Habit : IUserOwned
{
    public const int TitleMaxLength = 100;
    public const int UnitMaxLength = 12;
    public const int MaxTarget = 999;

    public int? UserId { get; set; }
    public int Id { get; set; }
    public required string Title { get; set; }
    public string Icon { get; set; } = "✅";
    public int SortOrder { get; set; }

    /// <summary>Null = the base list (every month). Otherwise the 1st of the only month this habit belongs to.</summary>
    public DateOnly? Month { get; set; }

    // ---- Repeat rule (always set: a habit always repeats) ----------------------------------------
    public RepeatFrequency RepeatFrequency { get; set; } = RepeatFrequency.Daily;
    public int RepeatInterval { get; set; } = 1;
    public int RepeatWeekdays { get; set; }
    public int? RepeatMonthDay { get; set; }
    public DateOnly RepeatStart { get; set; }

    /// <summary>Null = a simple tick. Otherwise a count to reach (or, for <see cref="HabitKind.Avoid"/>, not to exceed).</summary>
    public int? Target { get; set; }
    public string? Unit { get; set; }

    public HabitKind Kind { get; set; } = HabitKind.Build;
    public HabitTimeOfDay TimeOfDay { get; set; } = HabitTimeOfDay.Anytime;

    /// <summary>The count is filled from that day's focus minutes instead of by hand.</summary>
    public bool CountsFocusMinutes { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>First day the habit no longer applies. Past days keep their history.</summary>
    public DateOnly? ArchivedAt { get; set; }

    public List<HabitCheckIn> CheckIns { get; set; } = [];

    /// <summary>An avoid habit with a target: done while the count stays at or below it.</summary>
    public bool IsLimit => Kind == HabitKind.Avoid && Target is not null;

    public bool IsDueOn(DateOnly date) =>
        (ArchivedAt is null || date < ArchivedAt)
        && (Month is not { } m || (date.Year == m.Year && date.Month == m.Month))
        && Recurrence.Occurs(RepeatFrequency, RepeatInterval, RepeatWeekdays, RepeatMonthDay, RepeatStart, date);

    public bool IsMet(int count) => IsLimit ? count <= Target : count >= (Target ?? 1);
}

/// <summary>What was done for a habit on one day. A day without a row has count 0.</summary>
public class HabitCheckIn
{
    public int Id { get; set; }
    public int HabitId { get; set; }
    public Habit Habit { get; set; } = null!;
    public DateOnly Date { get; set; }
    public int Count { get; set; }

    /// <summary>A rest day (sick, travelling): the habit isn't due that day, so it doesn't break a streak.</summary>
    public bool Skipped { get; set; }

    public DateTime UpdatedAt { get; set; }
}

/// <summary>An intention for a month, e.g. "🌙 Calm", shown with that month's habits.</summary>
public class HabitMonthNote : IUserOwned
{
    public const int WordMaxLength = 40;

    public int Id { get; set; }
    public int? UserId { get; set; }

    /// <summary>The 1st of the month.</summary>
    public DateOnly Month { get; set; }
    public string? Word { get; set; }
    public string? Emoji { get; set; }
}
