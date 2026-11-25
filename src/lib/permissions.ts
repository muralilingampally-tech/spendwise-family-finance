import type { Role } from "./types";

/**
 * What each role may do. Keep in sync with firestore.rules, which enforces the
 * same split on the server:
 * - admin: everything, including deleting and managing masters and members.
 * - member: add and edit entries, budgets, recurring entries and loans.
 * - viewer: read only.
 */
export type Action = "write" | "delete" | "manageMasters" | "manageMembers";

const ALLOWED: Record<Role, Action[]> = {
  admin: ["write", "delete", "manageMasters", "manageMembers"],
  member: ["write"],
  viewer: [],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && ALLOWED[role].includes(action);
}

export const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Everything, including deleting and managing members" },
  member: { label: "Member", description: "Add and edit entries and budgets; cannot delete" },
  viewer: { label: "Viewer", description: "Can look, cannot change anything" },
};

export const isRole = (value: unknown): value is Role =>
  value === "admin" || value === "member" || value === "viewer";
