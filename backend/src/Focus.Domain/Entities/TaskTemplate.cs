namespace Focus.Domain.Entities;

/// <summary>A reusable todo. Instantiating it creates a fresh <see cref="TaskItem"/>; the template itself is never consumed.</summary>
public class TaskTemplate
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public string? Notes { get; set; }
    public string Icon { get; set; } = "⭐"; // star
    public int? EstimateMinutes { get; set; }
    public Priority Priority { get; set; } = Priority.Normal;

    public int? TagId { get; set; }
    public Tag? Tag { get; set; }

    /// <summary>Checklist item titles copied into every task created from this template.</summary>
    public List<string> Checklist { get; set; } = [];

    public int UseCount { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
