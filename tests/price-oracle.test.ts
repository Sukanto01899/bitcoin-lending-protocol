import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

function getAddress(name: string): string {
  const address = simnet.getAccounts().get(name);
  if (!address) throw new Error(`Missing account: ${name}`);
  return address;
}

describe("price-oracle", () => {
  it("returns initial prices and status", () => {
    const user = getAddress("wallet_1");

    const price = simnet.callReadOnlyFn(
      "price-oracle",
      "get-price",
      [Cl.stringAscii("sBTC")],
      user,
    );
    expect(price.result).toBeOk(Cl.uint(50_000_000_000));

    const status = simnet.callReadOnlyFn(
      "price-oracle",
      "get-price-status",
      [Cl.stringAscii("sBTC")],
      user,
    );
    const statusJson = cvToJSON(status.result);
    expect(statusJson.success).toBe(true);
    expect(statusJson.value.value).toContain("ACTIVE");
  });

  it("updates prices with admin access", () => {
    const admin = getAddress("deployer");
    const user = getAddress("wallet_2");

    const update = simnet.callPublicFn(
      "price-oracle",
      "update-price",
      [Cl.stringAscii("sBTC"), Cl.uint(55_000_000_000), Cl.stringAscii("test-feed")],
      admin,
    );
    expect(update.result).toBeOk(Cl.bool(true));

    const price = simnet.callReadOnlyFn(
      "price-oracle",
      "get-price",
      [Cl.stringAscii("sBTC")],
      user,
    );
    expect(price.result).toBeOk(Cl.uint(55_000_000_000));

    const updateDenied = simnet.callPublicFn(
      "price-oracle",
      "update-price",
      [Cl.stringAscii("sBTC"), Cl.uint(60_000_000_000), Cl.stringAscii("rogue")],
      user,
    );
    expect(updateDenied.result).toBeErr(Cl.uint(200));
  });
});
