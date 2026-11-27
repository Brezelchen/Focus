using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Focus.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tasks_PlannedDate_Status_SortOrder",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tags_Name",
                table: "Tags");

            migrationBuilder.DropIndex(
                name: "IX_FocusSessions_Date",
                table: "FocusSessions");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DayNotes",
                table: "DayNotes");

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Templates",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Tasks",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Tags",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "FocusSessions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Id",
                table: "DayNotes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0)
                .Annotation("Sqlite:Autoincrement", true);

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "DayNotes",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_DayNotes",
                table: "DayNotes",
                column: "Id");

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 254, nullable: true),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: true),
                    GitHubId = table.Column<long>(type: "INTEGER", nullable: true),
                    GitHubLogin = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    AvatarUrl = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastSignInAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Templates_UserId",
                table: "Templates",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_UserId_PlannedDate_Status_SortOrder",
                table: "Tasks",
                columns: new[] { "UserId", "PlannedDate", "Status", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Tags_UserId_Name",
                table: "Tags",
                columns: new[] { "UserId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FocusSessions_UserId_Date",
                table: "FocusSessions",
                columns: new[] { "UserId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_DayNotes_UserId_Date",
                table: "DayNotes",
                columns: new[] { "UserId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_GitHubId",
                table: "Users",
                column: "GitHubId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_DayNotes_Users_UserId",
                table: "DayNotes",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_FocusSessions_Users_UserId",
                table: "FocusSessions",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Tags_Users_UserId",
                table: "Tags",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Tasks_Users_UserId",
                table: "Tasks",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Templates_Users_UserId",
                table: "Templates",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DayNotes_Users_UserId",
                table: "DayNotes");

            migrationBuilder.DropForeignKey(
                name: "FK_FocusSessions_Users_UserId",
                table: "FocusSessions");

            migrationBuilder.DropForeignKey(
                name: "FK_Tags_Users_UserId",
                table: "Tags");

            migrationBuilder.DropForeignKey(
                name: "FK_Tasks_Users_UserId",
                table: "Tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_Templates_Users_UserId",
                table: "Templates");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Templates_UserId",
                table: "Templates");

            migrationBuilder.DropIndex(
                name: "IX_Tasks_UserId_PlannedDate_Status_SortOrder",
                table: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_Tags_UserId_Name",
                table: "Tags");

            migrationBuilder.DropIndex(
                name: "IX_FocusSessions_UserId_Date",
                table: "FocusSessions");

            migrationBuilder.DropPrimaryKey(
                name: "PK_DayNotes",
                table: "DayNotes");

            migrationBuilder.DropIndex(
                name: "IX_DayNotes_UserId_Date",
                table: "DayNotes");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Templates");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Tags");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "FocusSessions");

            migrationBuilder.DropColumn(
                name: "Id",
                table: "DayNotes");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "DayNotes");

            migrationBuilder.AddPrimaryKey(
                name: "PK_DayNotes",
                table: "DayNotes",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_PlannedDate_Status_SortOrder",
                table: "Tasks",
                columns: new[] { "PlannedDate", "Status", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Tags_Name",
                table: "Tags",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FocusSessions_Date",
                table: "FocusSessions",
                column: "Date");
        }
    }
}
