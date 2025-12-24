import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

function getAddress(name: string): string {
  const address = simnet.getAccounts().get(name);
  if (!address) throw new Error(`Missing account: ${name}`);
  return address;
}

describe("simple-liquidator-v2", () => {
  it("calculates liquidation bonus and supports the trait", () => {
    const caller = getAddress("wallet_1");

    const liquidate = simnet.callPublicFn(
      "simple-liquidator-v2",
      "liquidate",
      [Cl.principal(caller), Cl.uint(10_000)],
      caller,
    );
    expect(liquidate.result).toBeOk(Cl.uint(11_000));

    const bonus = simnet.callPublicFn("simple-liquidator-v2", "get-liquidation-bonus", [], caller);
    expect(bonus.result).toBeOk(Cl.uint(1000));

    const canLiquidate = simnet.callPublicFn(
      "simple-liquidator-v2",
      "can-liquidate",
      [Cl.principal(caller)],
      caller,
    );
    expect(canLiquidate.result).toBeOk(Cl.bool(true));

    const bonusReadOnly = simnet.callReadOnlyFn(
      "simple-liquidator-v2",
      "get-bonus-amount",
      [Cl.uint(10_000)],
      caller,
    );
    expect(bonusReadOnly.result).toBeOk(Cl.uint(1000));
  });
});

