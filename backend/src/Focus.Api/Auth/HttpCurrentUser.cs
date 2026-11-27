using System.Globalization;
using System.Security.Claims;
using Focus.Application.Abstractions;

namespace Focus.Api.Auth;

/// <summary>Reads the signed-in user's id from the auth cookie's claims.</summary>
public sealed class HttpCurrentUser(IHttpContextAccessor http) : ICurrentUser
{
    public int? UserId =>
        int.TryParse(http.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), NumberStyles.None, CultureInfo.InvariantCulture, out var id)
            ? id
            : null;
}
