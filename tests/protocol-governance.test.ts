import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

function getAddress(name: string): string {
  const address = simnet.getAccounts().get(name);
  if (!address) throw new Error(`Missing account: ${name}`);
  return address;
}

describe("protocol-governance-v2", () => {
  it("creates proposals and records votes", () => {
    const proposer = getAddress("wallet_1");
    const voter = getAddress("wallet_2");

    const create = simnet.callPublicFn(
      "protocol-governance-v2",
      "create-proposal",
      [
        Cl.stringAscii("Upgrade"),
        Cl.stringAscii("Add new liquidation rules"),
        Cl.none(),
      ],
      proposer,
    );
    const createJson = cvToJSON(create.result);
    expect(createJson.success).toBe(true);
    const proposalId = BigInt(createJson.value.value);

    const vote = simnet.callPublicFn(
      "protocol-governance-v2",
      "vote",
      [Cl.uint(proposalId), Cl.bool(true)],
      voter,
    );
    expect(vote.result).toBeOk(Cl.bool(true));

    const doubleVote = simnet.callPublicFn(
      "protocol-governance-v2",
      "vote",
      [Cl.uint(proposalId), Cl.bool(true)],
      voter,
    );
    expect(doubleVote.result).toBeErr(Cl.uint(602));

    const userVote = simnet.callReadOnlyFn(
      "protocol-governance-v2",
      "get-user-vote",
      [Cl.uint(proposalId), Cl.principal(voter)],
      voter,
    );
    const voteJson = cvToJSON(userVote.result);
    expect(voteJson.success).toBe(true);
    expect(voteJson.value.value).not.toBeNull();
  });

  it("enforces timelock and proposer-only cancellation", () => {
    const proposer = getAddress("wallet_3");
    const stranger = getAddress("wallet_4");

    const create = simnet.callPublicFn(
      "protocol-governance-v2",
      "create-proposal",
      [
        Cl.stringAscii("Param change"),
        Cl.stringAscii("Adjust collateral ratio"),
        Cl.none(),
      ],
      proposer,
    );
    const createJson = cvToJSON(create.result);
    expect(createJson.success).toBe(true);
    const proposalId = BigInt(createJson.value.value);

    const executeEarly = simnet.callPublicFn(
      "protocol-governance-v2",
      "execute-proposal",
      [Cl.uint(proposalId)],
      proposer,
    );
    expect(executeEarly.result).toBeErr(Cl.uint(604));

    const cancelByStranger = simnet.callPublicFn(
      "protocol-governance-v2",
      "cancel-proposal",
      [Cl.uint(proposalId)],
      stranger,
    );
    expect(cancelByStranger.result).toBeErr(Cl.uint(600));

    const cancel = simnet.callPublicFn(
      "protocol-governance-v2",
      "cancel-proposal",
      [Cl.uint(proposalId)],
      proposer,
    );
    expect(cancel.result).toBeOk(Cl.bool(true));
  });
});

