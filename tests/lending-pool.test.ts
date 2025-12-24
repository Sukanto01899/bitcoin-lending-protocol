import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

function getAddress(name: string): string {
  const address = simnet.getAccounts().get(name);
  if (!address) throw new Error(`Missing account: ${name}`);
  return address;
}

describe("lending-pool-v2", () => {
  it("deposits and withdraws update totals", () => {
    const user = getAddress("wallet_2");
    const depositAmount = 1_000_000;

    const deposit = simnet.callPublicFn(
      "lending-pool-v2",
      "deposit",
      [Cl.uint(depositAmount)],
      user,
    );
    expect(deposit.result).toBeOk(Cl.bool(true));

    const totalDeposits = simnet.callReadOnlyFn("lending-pool-v2", "get-total-deposits", [], user);
    expect(totalDeposits.result).toBeOk(Cl.uint(depositAmount));

    const withdrawAmount = 400_000;
    const withdraw = simnet.callPublicFn(
      "lending-pool-v2",
      "withdraw",
      [Cl.uint(withdrawAmount)],
      user,
    );
    expect(withdraw.result).toBeOk(Cl.bool(true));

    const totalAfterWithdraw = simnet.callReadOnlyFn(
      "lending-pool-v2",
      "get-total-deposits",
      [],
      user,
    );
    expect(totalAfterWithdraw.result).toBeOk(Cl.uint(depositAmount - withdrawAmount));

    const overWithdraw = simnet.callPublicFn(
      "lending-pool-v2",
      "withdraw",
      [Cl.uint(depositAmount)],
      user,
    );
    expect(overWithdraw.result).toBeErr(Cl.uint(401));
  });

  it("borrows against collateral and repays", () => {
    const admin = getAddress("deployer");
    const user = getAddress("wallet_3");

    const poolDeposit = simnet.callPublicFn(
      "lending-pool-v2",
      "deposit",
      [Cl.uint(5_000_000)],
      admin,
    );
    expect(poolDeposit.result).toBeOk(Cl.bool(true));

    const addCollateral = simnet.callPublicFn(
      "lending-pool-v2",
      "add-collateral",
      [Cl.uint(1_500_000), Cl.stringAscii("STX")],
      user,
    );
    expect(addCollateral.result).toBeOk(Cl.bool(true));

    const borrow = simnet.callPublicFn("lending-pool-v2", "borrow", [Cl.uint(1_000_000)], user);
    expect(borrow.result).toBeOk(Cl.bool(true));

    const totalBorrows = simnet.callReadOnlyFn("lending-pool-v2", "get-total-borrows", [], user);
    expect(totalBorrows.result).toBeOk(Cl.uint(1_000_000));

    const repay = simnet.callPublicFn("lending-pool-v2", "repay", [Cl.uint(500_000)], user);
    expect(repay.result).toBeOk(Cl.bool(true));

    const totalAfterRepay = simnet.callReadOnlyFn("lending-pool-v2", "get-total-borrows", [], user);
    expect(totalAfterRepay.result).toBeOk(Cl.uint(500_000));

    const loan = simnet.callReadOnlyFn("lending-pool-v2", "get-user-loan", [Cl.principal(user)], user);
    const loanJson = cvToJSON(loan.result);
    expect(loanJson.success).toBe(true);
    expect(loanJson.value.value).not.toBeNull();
    expect(loanJson.value.value.value["principal-amount"].value).toBe("500000");
  });

  it("reports loan status for users without loans", () => {
    const user = getAddress("wallet_4");
    const status = simnet.callReadOnlyFn(
      "lending-pool-v2",
      "get-loan-status-ascii",
      [Cl.principal(user)],
      user,
    );
    expect(status.result).toBeOk(
      Cl.tuple({
        principal: Cl.uint(0),
        interest: Cl.uint(0),
        "health-factor": Cl.uint(0),
        status: Cl.stringAscii("NO_LOAN"),
      }),
    );
  });

  it("prevents liquidation for healthy positions", () => {
    const admin = getAddress("deployer");
    const borrower = getAddress("wallet_5");

    const poolDeposit = simnet.callPublicFn(
      "lending-pool-v2",
      "deposit",
      [Cl.uint(3_000_000)],
      admin,
    );
    expect(poolDeposit.result).toBeOk(Cl.bool(true));

    const addCollateral = simnet.callPublicFn(
      "lending-pool-v2",
      "add-collateral",
      [Cl.uint(1_500_000), Cl.stringAscii("STX")],
      borrower,
    );
    expect(addCollateral.result).toBeOk(Cl.bool(true));

    const borrow = simnet.callPublicFn("lending-pool-v2", "borrow", [Cl.uint(1_000_000)], borrower);
    expect(borrow.result).toBeOk(Cl.bool(true));

    const liquidator = Cl.contractPrincipal(admin, "simple-liquidator-v2");
    const liquidation = simnet.callPublicFn(
      "lending-pool-v2",
      "liquidate",
      [Cl.principal(borrower), liquidator],
      admin,
    );
    expect(liquidation.result).toBeErr(Cl.uint(404));
  });

  it("restricts admin-only controls", () => {
    const admin = getAddress("deployer");
    const user = getAddress("wallet_2");

    const notOwner = simnet.callPublicFn("lending-pool-v2", "set-paused", [Cl.bool(true)], user);
    expect(notOwner.result).toBeErr(Cl.uint(400));

    const ownerPause = simnet.callPublicFn("lending-pool-v2", "set-paused", [Cl.bool(true)], admin);
    expect(ownerPause.result).toBeOk(Cl.bool(true));

    const ownerResume = simnet.callPublicFn("lending-pool-v2", "set-paused", [Cl.bool(false)], admin);
    expect(ownerResume.result).toBeOk(Cl.bool(true));
  });
});

