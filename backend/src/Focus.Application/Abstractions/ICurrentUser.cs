namespace Focus.Application.Abstractions;

/// <summary>
/// The signed-in user for the current request. All data access is scoped to this user
/// (see the query filters in <c>FocusDbContext</c>).
/// </summary>
public interface ICurrentUser
{
    /// <summary><c>null</c> when nobody is signed in (e.g. the sign-in endpoints).</summary>
    int? UserId { get; }
}
