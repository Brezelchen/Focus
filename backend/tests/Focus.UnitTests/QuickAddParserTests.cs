using Focus.Application.Tasks;
using Focus.Domain.Entities;

namespace Focus.UnitTests;

public class QuickAddParserTests
{
    [Fact]
    public void Parses_all_tokens_and_keeps_the_rest_as_title()
    {
        var r = QuickAddParser.Parse("Write report #work ~45m !high");

        Assert.Equal("Write report", r.Title);
        Assert.Equal("work", r.TagName);
        Assert.Equal(45, r.EstimateMinutes);
        Assert.Equal(Priority.High, r.Priority);
    }

    [Theory]
    [InlineData("~45", 45)]
    [InlineData("~45m", 45)]
    [InlineData("~1h", 60)]
    [InlineData("~1.5h", 90)]
    [InlineData("~1,5h", 90)]
    [InlineData("~1h30m", 90)]
    [InlineData("~1h30", 90)]
    [InlineData("~2H", 120)]
    public void Parses_estimates(string token, int minutes) =>
        Assert.Equal(minutes, QuickAddParser.Parse($"Task {token}").EstimateMinutes);

    [Theory]
    [InlineData("!!", Priority.High)]
    [InlineData("!h", Priority.High)]
    [InlineData("!LOW", Priority.Low)]
    [InlineData("!n", Priority.Normal)]
    public void Parses_priorities(string token, Priority expected) =>
        Assert.Equal(expected, QuickAddParser.Parse($"{token} Task").Priority);

    [Fact]
    public void Tokens_can_appear_anywhere_and_only_the_first_of_each_kind_is_used()
    {
        var r = QuickAddParser.Parse("#home Clean #kitchen ~20m now ~10m");

        Assert.Equal("Clean #kitchen now ~10m", r.Title);
        Assert.Equal("home", r.TagName);
        Assert.Equal(20, r.EstimateMinutes);
    }

    [Theory]
    [InlineData("Read ~0m", "Read ~0m")]
    [InlineData("C# basics", "C# basics")]
    [InlineData("Wow! great", "Wow! great")]
    [InlineData("Plan ~25h", "Plan ~25h")]
    public void Leaves_non_matching_tokens_in_the_title(string input, string title)
    {
        var r = QuickAddParser.Parse(input);
        Assert.Equal(title, r.Title);
    }

    // 2026-11-25 is a Wednesday.
    [Theory]
    [InlineData("@today", "2026-11-25")]
    [InlineData("@tomorrow", "2026-11-26")]
    [InlineData("@tmr", "2026-11-26")]
    [InlineData("@wed", "2026-11-25")]
    [InlineData("@fri", "2026-11-27")]
    [InlineData("@Monday", "2026-11-30")]
    [InlineData("@nextweek", "2026-11-30")]
    [InlineData("@24.12", "2026-12-24")]
    [InlineData("@24.12.", "2026-12-24")]
    [InlineData("@3.1", "2027-01-03")]
    [InlineData("@1.2.2027", "2027-02-01")]
    [InlineData("@2027-03-15", "2027-03-15")]
    public void Parses_due_dates(string token, string expected)
    {
        var r = QuickAddParser.Parse($"Pay rent {token} #home", new DateOnly(2026, 11, 25));

        Assert.Equal(DateOnly.Parse(expected), r.DueDate);
        Assert.Equal("Pay rent", r.Title);
    }

    [Theory]
    [InlineData("Email @anna")]
    [InlineData("Meet @ 5")]
    [InlineData("Fix @32.13")]
    public void Unknown_at_tokens_stay_in_the_title(string input)
    {
        var r = QuickAddParser.Parse(input, new DateOnly(2026, 11, 25));

        Assert.Null(r.DueDate);
        Assert.Equal(input, r.Title);
    }

    [Fact]
    public void Plain_text_has_no_metadata()
    {
        var r = QuickAddParser.Parse("  Call   mom  ");

        Assert.Equal("Call mom", r.Title);
        Assert.Null(r.TagName);
        Assert.Null(r.EstimateMinutes);
        Assert.Null(r.Priority);
    }
}
