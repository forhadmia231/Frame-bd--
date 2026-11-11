export const rolePermissions = {
  USER: ["profile:own", "watchlist:own", "history:own", "rating:own"],
  ADMIN: [
    "profile:own",
    "watchlist:own",
    "history:own",
    "rating:own",
    "catalog:manage",
    "subscriptions:read",
    "audit:read",
  ],
  SUPER_ADMIN: [
    "profile:own",
    "watchlist:own",
    "history:own",
    "rating:own",
    "catalog:manage",
    "subscriptions:read",
    "audit:read",
    "roles:manage",
    "settings:manage",
  ],
} as const;
