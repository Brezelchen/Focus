using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Application.Tags;
using Focus.Application.Tasks;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Templates;

public sealed record SaveTemplateRequest(
    string Title,
    string? Notes = null,
    string? Icon = null,
    int? EstimateMinutes = null,
    Priority Priority = Priority.Normal,
    int? TagId = null,
    IReadOnlyList<string>? Checklist = null);

/// <summary>Create a task from a template, on <see cref="Date"/> (null = backlog) at <see cref="Index"/> (null = end).</summary>
public sealed record InstantiateTemplateRequest(DateOnly? Date, int? Index = null);

public sealed class TemplateService(IFocusDbContext db, IClock clock, TagService tags, TaskService tasks)
{
    private const string DefaultIcon = "⭐"; // star

    /// <summary>Most useful first: by use count, then most recently used.</summary>
    public async Task<IReadOnlyList<TemplateDto>> GetAllAsync(CancellationToken ct = default) =>
        await db.Templates.AsNoTracking()
            .OrderByDescending(t => t.UseCount).ThenByDescending(t => t.LastUsedAt).ThenBy(t => t.Title)
            .Select(Projections.Template)
            .ToListAsync(ct);

    public async Task<TemplateDto> GetAsync(int id, CancellationToken ct = default) =>
        await db.Templates.AsNoTracking().Where(t => t.Id == id).Select(Projections.Template).FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Template", id);

    public async Task<TemplateDto> CreateAsync(SaveTemplateRequest request, CancellationToken ct = default)
    {
        var template = new TaskTemplate { Title = "", CreatedAt = clock.UtcNow };
        await ApplyAsync(template, request, ct);
        db.Templates.Add(template);
        await db.SaveChangesAsync(ct);
        return await GetAsync(template.Id, ct);
    }

    /// <summary>"Save as template": copies a task's fields into a new template and links the task to it.</summary>
    public async Task<TemplateDto> CreateFromTaskAsync(int taskId, CancellationToken ct = default)
    {
        var task = await db.Tasks.Include(t => t.Subtasks).FirstOrDefaultAsync(t => t.Id == taskId, ct)
            ?? throw new NotFoundException("Task", taskId);
        if (task.TemplateId is { } existingId) return await GetAsync(existingId, ct);

        var now = clock.UtcNow;
        var template = new TaskTemplate
        {
            Title = task.Title,
            Notes = task.Notes,
            EstimateMinutes = task.EstimateMinutes,
            Priority = task.Priority,
            TagId = task.TagId,
            Checklist = task.Subtasks.OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => s.Title).ToList(),
            Icon = DefaultIcon,
            CreatedAt = now,
            UseCount = 1,
            LastUsedAt = now,
        };
        db.Templates.Add(template);
        task.Template = template;
        await db.SaveChangesAsync(ct);
        return await GetAsync(template.Id, ct);
    }

    public async Task<TemplateDto> UpdateAsync(int id, SaveTemplateRequest request, CancellationToken ct = default)
    {
        var template = await db.Templates.FindAsync([id], ct) ?? throw new NotFoundException("Template", id);
        await ApplyAsync(template, request, ct);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var template = await db.Templates.FindAsync([id], ct) ?? throw new NotFoundException("Template", id);
        db.Templates.Remove(template);
        await db.SaveChangesAsync(ct);
    }

    public async Task<TaskDto> InstantiateAsync(int id, InstantiateTemplateRequest request, CancellationToken ct = default)
    {
        var template = await db.Templates.FindAsync([id], ct) ?? throw new NotFoundException("Template", id);

        var task = new TaskItem
        {
            Title = template.Title,
            Notes = template.Notes,
            EstimateMinutes = template.EstimateMinutes,
            Priority = template.Priority,
            TagId = template.TagId,
            TemplateId = template.Id,
            Subtasks = TaskService.NewSubtasks(template.Checklist),
        };
        template.UseCount++;
        template.LastUsedAt = clock.UtcNow;
        await tasks.AddAsync(task, request.Date, ct);

        if (request.Index is { } index)
        {
            var tracked = await tasks.LoadAsync(task.Id, ct);
            await tasks.MoveToAsync(tracked, request.Date, index, ct);
            await db.SaveChangesAsync(ct);
        }

        return await tasks.GetAsync(task.Id, ct);
    }

    private async Task ApplyAsync(TaskTemplate template, SaveTemplateRequest request, CancellationToken ct)
    {
        template.Title = Guard.Title(request.Title);
        template.Notes = Guard.Notes(request.Notes);
        var icon = request.Icon?.Trim();
        template.Icon = string.IsNullOrEmpty(icon) ? DefaultIcon : icon[..Math.Min(icon.Length, 16)];
        template.EstimateMinutes = Guard.Estimate(request.EstimateMinutes);
        template.Priority = request.Priority;
        template.TagId = await tags.EnsureExistsAsync(request.TagId, ct);
        // Null keeps the checklist (older clients don't send it).
        if (request.Checklist is { } checklist) template.Checklist = Guard.Checklist(checklist);
    }
}
