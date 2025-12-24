import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

function getAddress(name: string): string {
  const address = simnet.getAccounts().get(name);
  if (!address) throw new Error(`Missing account: ${name}`);
  return address;
}

describe("math-helpers-v2", () => {
  it("computes percentages, health factor, and bonuses", () => {
    const caller = getAddress("wallet_1");

    const percentage = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "calculate-percentage",
      [Cl.uint(200), Cl.uint(25)],
      caller,
    );
    expect(percentage.result).toBeOk(Cl.uint(50));

    const health = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "calculate-health-factor",
      [Cl.uint(150), Cl.uint(100)],
      caller,
    );
    expect(health.result).toBeOk(Cl.uint(150));

    const bonus = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "apply-liquidation-bonus",
      [Cl.uint(10_000), Cl.uint(1000)],
      caller,
    );
    expect(bonus.result).toBeOk(Cl.uint(11_000));
  });

  it("handles interest math and safety helpers", () => {
    const caller = getAddress("wallet_1");

    const interest = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "calculate-interest",
      [Cl.uint(10_000), Cl.uint(31_536_000), Cl.uint(10)],
      caller,
    );
    expect(interest.result).toBeOk(Cl.uint(10));

    const compound = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "calculate-compound-interest",
      [Cl.uint(10_000), Cl.uint(36_500), Cl.uint(5)],
      caller,
    );
    expect(compound.result).toBeOk(Cl.uint(500));

    const safeMul = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "safe-mul",
      [Cl.uint(2), Cl.uint(3)],
      caller,
    );
    expect(safeMul.result).toBeOk(Cl.uint(6));

    const safeDiv = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "safe-div",
      [Cl.uint(10), Cl.uint(2)],
      caller,
    );
    expect(safeDiv.result).toBeOk(Cl.uint(5));

    const safeDivZero = simnet.callReadOnlyFn(
      "math-helpers-v2",
      "safe-div",
      [Cl.uint(10), Cl.uint(0)],
      caller,
    );
    expect(safeDivZero.result).toBeErr(Cl.uint(101));
  });
});

