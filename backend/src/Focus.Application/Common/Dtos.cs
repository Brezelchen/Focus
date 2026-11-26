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
    IReadOnlyList<SubtaskDto> Subtasks);

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
    DateTime? LastUsedAt);
