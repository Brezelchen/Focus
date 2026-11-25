using Focus.Domain.Entities;

namespace Focus.Application.Common;

internal static class Guard
{
    public static string Title(string? title)
    {
        var trimmed = title?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new ValidationException("Title is required.");
        if (trimmed.Length > TaskItem.TitleMaxLength)
            throw new ValidationException($"Title must be at most {TaskItem.TitleMaxLength} characters.");
        return trimmed;
    }

    public static int? Estimate(int? minutes)
    {
        if (minutes is null) return null;
        if (minutes is < 1 or > 24 * 60)
            throw new ValidationException("Estimate must be between 1 minute and 24 hours.");
        return minutes;
    }

    public static string? Notes(string? notes)
    {
        var trimmed = notes?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        if (trimmed.Length > 4000) throw new ValidationException("Notes must be at most 4000 characters.");
        return trimmed;
    }
}
