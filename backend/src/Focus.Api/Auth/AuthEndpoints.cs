using System.Globalization;
using System.Security.Claims;
using Focus.Application.Abstractions;
using Focus.Application.Common;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Focus.Api.Auth;

public static class AuthEndpoints
{
    public sealed record ProvidersDto(bool GitHub);

    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/auth").WithTags("Auth");

        g.MapGet("/providers", (IConfiguration config) => new ProvidersDto(AuthSetup.GitHubEnabled(config)))
            .AllowAnonymous()
            .WithSummary("Which sign-in methods are available");

        g.MapGet("/me", async (HttpContext http, ICurrentUser current, AccountService accounts, CancellationToken ct) =>
        {
            if (current.UserId is { } id && await accounts.FindAsync(id, ct) is { } user) return Results.Ok(UserDto.From(user));
            // The account no longer exists: drop the stale cookie.
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Unauthorized();
        }).WithSummary("The signed-in user (401 when signed out)");

        g.MapPost("/register", async (RegisterRequest r, HttpContext http, AccountService accounts, CancellationToken ct) =>
        {
            var user = await accounts.RegisterAsync(r, ct);
            await AuthSetup.SignInAsync(http, user);
            return Results.Ok(UserDto.From(user));
        }).AllowAnonymous().RequireRateLimiting(AuthSetup.RateLimitPolicy);

        g.MapPost("/login", async (LoginRequest r, HttpContext http, AccountService accounts, CancellationToken ct) =>
        {
            var user = await accounts.CheckPasswordAsync(r, ct) ?? throw new ValidationException("Wrong email or password.");
            await AuthSetup.SignInAsync(http, user);
            return Results.Ok(UserDto.From(user));
        }).AllowAnonymous().RequireRateLimiting(AuthSetup.RateLimitPolicy);

        g.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).AllowAnonymous();

        // GitHub: /github sends the browser to GitHub, GitHub returns to /github/callback (handled by the OAuth
        // middleware, which stores the identity in the external cookie), which forwards to /github/complete.
        g.MapGet("/github", (string? returnUrl, IConfiguration config) =>
        {
            if (!AuthSetup.GitHubEnabled(config)) return Results.NotFound();
            var complete = "/api/auth/github/complete?returnUrl=" + Uri.EscapeDataString(AuthSetup.LocalPath(returnUrl));
            return Results.Challenge(new AuthenticationProperties { RedirectUri = complete }, [AuthSetup.GitHubScheme]);
        }).AllowAnonymous().RequireRateLimiting(AuthSetup.RateLimitPolicy).WithSummary("Sign in with GitHub (or link it when signed in)");

        g.MapGet("/github/complete", async (string? returnUrl, HttpContext http, ICurrentUser current, AccountService accounts, CancellationToken ct) =>
        {
            var signedInUserId = current.UserId;
            var external = await http.AuthenticateAsync(AuthSetup.ExternalScheme);
            await http.SignOutAsync(AuthSetup.ExternalScheme);

            // Signed-out people return to the sign-in page; signed-in people (linking GitHub) to the app.
            IResult Fail(string code) => Results.Redirect(signedInUserId is null ? $"/login?error={code}" : $"/?auth={code}");

            if (!external.Succeeded || external.Principal is not { } principal
                || !long.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), NumberStyles.None, CultureInfo.InvariantCulture, out var gitHubId))
            {
                return Fail("github");
            }

            var profile = new GitHubProfile(
                gitHubId,
                principal.FindFirstValue(ClaimTypes.Name) ?? gitHubId.ToString(CultureInfo.InvariantCulture),
                principal.FindFirstValue(AuthSetup.GitHubNameClaim),
                principal.FindFirstValue(ClaimTypes.Email),
                principal.FindFirstValue(AuthSetup.GitHubAvatarClaim));

            var (user, error) = await accounts.SignInWithGitHubAsync(profile, signedInUserId, ct);
            if (user is null)
            {
                return Fail(error == GitHubSignInError.LinkedElsewhere ? "github-linked-elsewhere" : "email-taken");
            }

            await AuthSetup.SignInAsync(http, user);
            return Results.Redirect(signedInUserId is null ? AuthSetup.LocalPath(returnUrl) : "/?auth=github-linked");
        }).AllowAnonymous().ExcludeFromDescription();

        return api;
    }
}
