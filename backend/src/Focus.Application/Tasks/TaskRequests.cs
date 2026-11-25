using Focus.Domain.Entities;

namespace Focus.Application.Tasks;

public sealed record CreateTaskRequest(
    string Title,
    string? Notes = null,
    int? EstimateMinutes = null,
    Priority Priority = Priority.Normal,
    int? TagId = null,
    DateOnly? PlannedDate = null,
    DateOnly? DueDate = null);

public sealed record QuickAddRequest(string Text, DateOnly? PlannedDate = null);

/// <summary>Full replacement of the user-editable fields.</summary>
public sealed record UpdateTaskRequest(
    string Title,
    string? Notes,
    int? EstimateMinutes,
    Priority Priority,
    int? TagId,
    DateOnly? DueDate = null);

/// <summary>Move a task to a day (or to the backlog when <see cref="Date"/> is null) at a position among that list's open tasks.</summary>
public sealed record MoveTaskRequest(DateOnly? Date, int Index);
