namespace Focus.Domain.Entities;

public class Tag : IUserOwned
{
    public int? UserId { get; set; }
    public int Id { get; set; }
    public required string Name { get; set; }

    /// <summary>Accent key used by the UI (e.g. "mint", "coral", "lavender", "honey", "sky", "rose").</summary>
    public string Color { get; set; } = "lavender";
}
