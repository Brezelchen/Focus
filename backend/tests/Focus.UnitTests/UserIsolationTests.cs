using Focus.Application.Common;
using Focus.Application.Days;
using Focus.Application.Tags;
using Focus.Application.Tasks;
using Focus.Domain.Entities;

namespace Focus.UnitTests;

public sealed class UserIsolationTests : IDisposable
{
    private readonly TestApp _app = new();
    private DateOnly Today => _app.Clock.Today;

    public void Dispose() => _app.Dispose();

    /// <summary>Acts as another user, as a new request would (fresh change tracker).</summary>
    private void SwitchTo(int userId)
    {
        _app.Db.ChangeTracker.Clear();
        _app.User.UserId = userId;
    }

    [Fact]
    public async Task Users_only_see_and_change_their_own_data()
    {
        var alice = _app.User.UserId!.Value;
        var aliceTask = await _app.Tasks.QuickAddAsync(new QuickAddRequest("Alice's report #work", Today));
        await _app.Tasks.CompleteAsync(aliceTask.Id);
        await _app.Tasks.QuickAddAsync(new QuickAddRequest("Alice's backlog item"));
        await _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(Mood.Great, "Alice's day"));

        SwitchTo(_app.AddUser("Bob"));

        var day = await _app.Days.GetDayAsync(Today);
        Assert.Empty(day.Tasks);
        Assert.Equal(0, day.Planned);
        Assert.Null(day.Note);
        Assert.Empty(await _app.Tasks.GetBacklogAsync(null, null));
        Assert.Empty(await _app.Tags.GetAllAsync());
        Assert.Equal(0, (await _app.Stats.GetInsightsAsync()).TotalDone);

        await Assert.ThrowsAsync<NotFoundException>(() => _app.Tasks.GetAsync(aliceTask.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Tasks.DeleteAsync(aliceTask.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => _app.Tags.DeleteAsync(aliceTask.Tag!.Id));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            _app.Tasks.CreateAsync(new CreateTaskRequest("Uses Alice's tag", TagId: aliceTask.Tag!.Id)));

        // Same tag name and the same day's reflection are fine for a different user.
        var bobTag = await _app.Tags.CreateAsync(new SaveTagRequest("work"));
        await _app.Days.SaveNoteAsync(Today, new SaveDayNoteRequest(Mood.Meh, "Bob's day"));

        SwitchTo(alice);
        Assert.Equal("Alice's day", (await _app.Days.GetDayAsync(Today)).Note?.Reflection);
        Assert.DoesNotContain(await _app.Tags.GetAllAsync(), t => t.Id == bobTag.Id);
        Assert.Single((await _app.Days.GetDayAsync(Today)).Tasks);
    }

    [Fact]
    public async Task Saving_without_a_signed_in_user_fails()
    {
        _app.User.UserId = null;
        await Assert.ThrowsAsync<InvalidOperationException>(() => _app.Tags.CreateAsync(new SaveTagRequest("orphan")));
    }
}
