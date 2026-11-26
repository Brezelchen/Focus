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

    public static string SubtaskTitle(string? title)
    {
        var trimmed = title?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new ValidationException("Checklist items need a title.");
        if (trimmed.Length > Subtask.TitleMaxLength)
            throw new ValidationException($"Checklist items must be at most {Subtask.TitleMaxLength} characters.");
        return trimmed;
    }

    /// <summary>Validates a checklist (template checklists and full task checklists), dropping blank lines.</summary>
    public static List<string> Checklist(IEnumerable<string?>? titles)
    {
        var list = (titles ?? []).Where(t => !string.IsNullOrWhiteSpace(t)).Select(SubtaskTitle).ToList();
        if (list.Count > Subtask.MaxPerTask)
            throw new ValidationException($"A checklist can have at most {Subtask.MaxPerTask} items.");
        return list;
    }

    public static string? Notes(string? notes)
    {
        var trimmed = notes?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        if (trimmed.Length > 4000) throw new ValidationException("Notes must be at most 4000 characters.");
        return trimmed;
    }
}
