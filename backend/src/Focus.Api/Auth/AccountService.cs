using System.Net.Mail;
using Focus.Application.Common;
using Focus.Domain.Entities;
using Focus.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Focus.Api.Auth;

/// <param name="HasPassword">False for accounts that can only sign in with GitHub.</param>
public sealed record UserDto(int Id, string Name, string? Email, string? AvatarUrl, string? GitHubLogin, bool HasPassword)
{
    public static UserDto From(User u) => new(u.Id, u.DisplayName, u.Email, u.AvatarUrl, u.GitHubLogin, u.PasswordHash is not null);
}

public sealed record RegisterRequest(string? Email, string? Password, string? Name);

public sealed record LoginRequest(string? Email, string? Password);

/// <summary>The GitHub profile handed over by the OAuth handler.</summary>
public sealed record GitHubProfile(long Id, string Login, string? Name, string? Email, string? AvatarUrl);

/// <summary>Why a GitHub sign-in was refused. The value is passed to the app in the redirect URL.</summary>
public enum GitHubSignInError
{
    None,

    /// <summary>The GitHub account is already linked to a different Focus account.</summary>
    LinkedElsewhere,

    /// <summary>A password account already uses the GitHub email. Accounts are never merged by email, because the
    /// email of a password account isn't verified: whoever registered it first would get the GitHub user's data.</summary>
    EmailTaken,
}

/// <summary>Creating accounts and checking credentials.</summary>
public sealed class AccountService(FocusDbContext db, IPasswordHasher<User> hasher, TimeProvider time)
{
    public const int PasswordMinLength = 8;
    public const int PasswordMaxLength = 128;

    public async Task<User?> FindAsync(int id, CancellationToken ct = default) =>
        await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<User> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var email = NormalizeEmail(request.Email) ?? throw new ValidationException("Please enter a valid email address.");
        var password = request.Password ?? "";
        if (password.Length < PasswordMinLength)
            throw new ValidationException($"Your password needs at least {PasswordMinLength} characters.");
        if (password.Length > PasswordMaxLength)
            throw new ValidationException($"Your password can have at most {PasswordMaxLength} characters.");
        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            throw new ValidationException("There's already an account with this email. Try signing in instead.");

        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name)) name = email[..email.IndexOf('@')];
        if (name.Length > User.NameMaxLength) throw new ValidationException($"Your name can have at most {User.NameMaxLength} characters.");

        var now = time.GetUtcNow().UtcDateTime;
        var user = new User { DisplayName = name, Email = email, CreatedAt = now, LastSignInAt = now };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        await ClaimLegacyDataAsync(user, ct);
        return user;
    }

    /// <summary>Returns the user when the email and password match, otherwise null.</summary>
    public async Task<User?> CheckPasswordAsync(LoginRequest request, CancellationToken ct = default)
    {
        var email = NormalizeEmail(request.Email);
        var user = email is null ? null : await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user?.PasswordHash is null)
        {
            // Hash anyway so a missing account takes as long as a wrong password.
            hasher.HashPassword(new User { DisplayName = "" }, request.Password ?? "");
            return null;
        }

        var result = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password ?? "");
        if (result == PasswordVerificationResult.Failed) return null;
        if (result == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = hasher.HashPassword(user, request.Password!);

        user.LastSignInAt = time.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        return user;
    }

    /// <summary>
    /// Signs in with GitHub: finds the account linked to this GitHub user, links GitHub to the signed-in account
    /// (<paramref name="signedInUserId"/>), or creates a new account.
    /// </summary>
    public async Task<(User? User, GitHubSignInError Error)> SignInWithGitHubAsync(
        GitHubProfile profile, int? signedInUserId, CancellationToken ct = default)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var user = await db.Users.FirstOrDefaultAsync(u => u.GitHubId == profile.Id, ct);

        if (user is not null && signedInUserId is not null && user.Id != signedInUserId)
            return (null, GitHubSignInError.LinkedElsewhere);

        if (user is null && signedInUserId is not null)
        {
            user = await db.Users.FirstOrDefaultAsync(u => u.Id == signedInUserId, ct);
            if (user is not null) user.GitHubId = profile.Id;
        }

        var created = false;
        if (user is null)
        {
            var email = NormalizeEmail(profile.Email);
            if (email is not null && await db.Users.AnyAsync(u => u.Email == email, ct))
                return (null, GitHubSignInError.EmailTaken);

            user = new User { DisplayName = "", GitHubId = profile.Id, Email = email, CreatedAt = now };
            db.Users.Add(user);
            created = true;
        }

        user.GitHubLogin = profile.Login;
        user.AvatarUrl = profile.AvatarUrl;
        if (string.IsNullOrWhiteSpace(user.DisplayName)) user.DisplayName = Truncate(profile.Name ?? profile.Login, User.NameMaxLength);
        user.LastSignInAt = now;
        await db.SaveChangesAsync(ct);
        if (created) await ClaimLegacyDataAsync(user, ct);
        return (user, GitHubSignInError.None);
    }

    /// <summary>
    /// Data created before accounts existed has no owner. It goes to the first account, which is the person who
    /// used Focus on their own until now.
    /// </summary>
    private async Task ClaimLegacyDataAsync(User user, CancellationToken ct)
    {
        if (await db.Users.CountAsync(ct) != 1) return;

        await db.Tags.IgnoreQueryFilters().Where(x => x.UserId == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, user.Id), ct);
        await db.Templates.IgnoreQueryFilters().Where(x => x.UserId == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, user.Id), ct);
        await db.Tasks.IgnoreQueryFilters().Where(x => x.UserId == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, user.Id), ct);
        await db.FocusSessions.IgnoreQueryFilters().Where(x => x.UserId == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, user.Id), ct);
        await db.DayNotes.IgnoreQueryFilters().Where(x => x.UserId == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UserId, user.Id), ct);
    }

    private static string? NormalizeEmail(string? email)
    {
        email = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(email) || email.Length > User.EmailMaxLength) return null;
        return MailAddress.TryCreate(email, out var parsed) && parsed.Address == email ? email : null;
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}
