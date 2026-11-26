namespace Focus.Domain.Entities;

/// <summary>End-of-day reflection: a mood and a short note for one local calendar day.</summary>
public class DayNote
{
    public const int ReflectionMaxLength = 500;

    public DateOnly Date { get; set; }
    public Mood? Mood { get; set; }
    public string? Reflection { get; set; }
    public DateTime UpdatedAt { get; set; }
}
