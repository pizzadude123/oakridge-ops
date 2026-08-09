import type { StaffRole } from "./access";

export function canManageExperienceRecord(role: StaffRole, actorId: string, ownerId: string) {
  return role === "administrator" || actorId === ownerId;
}

export function nextCrisisUpdateNumber(updates: ReadonlyArray<{ updateNumber: number }>) {
  return updates.reduce((highest, update) => Math.max(highest, update.updateNumber), 0) + 1;
}
