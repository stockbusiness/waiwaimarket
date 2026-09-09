import { describe, expect, it } from "vitest";

import type { TenantStatus } from "@/lib/supabase/database.types";
import {
  approvalBlockers,
  canApprove,
  canTransition,
  isTenantReviewAction,
  nextStatus,
  requiresHqAdmin,
  TENANT_REVIEW_ACTIONS,
} from "@/lib/tenants/status";

const ALL_STATUSES: TenantStatus[] = [
  "applied",
  "under_review",
  "approved",
  "suspended",
  "rejected",
];

describe("状態遷移", () => {
  it("申請済みからは審査開始のみ", () => {
    const allowed = TENANT_REVIEW_ACTIONS.filter((a) => canTransition("applied", a));
    expect(allowed).toEqual(["start_review"]);
  });

  it("差し戻しからは再審査に戻せる", () => {
    expect(canTransition("rejected", "start_review")).toBe(true);
  });

  it("審査中からのみ承認・差戻しができる", () => {
    expect(canTransition("under_review", "approve")).toBe(true);
    expect(canTransition("under_review", "reject")).toBe(true);
    for (const status of ALL_STATUSES.filter((s) => s !== "under_review")) {
      expect(canTransition(status, "approve")).toBe(false);
    }
  });

  it("申請済みからいきなり承認できない", () => {
    // docs/01 4.3：本部の審査を経ずに出店させない
    expect(canTransition("applied", "approve")).toBe(false);
  });

  it("停止は承認済みからのみ、解除は停止中からのみ", () => {
    expect(canTransition("approved", "suspend")).toBe(true);
    expect(canTransition("suspended", "reinstate")).toBe(true);
    expect(canTransition("suspended", "suspend")).toBe(false);
    expect(canTransition("approved", "reinstate")).toBe(false);
  });

  it("遷移後の状態", () => {
    expect(nextStatus("approve")).toBe("approved");
    expect(nextStatus("reject")).toBe("rejected");
    expect(nextStatus("suspend")).toBe("suspended");
    expect(nextStatus("reinstate")).toBe("approved");
    expect(nextStatus("start_review")).toBe("under_review");
  });

  it("停止と解除だけ本部管理者を要する", () => {
    expect(requiresHqAdmin("suspend")).toBe(true);
    expect(requiresHqAdmin("reinstate")).toBe(true);
    expect(requiresHqAdmin("approve")).toBe(false);
    expect(requiresHqAdmin("start_review")).toBe(false);
  });

  it("未知の操作名を通さない", () => {
    expect(isTenantReviewAction("delete")).toBe(false);
    expect(isTenantReviewAction("approve")).toBe(true);
  });
});

describe("承認の前提条件", () => {
  const ready = {
    stripeAccountId: "acct_1",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    hasLegalProfile: true,
  };

  it("すべて揃えば承認できる", () => {
    expect(approvalBlockers(ready)).toEqual([]);
    expect(canApprove(ready)).toBe(true);
  });

  it("Stripe 未作成なら理由は 1 つにまとまる", () => {
    const blockers = approvalBlockers({ ...ready, stripeAccountId: null });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain("Stripe 連結アカウント");
  });

  it("決済受付と出金をそれぞれ見る", () => {
    expect(approvalBlockers({ ...ready, stripeChargesEnabled: false })).toHaveLength(1);
    expect(approvalBlockers({ ...ready, stripePayoutsEnabled: false })).toHaveLength(1);
    expect(
      approvalBlockers({ ...ready, stripeChargesEnabled: false, stripePayoutsEnabled: false }),
    ).toHaveLength(2);
  });

  it("事業者情報が無ければ承認できない", () => {
    expect(canApprove({ ...ready, hasLegalProfile: false })).toBe(false);
  });
});
