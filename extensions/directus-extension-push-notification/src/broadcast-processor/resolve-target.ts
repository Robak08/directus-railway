import type { BroadcastTarget, TargetUser } from "./_types.js";

export type { TargetUser, BroadcastTarget };
export type TargetType = BroadcastTarget["target_type"];

interface UsersService {
  readByQuery: (query: Record<string, unknown>) => Promise<TargetUser[]>;
}

const TARGET_USER_FIELDS = ["id", "push_enabled", "language"];

function extractRoleIds(
  targetRoles?: Array<{ directus_roles_id: string } | string>,
): string[] {
  if (!targetRoles?.length) return [];
  return targetRoles.map((role) =>
    typeof role === "string" ? role : role.directus_roles_id,
  );
}

function extractUserIds(
  targetUsers?: Array<{ directus_users_id: string } | string>,
): string[] {
  if (!targetUsers?.length) return [];
  return targetUsers.map((user) =>
    typeof user === "string" ? user : user.directus_users_id,
  );
}

export async function resolveTargetUsers(
  broadcast: BroadcastTarget,
  usersService: UsersService,
): Promise<TargetUser[]> {
  const baseQuery = {
    fields: TARGET_USER_FIELDS,
    limit: -1,
  };

  switch (broadcast.target_type) {
    case "all":
      return usersService.readByQuery({
        ...baseQuery,
        filter: { status: { _eq: "active" } },
      });

    case "roles": {
      const roleIds = extractRoleIds(broadcast.target_roles);
      if (roleIds.length === 0) return [];

      return usersService.readByQuery({
        ...baseQuery,
        filter: {
          status: { _eq: "active" },
          role: { _in: roleIds },
        },
      });
    }

    case "users": {
      const userIds = extractUserIds(broadcast.target_users);
      if (userIds.length === 0) return [];

      return usersService.readByQuery({
        ...baseQuery,
        filter: {
          id: { _in: userIds },
        },
      });
    }

    case "filter":
      return usersService.readByQuery({
        ...baseQuery,
        filter: broadcast.target_filter ?? {},
      });

    default:
      throw new Error(`Invalid target_type: ${broadcast.target_type}`);
  }
}
