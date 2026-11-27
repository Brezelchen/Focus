using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Application.Tags;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Tasks;

public sealed class TaskService(IFocusDbContext db, IClock clock, TagService tags)
{
    public async Task<IReadOnlyList<TaskDto>> GetBacklogAsync(int? tagId, string? search, CancellationToken ct = default)
    {
        var query = db.Tasks.AsNoTracking().Where(t => t.PlannedDate == null && t.Status == TaskItemStatus.Open);
        if (tagId is not null) query = query.Where(t => t.TagId == tagId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{search.Trim()}%";
            query = query.Where(t => EF.Functions.Like(t.Title, pattern) || (t.Notes != null && EF.Functions.Like(t.Notes, pattern)));
        }

        return await query.OrderBy(t => t.SortOrder).ThenBy(t => t.Id).Select(Projections.Task).ToListAsync(ct);
    }

    public async Task<TaskDto> GetAsync(int id, CancellationToken ct = default) =>
        await db.Tasks.AsNoTracking().Where(t => t.Id == id).Select(Projections.Task).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Task", id);

    public async Task<TaskDto> CreateAsync(CreateTaskRequest request, CancellationToken ct = default)
    {
        var task = new TaskItem
        {
            Title = Guard.Title(request.Title),
            Notes = Guard.Notes(request.Notes),
            EstimateMinutes = Guard.Estimate(request.EstimateMinutes),
            Priority = request.Priority,
            TagId = await tags.EnsureExistsAsync(request.TagId, ct),
            DueDate = request.DueDate,
            Subtasks = NewSubtasks(Guard.Checklist(request.Subtasks)),
        };
        await AddAsync(task, request.PlannedDate, ct);
        return await GetAsync(task.Id, ct);
    }

    /// <summary>Fresh, unchecked checklist items in the given order.</summary>
    internal static List<Subtask> NewSubtasks(IEnumerable<string> titles) =>
        titles.Select((title, i) => new Subtask { Title = title, SortOrder = i }).ToList();

    public async Task<TaskDto> QuickAddAsync(QuickAddRequest request, CancellationToken ct = default)
    {
        var parsed = QuickAddParser.Parse(request.Text ?? "", clock.Today);
        var task = new TaskItem
        {
            Title = Guard.Title(parsed.Title),
            EstimateMinutes = parsed.EstimateMinutes,
            Priority = parsed.Priority ?? Priority.Normal,
            DueDate = parsed.DueDate,
            TagId = parsed.TagName is null ? null : (await tags.GetOrCreateByNameAsync(parsed.TagName, ct)).Id,
        };
        await AddAsync(task, request.PlannedDate, ct);
        return await GetAsync(task.Id, ct);
    }

    /// <summary>Adds a new task at the end of its list. Used by templates too.</summary>
    internal async Task AddAsync(TaskItem task, DateOnly? plannedDate, CancellationToken ct)
    {
        EnsureNotPast(plannedDate);
        var now = clock.UtcNow;
        task.CreatedAt = now;
        task.UpdatedAt = now;
        task.PlannedDate = plannedDate;
        task.SortOrder = await NextSortOrderAsync(plannedDate, ct);
        if (plannedDate is { } date) DayPlanner.Join(task, date, now);

        db.Tasks.Add(task);
        await db.SaveChangesAsync(ct);
    }

