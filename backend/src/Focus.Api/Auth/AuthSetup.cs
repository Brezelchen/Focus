using System.Security.Claims;
using System.Threading.RateLimiting;
using AspNet.Security.OAuth.GitHub;
using Focus.Application.Abstractions;
using Focus.Domain.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;

namespace Focus.Api.Auth;

/// <summary>
/// Cookie sign-in (email + password, or GitHub). Sign-ins last: the cookie is persistent for a year and renewed
/// while the app is used, and the keys that encrypt it are kept on disk so restarting the server doesn't sign anyone out.
/// </summary>
public static class AuthSetup
{
    public const string ExternalScheme = "External";
    public const string RateLimitPolicy = "auth";
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(365);

    public static bool GitHubEnabled(IConfiguration config) =>
        !string.IsNullOrWhiteSpace(config["Authentication:GitHub:ClientId"])
        && !string.IsNullOrWhiteSpace(config["Authentication:GitHub:ClientSecret"]);

    public static IServiceCollection AddFocusAuth(this IServiceCollection services, IConfiguration config, string defaultKeysPath)
    {
        services.AddDataProtection()
            .SetApplicationName("Focus")
            .PersistKeysToFileSystem(new DirectoryInfo(config["DataProtection:KeysPath"] is { Length: > 0 } path ? path : defaultKeysPath));

        var auth = services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(o =>
            {
                o.Cookie.Name = ".Focus.Auth";
                o.Cookie.HttpOnly = true;
                o.Cookie.SameSite = SameSiteMode.Lax;
                o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                o.ExpireTimeSpan = SessionLifetime;
                o.SlidingExpiration = true;
                // This is an API: answer with status codes instead of redirecting to a login page.
                o.Events.OnRedirectToLogin = ctx => SetStatus(ctx, StatusCodes.Status401Unauthorized);
                o.Events.OnRedirectToAccessDenied = ctx => SetStatus(ctx, StatusCodes.Status403Forbidden);
            })
            // Holds the GitHub identity for the moment between GitHub's callback and /api/auth/github/complete.
            .AddCookie(ExternalScheme, o =>
            {
                o.Cookie.Name = ".Focus.External";
                o.ExpireTimeSpan = TimeSpan.FromMinutes(10);
            });

        if (GitHubEnabled(config))
        {
            auth.AddGitHub(o =>
            {
                o.ClientId = config["Authentication:GitHub:ClientId"]!;
                o.ClientSecret = config["Authentication:GitHub:ClientSecret"]!;
                o.SignInScheme = ExternalScheme;
                o.CallbackPath = "/api/auth/github/callback";
                o.Scope.Add("user:email");
                o.ClaimActions.MapJsonKey(GitHubAvatarClaim, "avatar_url");
                o.Events.OnRemoteFailure = ctx =>
                {
                    // Cancelled on GitHub or the round trip failed: back to the sign-in page with a message.
                    ctx.Response.Redirect("/login?error=github");
                    ctx.HandleResponse();
                    return Task.CompletedTask;
                };
            });
        }

        services.AddAuthorization();
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            // Slow down password guessing: 10 attempts per minute per client address (by default).
            var permits = config.GetValue("Authentication:AttemptsPerMinute", 10);
            o.AddPolicy(RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
                ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) }));
        });

        return services
            .AddScoped<ICurrentUser, HttpCurrentUser>()
            .AddScoped<IPasswordHasher<User>, PasswordHasher<User>>()
            .AddScoped<AccountService>();
    }

    public const string GitHubAvatarClaim = "urn:github:avatar";
    public const string GitHubNameClaim = "urn:github:name";

    /// <summary>Signs the user in with a persistent cookie.</summary>
    public static Task SignInAsync(HttpContext http, User user)
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.DisplayName)],
            CookieAuthenticationDefaults.AuthenticationScheme);
        return http.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true, AllowRefresh = true });
    }

    /// <summary>Only same-site paths, so a crafted link can't send people elsewhere after signing in.</summary>
    public static string LocalPath(string? url) =>
        url is { Length: > 0 } && url[0] == '/' && (url.Length == 1 || (url[1] != '/' && url[1] != '\\')) ? url : "/";

    private static Task SetStatus(RedirectContext<CookieAuthenticationOptions> ctx, int status)
    {
        ctx.Response.StatusCode = status;
        return Task.CompletedTask;
    }

    internal static string GitHubScheme => GitHubAuthenticationDefaults.AuthenticationScheme;
}
