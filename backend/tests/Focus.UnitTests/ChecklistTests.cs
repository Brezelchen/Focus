using Focus.Application.Common;
using Focus.Application.Tasks;
using Focus.Application.Templates;
using Focus.Domain.Entities;

namespace Focus.UnitTests;

public sealed class ChecklistTests : IDisposable
{
    private readonly TestApp _app = new();

    public void Dispose() => _app.Dispose();

    [Fact]
    public async Task Checklist_items_can_be_added_ticked_and_removed()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Pack", Subtasks: ["Passport", "  ", "Charger"]));
        Assert.Equal(["Passport", "Charger"], task.Subtasks.Select(s => s.Title)); // blank lines dropped

        task = await _app.Tasks.AddSubtaskAsync(task.Id, new AddSubtaskRequest("  Socks "));
        Assert.Equal(["Passport", "Charger", "Socks"], task.Subtasks.Select(s => s.Title));

        var charger = task.Subtasks[1];
        task = await _app.Tasks.UpdateSubtaskAsync(task.Id, charger.Id, new UpdateSubtaskRequest(IsDone: true));
        Assert.True(task.Subtasks.Single(s => s.Id == charger.Id).IsDone);
        Assert.Equal("Charger", task.Subtasks.Single(s => s.Id == charger.Id).Title); // title untouched

        task = await _app.Tasks.DeleteSubtaskAsync(task.Id, task.Subtasks[0].Id);
        Assert.Equal(["Charger", "Socks"], task.Subtasks.Select(s => s.Title));
    }

    [Fact]
    public async Task Updating_a_task_replaces_its_checklist_in_order_and_keeps_ids()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Pack", Subtasks: ["A", "B", "C"]));
        var (a, c) = (task.Subtasks[0], task.Subtasks[2]);

        var updated = await _app.Tasks.UpdateAsync(task.Id, new UpdateTaskRequest(
            "Pack", null, null, Priority.Normal, null,
            Subtasks: [new SubtaskInput(c.Id, "C!", true), new SubtaskInput(null, "D"), new SubtaskInput(a.Id, "A")]));

        Assert.Equal(["C!", "D", "A"], updated.Subtasks.Select(s => s.Title));
        Assert.Equal(c.Id, updated.Subtasks[0].Id);
        Assert.True(updated.Subtasks[0].IsDone);
        Assert.Equal(a.Id, updated.Subtasks[2].Id);
        Assert.DoesNotContain(updated.Subtasks, s => s.Title == "B");
    }

    [Fact]
    public async Task Updating_without_a_checklist_keeps_it()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Pack", Subtasks: ["A"]));
        var updated = await _app.Tasks.UpdateAsync(task.Id, new UpdateTaskRequest("Pack up", null, null, Priority.Normal, null));
        Assert.Equal(["A"], updated.Subtasks.Select(s => s.Title));
    }

    [Fact]
    public async Task Subtasks_of_another_task_are_not_found()
    {
        var a = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", Subtasks: ["x"]));
        var b = await _app.Tasks.CreateAsync(new CreateTaskRequest("B"));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            _app.Tasks.UpdateSubtaskAsync(b.Id, a.Subtasks[0].Id, new UpdateSubtaskRequest(IsDone: true)));
    }

    [Fact]
    public async Task Blank_checklist_titles_are_rejected()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("A"));
        await Assert.ThrowsAsync<ValidationException>(() => _app.Tasks.AddSubtaskAsync(task.Id, new AddSubtaskRequest("   ")));
    }

    [Fact]
    public async Task Templates_carry_the_checklist_into_new_tasks_unticked()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("Laundry", Subtasks: ["Wash", "Dry", "Fold"]));
        await _app.Tasks.UpdateSubtaskAsync(task.Id, task.Subtasks[0].Id, new UpdateSubtaskRequest(IsDone: true));

        var template = await _app.Templates.CreateFromTaskAsync(task.Id);
        Assert.Equal(["Wash", "Dry", "Fold"], template.Checklist);

        var copy = await _app.Templates.InstantiateAsync(template.Id, new InstantiateTemplateRequest(_app.Clock.Today));
        Assert.Equal(["Wash", "Dry", "Fold"], copy.Subtasks.Select(s => s.Title));
        Assert.All(copy.Subtasks, s => Assert.False(s.IsDone));

        var edited = await _app.Templates.UpdateAsync(template.Id, new SaveTemplateRequest("Laundry", Checklist: ["Wash"]));
        Assert.Equal(["Wash"], edited.Checklist);
        var kept = await _app.Templates.UpdateAsync(template.Id, new SaveTemplateRequest("Laundry!"));
        Assert.Equal(["Wash"], kept.Checklist); // null checklist = unchanged
    }

    [Fact]
    public async Task Deleting_a_task_deletes_its_checklist()
    {
        var task = await _app.Tasks.CreateAsync(new CreateTaskRequest("A", Subtasks: ["x", "y"]));
        await _app.Tasks.DeleteAsync(task.Id);
        Assert.Empty(_app.Db.Subtasks);
    }
}
