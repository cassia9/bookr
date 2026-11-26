import { decideExistingInvitationMember } from "./member-invitation.ts"

function assertEquals<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    )
  }
}

const deletedMember = {
  id: "50000000-0000-4000-8000-000000000001",
  email: "member@example.test",
  store_id: "60000000-0000-4000-8000-000000000001",
  deleted_at: "2026-11-05T00:00:00.000Z",
}

Deno.test("沒有既有成員時建立新帳號", () => {
  assertEquals(
    decideExistingInvitationMember([], deletedMember.store_id),
    { kind: "create" },
  )
})

Deno.test("同店已刪除成員會重新啟用", () => {
  assertEquals(
    decideExistingInvitationMember([deletedMember], deletedMember.store_id),
    { kind: "reactivate", member: deletedMember },
  )
})

Deno.test("同店有效成員不會被邀請流程覆蓋", () => {
  assertEquals(
    decideExistingInvitationMember(
      [{ ...deletedMember, deleted_at: null }],
      deletedMember.store_id,
    ),
    { kind: "already_active" },
  )
})

Deno.test("不同店家的既有帳號不會被移轉", () => {
  assertEquals(
    decideExistingInvitationMember(
      [deletedMember],
      "60000000-0000-4000-8000-000000000002",
    ),
    { kind: "store_conflict" },
  )
})

Deno.test("同信箱多筆成員資料時停止處理", () => {
  assertEquals(
    decideExistingInvitationMember(
      [deletedMember, {
        ...deletedMember,
        id: "50000000-0000-4000-8000-000000000002",
      }],
      deletedMember.store_id,
    ),
    { kind: "ambiguous" },
  )
})
