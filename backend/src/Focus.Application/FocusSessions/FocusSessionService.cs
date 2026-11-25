using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.FocusSessions;

public sealed record StartSessionRequest(IReadOnlyList<int> TaskIds, int PlannedMinutes);

/// <param name="ActualSeconds">Focused time, pauses excluded.</param>
public sealed record FinishSessionRequest(FocusSessionStatus Status, int ActualSeconds);

public sealed record FocusSessionTaskDto(int TaskId, string Title, bool CompletedInSession);

public sealed record FocusSessionDto(
    int Id,
    DateTime StartedAt,
    DateTime? EndedAt,
    int PlannedMinutes,
    int ActualSeconds,
    FocusSessionStatus Status,
    IReadOnlyList<FocusSessionTaskDto> Tasks);

public sealed class FocusSessionService(IFocusDbContext db, IClock clock)
{
    public const int MaxMinutes = 4 * 60;

    public async Task<FocusSessionDto> StartAsync(StartSessionRequest request, CancellationToken ct = default)
    {
        if (request.PlannedMinutes is < 1 or > MaxMinutes)
            throw new ValidationException($"A session must last between 1 and {MaxMinutes} minutes.");

        var taskIds = (request.TaskIds ?? []).Distinct().ToList();
        var found = await db.Tasks.CountAsync(t => taskIds.Contains(t.Id), ct);
        if (found != taskIds.Count) throw new ValidationException("One or more tasks don't exist.");

        var session = new FocusSession
        {
            StartedAt = clock.UtcNow,
            Date = clock.Today,
            PlannedMinutes = request.PlannedMinutes,
            Tasks = taskIds.Select(id => new FocusSessionTask { TaskItemId = id }).ToList(),
        };
        db.FocusSessions.Add(session);
        await db.SaveChangesAsync(ct);
        return await GetAsync(session.Id, ct);
    }

    /// <summary>Ends a session. Tasks that were completed between start and now are marked as done in the session.</summary>
    public async Task<FocusSessionDto> FinishAsync(int id, FinishSessionRequest request, CancellationToken ct = default)
    {
        if (request.Status == FocusSessionStatus.Running)
            throw new ValidationException("Finish a session as Completed or EndedEarly.");

        var session = await db.FocusSessions
            .Include(s => s.Tasks).ThenInclude(t => t.TaskItem)
            .FirstOrDefaultAsync(s => s.Id == id, ct)
            ?? throw new NotFoundException("Focus session", id);
        if (session.Status != FocusSessionStatus.Running)
            throw new ValidationException("This session has already ended.");

        var now = clock.UtcNow;
        var maxSeconds = (int)Math.Ceiling((now - session.StartedAt).TotalSeconds);
        session.Status = request.Status;
        session.EndedAt = now;
        session.ActualSeconds = Math.Clamp(request.ActualSeconds, 0, Math.Max(maxSeconds, 0));
        foreach (var t in session.Tasks)
        {
            t.CompletedInSession = t.TaskItem.Status == TaskItemStatus.Done
                && t.TaskItem.CompletedAt >= session.StartedAt;
        }

        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<FocusSessionDto> GetAsync(int id, CancellationToken ct = default) =>
        await db.FocusSessions.AsNoTracking()
            .Where(s => s.Id == id)
            .Select(s => new FocusSessionDto(
                s.Id, s.StartedAt, s.EndedAt, s.PlannedMinutes, s.ActualSeconds, s.Status,
                s.Tasks.Select(t => new FocusSessionTaskDto(t.TaskItemId, t.TaskItem.Title, t.CompletedInSession)).ToList()))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Focus session", id);
}
