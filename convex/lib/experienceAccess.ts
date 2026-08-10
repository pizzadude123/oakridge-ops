import type { StaffRole } from "./access";

export function canManageExperienceRecord(role: StaffRole, actorId: string, ownerId: string) {
  return role === "administrator" || actorId === ownerId;
}

export function nextCrisisUpdateNumber(updates: ReadonlyArray<{ updateNumber: number }>) {
  return updates.reduce((highest, update) => Math.max(highest, update.updateNumber), 0) + 1;
}

export function canLinkCrisisAttachment(
  role: StaffRole,
  viewerId: string,
  attachmentOwnerId: string,
  linkedUpdateId?: string,
  targetUpdateId?: string,
) {
  return canManageExperienceRecord(role, viewerId, attachmentOwnerId)
    && (!linkedUpdateId || linkedUpdateId === targetUpdateId);
}

export function canUseCrisisAttachmentForUpdate(args: {
  role: StaffRole;
  actorId: string;
  attachmentId: string;
  attachmentOwnerId: string;
  attachmentUpdateId?: string;
  targetUpdateId?: string;
  existingAttachmentId?: string;
}) {
  const preservingExistingLink = Boolean(
    args.targetUpdateId
      && args.attachmentUpdateId === args.targetUpdateId
      && args.attachmentId === args.existingAttachmentId,
  );
  return preservingExistingLink || canLinkCrisisAttachment(
    args.role,
    args.actorId,
    args.attachmentOwnerId,
    args.attachmentUpdateId,
    args.targetUpdateId,
  );
}

export function isCrisisAttachmentLinked(updateId: string, attachmentUpdateId?: string) {
  return Boolean(attachmentUpdateId && attachmentUpdateId === updateId);
}

export function isCrisisAttachmentPublic(
  updatePublished: boolean,
  updateId: string,
  attachmentUpdateId: string | undefined,
) {
  return updatePublished && isCrisisAttachmentLinked(updateId, attachmentUpdateId);
}
