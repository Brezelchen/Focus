namespace Focus.Domain.Entities;

/// <summary>An account. Signs in with an email + password, with GitHub, or both (when GitHub is linked).</summary>
public class User
{
    public const int NameMaxLength = 100;
    public const int EmailMaxLength = 254;

    public int Id { get; set; }
    public required string DisplayName { get; set; }

    /// <summary>Lower-cased. Unique when set; GitHub-only accounts may have none.</summary>
    public string? Email { get; set; }

    /// <summary><c>null</c> when the account can only sign in with GitHub.</summary>
    public string? PasswordHash { get; set; }

    /// <summary>GitHub's numeric user id (stable, unlike the login name).</summary>
    public long? GitHubId { get; set; }
    public string? GitHubLogin { get; set; }
    public string? AvatarUrl { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? LastSignInAt { get; set; }
}

/// <summary>
/// Data that belongs to one user. <see cref="UserId"/> is <c>null</c> only for rows created before accounts existed;
/// the first account created claims them.
/// </summary>
public interface IUserOwned
{
    int? UserId { get; set; }
}
