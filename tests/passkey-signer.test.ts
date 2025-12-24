import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

function getAddress(name: string): string {
  const address = simnet.getAccounts().get(name);
  if (!address) throw new Error(`Missing account: ${name}`);
  return address;
}

describe("passkey-signer-v2", () => {
  it("registers passkeys and exposes metadata", () => {
    const user = getAddress("wallet_2");
    const publicKey = new Uint8Array(33).fill(1);

    const register = simnet.callPublicFn(
      "passkey-signer-v2",
      "register-passkey",
      [Cl.buffer(publicKey), Cl.stringAscii("laptop")],
      user,
    );
    expect(register.result).toBeOk(Cl.uint(0));

    const count = simnet.callReadOnlyFn(
      "passkey-signer-v2",
      "get-passkey-count",
      [Cl.principal(user)],
      user,
    );
    const countJson = cvToJSON(count.result);
    expect(countJson.success).toBe(true);
    expect(countJson.value.value.count.value).toBe("1");

    const info = simnet.callReadOnlyFn(
      "passkey-signer-v2",
      "get-passkey-info",
      [Cl.principal(user)],
      user,
    );
    const infoJson = cvToJSON(info.result);
    expect(infoJson.success).toBe(true);
    expect(infoJson.value.value).not.toBeNull();
    expect(infoJson.value.value.value["device-name"].value).toBe("laptop");
  });

  it("verifies passkey signatures and handles inactive keys", () => {
    const user = getAddress("wallet_3");
    const publicKey = new Uint8Array(33).fill(2);
    const messageHash = new Uint8Array(32).fill(9);
    const signature = new Uint8Array(64).fill(7);

    const verifyMissing = simnet.callPublicFn(
      "passkey-signer-v2",
      "verify-passkey-signature",
      [Cl.principal(user), Cl.buffer(messageHash), Cl.buffer(signature)],
      user,
    );
    expect(verifyMissing.result).toBeErr(Cl.uint(302));

    const register = simnet.callPublicFn(
      "passkey-signer-v2",
      "register-passkey",
      [Cl.buffer(publicKey), Cl.stringAscii("phone")],
      user,
    );
    expect(register.result).toBeOk(Cl.uint(0));

    const verify = simnet.callPublicFn(
      "passkey-signer-v2",
      "verify-passkey-signature",
      [Cl.principal(user), Cl.buffer(messageHash), Cl.buffer(signature)],
      user,
    );
    expect(verify.result).toBeOk(Cl.bool(true));

    const deactivate = simnet.callPublicFn(
      "passkey-signer-v2",
      "deactivate-passkey",
      [Cl.uint(0)],
      user,
    );
    expect(deactivate.result).toBeOk(Cl.bool(true));

    const verifyInactive = simnet.callPublicFn(
      "passkey-signer-v2",
      "verify-passkey-any",
      [Cl.principal(user), Cl.buffer(messageHash), Cl.buffer(signature), Cl.uint(0)],
      user,
    );
    expect(verifyInactive.result).toBeErr(Cl.uint(300));

    const reactivate = simnet.callPublicFn(
      "passkey-signer-v2",
      "reactivate-passkey",
      [Cl.uint(0)],
      user,
    );
    expect(reactivate.result).toBeOk(Cl.bool(true));

    const verifyActive = simnet.callPublicFn(
      "passkey-signer-v2",
      "verify-passkey-any",
      [Cl.principal(user), Cl.buffer(messageHash), Cl.buffer(signature), Cl.uint(0)],
      user,
    );
    expect(verifyActive.result).toBeOk(Cl.bool(true));
  });
});

