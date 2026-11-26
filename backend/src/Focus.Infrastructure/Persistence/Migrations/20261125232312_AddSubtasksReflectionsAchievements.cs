using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Focus.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubtasksReflectionsAchievements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Checklist",
                table: "Templates",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.CreateTable(
                name: "DayNotes",
                columns: table => new
                {
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Mood = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    Reflection = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DayNotes", x => x.Date);
                });

            migrationBuilder.CreateTable(
                name: "Subtasks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    TaskItemId = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    IsDone = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Subtasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Subtasks_Tasks_TaskItemId",
                        column: x => x.TaskItemId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UnlockedAchievements",
                columns: table => new
                {
                    Key = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    UnlockedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UnlockedAchievements", x => x.Key);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Subtasks_TaskItemId_SortOrder",
                table: "Subtasks",
                columns: new[] { "TaskItemId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DayNotes");

            migrationBuilder.DropTable(
                name: "Subtasks");

            migrationBuilder.DropTable(
                name: "UnlockedAchievements");

            migrationBuilder.DropColumn(
                name: "Checklist",
                table: "Templates");
        }
    }
}
