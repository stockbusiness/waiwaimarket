import { describe, expect, it } from "vitest";

import { assertStripeSecretKey } from "@/lib/payments/secret-key";
import { ConfigurationError } from "@/lib/supabase/env";

const VAR = "STRIPE_SECRET_KEY";

describe("assertStripeSecretKey", () => {
  it("シークレットキーは通す", () => {
    expect(assertStripeSecretKey(VAR, "sk_test_51AbCdEf")).toBe("sk_test_51AbCdEf");
  });

  it("制限付きキーも通す", () => {
    expect(assertStripeSecretKey(VAR, "rk_test_51AbCdEf")).toBe("rk_test_51AbCdEf");
  });

  it("公開可能キーを取り違えていたら弾く", () => {
    expect(() => assertStripeSecretKey(VAR, "pk_test_51AbCdEf")).toThrow(ConfigurationError);
  });

  it("公開可能キーのときは変数名と対処方法を伝える", () => {
    try {
      assertStripeSecretKey(VAR, "pk_test_51AbCdEf");
      throw new Error("例外が投げられませんでした");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const configurationError = error as ConfigurationError;
      expect(configurationError.variableName).toBe(VAR);
      expect(configurationError.message).toContain("公開可能キー");
      expect(configurationError.message).toContain("sk_");
    }
  });

  it("判別できない形式は通す。キーの有効性を決めるのは Stripe 側", () => {
    expect(assertStripeSecretKey(VAR, "whsec_abc")).toBe("whsec_abc");
  });
});