    public async Task<TaskDto> UpdateAsync(int id, UpdateTaskRequest request, CancellationToken ct = default)
    {
        var task = await LoadAsync(id, ct);
        task.Title = Guard.Title(request.Title);
        task.Notes = Guard.Notes(request.Notes);
        task.EstimateMinutes = Guard.Estimate(request.EstimateMinutes);
        task.Priority = request.Priority;
        task.TagId = await tags.EnsureExistsAsync(request.TagId, ct);
        task.DueDate = request.DueDate;
        task.UpdatedAt = clock.UtcNow;
        if (request.Subtasks is { } subtasks) await ReplaceSubtasksAsync(task, subtasks, ct);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    // ---- Checklist ------------------------------------------------------------------------------

    public async Task<TaskDto> AddSubtaskAsync(int taskId, AddSubtaskRequest request, CancellationToken ct = default)
    {
        var task = await db.Tasks.Include(t => t.Subtasks).FirstOrDefaultAsync(t => t.Id == taskId, ct)
            ?? throw new NotFoundException("Task", taskId);
        if (task.Subtasks.Count >= Subtask.MaxPerTask)
            throw new ValidationException($"A checklist can have at most {Subtask.MaxPerTask} items.");

        task.Subtasks.Add(new Subtask
        {
            Title = Guard.SubtaskTitle(request.Title),
            SortOrder = task.Subtasks.Count == 0 ? 0 : task.Subtasks.Max(s => s.SortOrder) + 1,
        });
        task.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(taskId, ct);
    }

    public async Task<TaskDto> UpdateSubtaskAsync(int taskId, int subtaskId, UpdateSubtaskRequest request, CancellationToken ct = default)
    {
        var subtask = await FindSubtaskAsync(taskId, subtaskId, ct);
        if (request.Title is not null) subtask.Title = Guard.SubtaskTitle(request.Title);
        if (request.IsDone is { } done) subtask.IsDone = done;
        subtask.TaskItem.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetAsync(taskId, ct);
    }

    public async Task<TaskDto> DeleteSubtaskAsync(int taskId, int subtaskId, CancellationToken ct = default)
    {
        var subtask = await FindSubtaskAsync(taskId, subtaskId, ct);
        subtask.TaskItem.UpdatedAt = clock.UtcNow;
        db.Subtasks.Remove(subtask);
        await db.SaveChangesAsync(ct);
        return await GetAsync(taskId, ct);
    }

    private async Task<Subtask> FindSubtaskAsync(int taskId, int subtaskId, CancellationToken ct) =>
        await db.Subtasks.Include(s => s.TaskItem).FirstOrDefaultAsync(s => s.Id == subtaskId && s.TaskItemId == taskId, ct)
        ?? throw new NotFoundException("Checklist item", subtaskId);

    /// <summary>Makes the task's checklist match <paramref name="inputs"/> (order included). Does not save.</summary>
    private async Task ReplaceSubtasksAsync(TaskItem task, IReadOnlyList<SubtaskInput> inputs, CancellationToken ct)
    {
        var titles = Guard.Checklist(inputs.Select(i => i.Title)); // validates titles and the size limit
        if (titles.Count != inputs.Count) throw new ValidationException("Checklist items need a title.");

        var existing = await db.Subtasks.Where(s => s.TaskItemId == task.Id).ToDictionaryAsync(s => s.Id, ct);
        var kept = new HashSet<int>();
        for (var i = 0; i < inputs.Count; i++)
        {
            var input = inputs[i];
            if (input.Id is { } id && existing.TryGetValue(id, out var subtask) && kept.Add(id))
            {
                subtask.Title = titles[i];
                subtask.IsDone = input.IsDone;
                subtask.SortOrder = i;
            }
            else
            {
                db.Subtasks.Add(new Subtask { TaskItemId = task.Id, Title = titles[i], IsDone = input.IsDone, SortOrder = i });
            }
        }

        db.Subtasks.RemoveRange(existing.Values.Where(s => !kept.Contains(s.Id)));
    }

    /// <summary>
    /// Marks a task done. A task that isn't on today's list (backlog or a future day) moves to today,
    /// because that's the day it actually got done.
    /// With <paramref name="on"/> set to a past day the task was planned for, it is recorded as done on that day
    /// instead (for when the user forgot to tick it off).
    /// </summary>
    public async Task<TaskDto> CompleteAsync(int id, DateOnly? on = null, CancellationToken ct = default)
    {
        var task = await LoadAsync(id, ct);
        if (task.Status == TaskItemStatus.Done) return await GetAsync(id, ct);

        var day = on ?? clock.Today;
        if (day > clock.Today)
            throw new ValidationException("A task can't be completed on a future day.");
        if (day < clock.Today && !task.PlanEntries.Any(e => e.Date == day))
            throw new ValidationException("A task can only be completed on a past day it was planned for.");

        var now = clock.UtcNow;
        if (task.PlannedDate != day)
            await MoveToAsync(task, day, int.MaxValue, ct);

        task.Status = TaskItemStatus.Done;
        task.CompletedAt = now;
        task.UpdatedAt = now;
        DayPlanner.SyncOutcome(task, now);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Reopens a done task. A task done on a past day comes back onto today's list.</summary>
    public async Task<TaskDto> ReopenAsync(int id, CancellationToken ct = default)
    {
        var task = await LoadAsync(id, ct);
        if (task.Status == TaskItemStatus.Open) return await GetAsync(id, ct);

        var now = clock.UtcNow;
        task.Status = TaskItemStatus.Open;
        task.CompletedAt = null;
        task.UpdatedAt = now;

        if (task.PlannedDate is { } date && date < clock.Today)
            await MoveToAsync(task, clock.Today, int.MaxValue, ct);
        else
            DayPlanner.SyncOutcome(task, now);

        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<TaskDto> MoveAsync(int id, MoveTaskRequest request, CancellationToken ct = default)
    {
        var task = await LoadAsync(id, ct);
        if (task.Status == TaskItemStatus.Done)
            throw new ValidationException("Reopen the task before moving it.");
        EnsureNotPast(request.Date);

        await MoveToAsync(task, request.Date, request.Index, ct);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var task = await db.Tasks.FindAsync([id], ct) ?? throw new NotFoundException("Task", id);
        db.Tasks.Remove(task);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Moves <paramref name="task"/> into the list for <paramref name="date"/> (null = backlog) at
    /// <paramref name="index"/> among that list's open tasks, renumbering the list. Does not save.
    /// </summary>
    internal async Task MoveToAsync(TaskItem task, DateOnly? date, int index, CancellationToken ct)
    {
        var now = clock.UtcNow;
        if (task.PlannedDate != date)
        {
            if (task.PlannedDate is { } oldDate) DayPlanner.Leave(task, oldDate, clock.Today, now);
            if (date is { } newDate) DayPlanner.Join(task, newDate, now);
            task.PlannedDate = date;
        }

        var siblings = await db.Tasks
            .Where(t => t.PlannedDate == date && t.Status == TaskItemStatus.Open && t.Id != task.Id)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Id)
            .ToListAsync(ct);

        siblings.Insert(Math.Clamp(index, 0, siblings.Count), task);
        for (var i = 0; i < siblings.Count; i++) siblings[i].SortOrder = i;
        task.UpdatedAt = now;
    }

    internal async Task<TaskItem> LoadAsync(int id, CancellationToken ct) =>
        await db.Tasks.Include(t => t.PlanEntries).FirstOrDefaultAsync(t => t.Id == id, ct)
        ?? throw new NotFoundException("Task", id);

    private async Task<int> NextSortOrderAsync(DateOnly? date, CancellationToken ct) =>
        (await db.Tasks.Where(t => t.PlannedDate == date).MaxAsync(t => (int?)t.SortOrder, ct) ?? -1) + 1;

    private void EnsureNotPast(DateOnly? date)
    {
        if (date is { } d && d < clock.Today)
            throw new ValidationException("Tasks can't be planned for a day in the past.");
    }
}
