using Focus.Application.Abstractions;
using Focus.Application.Common;
using Focus.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Focus.Application.Tags;

public sealed record SaveTagRequest(string Name, string? Color = null);

public sealed class TagService(IFocusDbContext db)
{
    /// <summary>Accent palette understood by the UI. New tags cycle through it.</summary>
    public static readonly string[] Colors = ["lavender", "mint", "coral", "honey", "sky", "rose"];

    public async Task<IReadOnlyList<TagDto>> GetAllAsync(CancellationToken ct = default) =>
        await db.Tags.AsNoTracking().OrderBy(t => t.Name).Select(t => new TagDto(t.Id, t.Name, t.Color)).ToListAsync(ct);

    public async Task<TagDto> CreateAsync(SaveTagRequest request, CancellationToken ct = default)
    {
        var name = ValidateName(request.Name);
        if (await FindByNameAsync(name, ct) is not null)
            throw new ValidationException($"A tag named '{name}' already exists.");

        var tag = new Tag { Name = name, Color = await ColorOrNextAsync(request.Color, ct) };
        db.Tags.Add(tag);
        await db.SaveChangesAsync(ct);
        return TagDto.From(tag);
    }

    public async Task<TagDto> UpdateAsync(int id, SaveTagRequest request, CancellationToken ct = default)
    {
        var tag = await db.Tags.FindAsync([id], ct) ?? throw new NotFoundException("Tag", id);
        var name = ValidateName(request.Name);
        if (await FindByNameAsync(name, ct) is { } other && other.Id != id)
            throw new ValidationException($"A tag named '{name}' already exists.");

        tag.Name = name;
        if (request.Color is not null) tag.Color = ValidateColor(request.Color);
        await db.SaveChangesAsync(ct);
        return TagDto.From(tag);
    }

    public async Task DeleteAsync(int id, CancellationToken ct = default)
    {
        var tag = await db.Tags.FindAsync([id], ct) ?? throw new NotFoundException("Tag", id);
        db.Tags.Remove(tag);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Finds a tag by name (case-insensitive) or creates it. Used by quick add.</summary>
    public async Task<Tag> GetOrCreateByNameAsync(string name, CancellationToken ct = default)
    {
        name = ValidateName(name);
        if (await FindByNameAsync(name, ct) is { } existing) return existing;

        var tag = new Tag { Name = name, Color = await ColorOrNextAsync(null, ct) };
        db.Tags.Add(tag);
        await db.SaveChangesAsync(ct);
        return tag;
    }

    /// <summary>Validates that an optional tag id refers to an existing tag.</summary>
    public async Task<int?> EnsureExistsAsync(int? id, CancellationToken ct = default)
    {
        if (id is null) return null;
        if (!await db.Tags.AnyAsync(t => t.Id == id, ct)) throw new NotFoundException("Tag", id);
        return id;
    }

    private Task<Tag?> FindByNameAsync(string name, CancellationToken ct)
    {
        var lower = name.ToLower();
        return db.Tags.FirstOrDefaultAsync(t => t.Name.ToLower() == lower, ct);
    }

    private async Task<string> ColorOrNextAsync(string? color, CancellationToken ct) =>
        color is not null ? ValidateColor(color) : Colors[await db.Tags.CountAsync(ct) % Colors.Length];

    private static string ValidateName(string? name)
    {
        var trimmed = name?.Trim().TrimStart('#');
        if (string.IsNullOrEmpty(trimmed)) throw new ValidationException("Tag name is required.");
        if (trimmed.Length > 40) throw new ValidationException("Tag name must be at most 40 characters.");
        return trimmed;
    }

    private static string ValidateColor(string color) =>
        Colors.Contains(color) ? color : throw new ValidationException($"Unknown color '{color}'. Use one of: {string.Join(", ", Colors)}.");
}
