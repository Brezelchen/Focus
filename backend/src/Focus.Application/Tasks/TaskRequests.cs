using Focus.Domain.Entities;

namespace Focus.Application.Tasks;

public sealed record CreateTaskRequest(
    string Title,
    string? Notes = null,
    int? EstimateMinutes = null,
    Priority Priority = Priority.Normal,
    int? TagId = null,
    DateOnly? PlannedDate = null,
    DateOnly? DueDate = null,
    IReadOnlyList<string>? Subtasks = null);

public sealed record QuickAddRequest(string Text, DateOnly? PlannedDate = null);

/// <summary>
/// Full replacement of the user-editable fields. <see cref="Subtasks"/> replaces the checklist in the given order
/// (items with an <see cref="SubtaskInput.Id"/> are kept and updated, others are added, missing ones removed);
/// leave it null to keep the checklist as it is.
/// </summary>
public sealed record UpdateTaskRequest(
    string Title,
    string? Notes,
    int? EstimateMinutes,
    Priority Priority,
    int? TagId,
    DateOnly? DueDate = null,
    IReadOnlyList<SubtaskInput>? Subtasks = null);

public sealed record SubtaskInput(int? Id, string Title, bool IsDone = false);

public sealed record AddSubtaskRequest(string Title);

/// <summary>Partial update of one checklist item: only the fields that are set change.</summary>
public sealed record UpdateSubtaskRequest(string? Title = null, bool? IsDone = null);

/// <summary>Move a task to a day (or to the backlog when <see cref="Date"/> is null) at a position among that list's open tasks.</summary>
public sealed record MoveTaskRequest(DateOnly? Date, int Index);
