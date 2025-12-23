# Bitcoin Lending Protocol Contracts

Smart contracts for a Stacks testnet lending protocol. The system includes a lending pool with collateralized borrowing, a simple price oracle, governance with timelocked execution, and an on-chain passkey signer demo.

## Contracts

- `contracts/lending-pool.clar`
  - Core pool: deposit, withdraw, add-collateral, borrow, repay
  - Interest accrual uses `stacks-block-time`
  - Liquidation uses `contract-hash?` verification and `restrict-assets?` safety checks
  - Admin controls: pause and set admin
- `contracts/oracle/price-oracle.clar`
  - Admin-updated prices with freshness checks
  - Price history for auditability
  - Human-readable status via `to-ascii?`
- `contracts/governance/protocol-governance.clar`
  - Proposal creation, voting, and timelocked execution
  - Quorum and threshold checks
  - Contract upgrade verification via `contract-hash?`
- `contracts/auth/passkey-signer.clar`
  - Passkey registration and multi-passkey management
  - On-chain signature verification stub for `secp256r1-verify`
  - Human-readable challenge messages
- `contracts/liquidators/simple-liquidator.clar`
  - Implements `liquidator-trait` and returns liquidation bonus
- Traits
  - `contracts/traits/lending-pool-trait.clar`
  - `contracts/traits/liquidator-trait.clar`
- Utilities
  - `contracts/utils/math-helpers.clar`

## Key Parameters (Lending Pool)

- Collateral ratio: 150%
- Liquidation threshold: 120%
- Liquidation bonus: 10%
- Interest rate: 5% annual (bps)

## Read-Only Methods (Lending Pool)

- `get-total-deposits`, `get-total-borrows`
- `get-user-deposit`, `get-user-collateral`, `get-user-loan`
- `get-health-factor`, `get-loan-status-ascii`

## Governance Flow

1. `create-proposal` (requires balance >= proposal threshold)
2. `vote` during voting period
3. `execute-proposal` after voting + timelock

## Oracle Flow

1. `update-price` by admin
2. `get-price` or `get-fresh-price` for consumers
3. `get-price-status` for readability

## Passkey Signer Notes

`secp256r1-verify` calls are stubbed to always succeed for now. Replace the stub assertions with the real verification call once the function is available in your target chain.

## Deployment Plans

Deployment order and sender expectations are defined in:

- `deployments/default.testnet-plan.yaml`
- `deployments/default.simnet-plan.yaml`

Use these plans with your preferred Clarinet workflow to publish all contracts in order.

## Tests

Run unit tests:

```sh
npm test
```

Generate coverage and costs:

```sh
npm run test:report
```

## Testnet Defaults (Frontend)

The frontend reads testnet defaults from `frontend/.env.local`:

- `VITE_CONTRACT_DEPLOYER`
- `VITE_LENDING_POOL_CONTRACT`
- `VITE_PRICE_ORACLE_CONTRACT`
- `VITE_GOVERNANCE_CONTRACT`
- `VITE_PASSKEY_CONTRACT`
