import { describe, it, expect, vi } from "vitest";
import { resolveTargetUsers } from "../../src/broadcast-processor/resolve-target.js";
import type { TargetUser } from "../../src/broadcast-processor/_types.js";

function createUsersService(users: TargetUser[]) {
  return {
    readByQuery: vi.fn().mockResolvedValue(users),
  };
}

describe("resolveTargetUsers", () => {
  const activeUsers: TargetUser[] = [
    { id: "user-1", push_enabled: true, language: "en-US" },
    { id: "user-2", push_enabled: false, language: "pt-BR" },
  ];

  it('returns all active users when target_type is "all"', async () => {
    const usersService = createUsersService(activeUsers);

    const result = await resolveTargetUsers(
      { target_type: "all" },
      usersService,
    );

    expect(result).toEqual(activeUsers);
    expect(usersService.readByQuery).toHaveBeenCalledWith({
      fields: ["id", "push_enabled", "language"],
      limit: -1,
      filter: { status: { _eq: "active" } },
    });
  });

  it('returns users with matching roles when target_type is "roles"', async () => {
    const usersService = createUsersService([activeUsers[0]]);
    const roleId = "role-admin";

    const result = await resolveTargetUsers(
      {
        target_type: "roles",
        target_roles: [{ directus_roles_id: roleId }],
      },
      usersService,
    );

    expect(result).toEqual([activeUsers[0]]);
    expect(usersService.readByQuery).toHaveBeenCalledWith({
      fields: ["id", "push_enabled", "language"],
      limit: -1,
      filter: {
        status: { _eq: "active" },
        role: { _in: [roleId] },
      },
    });
  });

  it('returns specific users when target_type is "users"', async () => {
    const usersService = createUsersService([activeUsers[1]]);

    const result = await resolveTargetUsers(
      {
        target_type: "users",
        target_users: ["user-2"],
      },
      usersService,
    );

    expect(result).toEqual([activeUsers[1]]);
    expect(usersService.readByQuery).toHaveBeenCalledWith({
      fields: ["id", "push_enabled", "language"],
      limit: -1,
      filter: {
        id: { _in: ["user-2"] },
      },
    });
  });

  it('applies custom filter when target_type is "filter"', async () => {
    const usersService = createUsersService(activeUsers);
    const targetFilter = {
      status: { _eq: "active" },
      email: { _contains: "@example.com" },
    };

    const result = await resolveTargetUsers(
      {
        target_type: "filter",
        target_filter: targetFilter,
      },
      usersService,
    );

    expect(result).toEqual(activeUsers);
    expect(usersService.readByQuery).toHaveBeenCalledWith({
      fields: ["id", "push_enabled", "language"],
      limit: -1,
      filter: targetFilter,
    });
  });

  it("includes id, push_enabled, and language in requested fields", async () => {
    const usersService = createUsersService(activeUsers);

    await resolveTargetUsers({ target_type: "all" }, usersService);

    expect(usersService.readByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: ["id", "push_enabled", "language"],
      }),
    );
  });

  it("throws for invalid target_type", async () => {
    const usersService = createUsersService([]);

    await expect(
      resolveTargetUsers(
        { target_type: "invalid" as "all" },
        usersService,
      ),
    ).rejects.toThrow("Invalid target_type: invalid");
  });

  it('returns empty array when roles target has no roles', async () => {
    const usersService = createUsersService(activeUsers);

    const result = await resolveTargetUsers(
      { target_type: "roles", target_roles: [] },
      usersService,
    );

    expect(result).toEqual([]);
    expect(usersService.readByQuery).not.toHaveBeenCalled();
  });
});
