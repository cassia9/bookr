export interface ExistingInvitationMember {
  id: string
  email: string
  store_id: string
  deleted_at: string | null
}

export type ExistingInvitationMemberDecision =
  | { kind: "create" }
  | { kind: "reactivate"; member: ExistingInvitationMember }
  | { kind: "already_active" }
  | { kind: "store_conflict" }
  | { kind: "ambiguous" }

export function decideExistingInvitationMember(
  members: ExistingInvitationMember[],
  invitationStoreId: string,
): ExistingInvitationMemberDecision {
  if (members.length === 0) return { kind: "create" }
  if (members.length > 1) return { kind: "ambiguous" }

  const member = members[0]
  if (member.store_id !== invitationStoreId) return { kind: "store_conflict" }
  if (!member.deleted_at) return { kind: "already_active" }

  return { kind: "reactivate", member }
}
