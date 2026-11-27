using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Focus.IntegrationTests;

public sealed class AuthTests(FocusApiFactory factory) : IClassFixture<FocusApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record UserDto(int Id, string Name, string? Email, string? AvatarUrl, string? GitHubLogin, bool HasPassword);
    private sealed record IdDto(int Id);

    private HttpClient NewClient() =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true, AllowAutoRedirect = false });

    private static string NewEmail() => $"{Guid.NewGuid():N}@example.com";

    [Fact]
    public async Task The_api_needs_a_signed_in_user()
    {
        var client = NewClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/tasks")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/tasks/quick", new { text = "x" })).StatusCode);

        // The sign-in endpoints and the app itself stay reachable.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/providers")).StatusCode);
    }

    [Fact]
    public async Task Register_sign_out_and_sign_in_again()
    {
        var email = NewEmail();
        var client = NewClient();

        var registered = await client.PostAsJsonAsync("/api/auth/register", new { email = "  " + email.ToUpperInvariant(), password = "correct horse", name = "Ada" });
        registered.EnsureSuccessStatusCode();

        // The cookie is persistent (has an expiry about a year out), so closing the browser doesn't sign you out.
        var cookie = registered.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith(".Focus.Auth=", StringComparison.Ordinal));
        Assert.Contains("expires=", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);

        var me = await client.GetFromJsonAsync<UserDto>("/api/auth/me", Json);
        Assert.Equal("Ada", me!.Name);
        Assert.Equal(email, me.Email);
        Assert.True(me.HasPassword);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);

        var wrong = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "wrong password" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "correct horse" })).EnsureSuccessStatusCode();
        Assert.Equal(me.Id, (await client.GetFromJsonAsync<UserDto>("/api/auth/me", Json))!.Id);
    }

    [Fact]
    public async Task Registration_is_validated()
    {
        var client = NewClient();
        var email = NewEmail();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register", new { email = "not-an-email", password = "correct horse" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "short" })).StatusCode);

        (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "correct horse" })).EnsureSuccessStatusCode();
        var duplicate = await NewClient().PostAsJsonAsync("/api/auth/register", new { email, password = "another one" });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
    }

    [Fact]
    public async Task Users_cannot_reach_each_others_tasks()
    {
        var alice = NewClient();
        (await alice.PostAsJsonAsync("/api/auth/register", new { email = NewEmail(), password = "correct horse" })).EnsureSuccessStatusCode();
        var created = await alice.PostAsJsonAsync("/api/tasks/quick", new { text = "Secret plan" });
        var task = (await created.Content.ReadFromJsonAsync<IdDto>(Json))!;

        var bob = NewClient();
        (await bob.PostAsJsonAsync("/api/auth/register", new { email = NewEmail(), password = "correct horse" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/tasks/{task.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/tasks/{task.Id}")).StatusCode);
        Assert.Equal("[]", await bob.GetStringAsync("/api/tasks"));

        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync($"/api/tasks/{task.Id}")).StatusCode);
    }

    [Fact]
    public async Task GitHub_sign_in_is_off_without_credentials()
    {
        var client = NewClient();
        Assert.Contains("\"gitHub\":false", await client.GetStringAsync("/api/auth/providers"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/auth/github")).StatusCode);
    }
}

/// <summary>The API with (dummy) GitHub credentials configured.</summary>
public sealed class GitHubEnabledFactory : FocusApiFactory
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Authentication:GitHub:ClientId", "test-client-id");
        builder.UseSetting("Authentication:GitHub:ClientSecret", "test-client-secret");
    }
}

public sealed class GitHubAuthTests(GitHubEnabledFactory factory) : IClassFixture<GitHubEnabledFactory>
{
    [Fact]
    public async Task GitHub_sign_in_redirects_to_github_and_back_to_the_api()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.Contains("\"gitHub\":true", await client.GetStringAsync("/api/auth/providers"));

        var challenge = await client.GetAsync("/api/auth/github?returnUrl=%2Fstats");
        Assert.Equal(HttpStatusCode.Redirect, challenge.StatusCode);
        var location = challenge.Headers.Location!.ToString();
        Assert.StartsWith("https://github.com/login/oauth/authorize?", location);
        Assert.Contains("client_id=test-client-id", location);
        Assert.Contains(Uri.EscapeDataString("/api/auth/github/callback"), location);
        Assert.Contains("user%3Aemail", location);
    }

    [Fact]
    public async Task Completing_without_a_github_identity_goes_back_to_sign_in()
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var complete = await client.GetAsync("/api/auth/github/complete?returnUrl=%2F%2Fevil.example");
        Assert.Equal("/login?error=github", complete.Headers.Location!.ToString());
    }

    [Theory]
    [InlineData("/stats", "/stats")]
    [InlineData("//evil.example", "/")]
    [InlineData(@"/\evil.example", "/")]
    [InlineData("https://evil.example", "/")]
    [InlineData(null, "/")]
    public void Return_urls_stay_on_this_site(string? input, string expected) =>
        Assert.Equal(expected, Focus.Api.Auth.AuthSetup.LocalPath(input));
}
