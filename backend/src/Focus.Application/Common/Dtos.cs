using Focus.Domain.Entities;

namespace Focus.Application.Common;

public sealed record TagDto(int Id, string Name, string Color)
{
    public static TagDto From(Tag t) => new(t.Id, t.Name, t.Color);
}

public sealed record TaskDto(
    int Id,
    string Title,
    string? Notes,
    TaskItemStatus Status,
    DateOnly? PlannedDate,
    DateOnly? DueDate,
    int SortOrder,
    int? EstimateMinutes,
    Priority Priority,
    TagDto? Tag,
    int? TemplateId,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    int PostponedCount,
    IReadOnlyList<SubtaskDto> Subtasks,
    RecurrenceDto? Repeat);

public sealed record SubtaskDto(int Id, string Title, bool IsDone);

public sealed record TemplateDto(
    int Id,
    string Title,
    string? Notes,
    string Icon,
    int? EstimateMinutes,
    Priority Priority,
    TagDto? Tag,
    IReadOnlyList<string> Checklist,
    int UseCount,
    DateTime? LastUsedAt,
    RecurrenceDto? Repeat);

/// <param name="Weekdays">Weekly: the chosen days, Monday first.</param>
/// <param name="MonthDay">Monthly: day of the month (31 = last day in shorter months).</param>
/// <param name="StartDate">"Every N" counts from this day.</param>
public sealed record RecurrenceDto(RepeatFrequency Frequency, int Interval, IReadOnlyList<DayOfWeek> Weekdays, int? MonthDay, DateOnly StartDate)
{
    /// <summary>Builds the DTO from a template's columns; null when it doesn't repeat. Runs client-side in projections.</summary>
    public static RecurrenceDto? From(RepeatFrequency? frequency, int interval, int weekdays, int? monthDay, DateOnly? start) =>
        frequency is { } f && start is { } s ? new RecurrenceDto(f, interval, Recurrence.FromMask(weekdays), monthDay, s) : null;
}
