;; Lending Pool Contract
;; =====================
;; Clarity 3 implementation (mirrors behavior without Clarity 4-only features)
;; - uses stacks-block-height for interest accrual timing
;; - manual liquidator allowlist (no contract-hash?)
;; - returns numeric loan status fields (no to-ascii?)

;; Import traits
(use-trait liquidator-trait-v2 .liquidator-trait-v2.liquidator-trait-v2)

;; Constants
;; Note: contract-owner should be set via set-admin after deployment
(define-constant CONTRACT-ADDRESS .lending-pool-v2)
(define-constant err-owner-only (err u400))
(define-constant err-insufficient-balance (err u401))
(define-constant err-insufficient-collateral (err u402))
(define-constant err-loan-not-found (err u403))
(define-constant err-position-healthy (err u404))
(define-constant err-invalid-amount (err u405))
(define-constant err-contract-verification-failed (err u406))
(define-constant err-asset-restriction-failed (err u407))
(define-constant err-paused (err u408))
(define-constant err-conversion-failed (err u409))

;; Protocol Parameters
(define-constant COLLATERAL-RATIO u150) ;; 150% = 1.5x collateralization required
(define-constant LIQUIDATION-THRESHOLD u120) ;; 120% = liquidate below this
(define-constant LIQUIDATION-BONUS u10) ;; 10% bonus for liquidators
(define-constant INTEREST-RATE-BPS u500) ;; 5% annual interest (500 basis points)
(define-constant MIN-HEALTH-FACTOR u120) ;; Minimum health factor before liquidation
(define-constant BLOCKS-PER-YEAR u52560)

;; Data Variables
(define-data-var protocol-paused bool false)
(define-data-var total-deposits uint u0)
(define-data-var total-borrows uint u0)
(define-data-var admin principal tx-sender)

;; Verified liquidator contracts (manual allowlist)
(define-data-var verified-liquidator (optional principal) none)

;; User Data Maps
(define-map user-deposits
    { user: principal }
    {
        amount: uint,
        deposit-time: uint, ;; Track using block height
    }
)

(define-map user-collateral
    { user: principal }
    {
        amount: uint,
        asset: (string-ascii 10),
    }
)

(define-map user-loans
    { user: principal }
    {
        principal-amount: uint,
        interest-accrued: uint,
        borrow-time: uint, ;; Using block height
        last-interest-update: uint, ;; Track last interest calculation
    }
)

;; Verify and register a liquidator contract
(define-public (register-verified-liquidator (liquidator principal))
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-owner-only)
        (var-set verified-liquidator (some liquidator))
        (ok liquidator)
    )
)

;; Verify a liquidator contract before allowing it to execute
(define-private (is-liquidator-verified (liquidator principal))
    (match (var-get verified-liquidator)
        allowed (is-eq allowed liquidator)
        false
    )
)

;; Deposit STX into the pool
(define-public (deposit (amount uint))
    (let ((current-deposit (default-to {
            amount: u0,
            deposit-time: stacks-block-height,
        }
            (map-get? user-deposits { user: tx-sender })
        )))
        (asserts! (not (var-get protocol-paused)) err-paused)
        (asserts! (> amount u0) err-invalid-amount)

        ;; Transfer STX to contract
        (try! (stx-transfer? amount tx-sender CONTRACT-ADDRESS))

        ;; Update deposit with current block height
        (map-set user-deposits { user: tx-sender } {
            amount: (+ (get amount current-deposit) amount),
            deposit-time: stacks-block-height,
        })

        ;; Update total deposits
        (var-set total-deposits (+ (var-get total-deposits) amount))

        (ok true)
    )
)

;; Withdraw STX from the pool
(define-public (withdraw (amount uint))
    (let (
            (user-deposit (unwrap! (map-get? user-deposits { user: tx-sender })
                err-insufficient-balance
            ))
            (recipient tx-sender)
        )
        (asserts! (not (var-get protocol-paused)) err-paused)
        (asserts! (>= (get amount user-deposit) amount) err-insufficient-balance)

        ;; Update user deposit
        (map-set user-deposits { user: tx-sender } {
            amount: (- (get amount user-deposit) amount),
            deposit-time: (get deposit-time user-deposit),
        })

        ;; Transfer STX back to user from contract
        (try! (as-contract (stx-transfer? amount tx-sender recipient)))

        ;; Update total deposits
        (var-set total-deposits (- (var-get total-deposits) amount))

        (ok true)
    )
)

;; Calculate accrued interest based on time elapsed
(define-read-only (calculate-current-interest (user principal))
    (match (map-get? user-loans { user: user })
        loan-data (let (
                (last-update (get last-interest-update loan-data))
                (time-elapsed (if (> stacks-block-height last-update)
                    (- stacks-block-height last-update)
                    u0
                ))
                (principal-amt (get principal-amount loan-data))
                ;; Calculate interest: (principal * rate * blocks) / (blocks-per-year * 10000)
                (new-interest (if (> time-elapsed u0)
                    (/ (* (* principal-amt INTEREST-RATE-BPS) time-elapsed)
                        (* BLOCKS-PER-YEAR u10000)
                    )
                    u0
                ))
            )
            (ok (+ (get interest-accrued loan-data) new-interest))
        )
        (ok u0)
    )
)

;; Borrow against collateral
(define-public (borrow (amount uint))
    (let (
            (recipient tx-sender)
            (user-coll (unwrap! (map-get? user-collateral { user: tx-sender })
                err-insufficient-collateral
            ))
            (current-collateral (get amount user-coll))
            (max-borrow (/ (* current-collateral u100) COLLATERAL-RATIO))
            (existing-loan (map-get? user-loans { user: tx-sender }))
            (current-debt (match existing-loan
                loan (+ (get principal-amount loan)
                    (unwrap-panic (calculate-current-interest tx-sender))
                )
                u0
            ))
        )
        (asserts! (not (var-get protocol-paused)) err-paused)
        (asserts! (<= (+ current-debt amount) max-borrow)
            err-insufficient-collateral
        )

        ;; Create/update loan with block height timestamp
        ;; If existing loan, preserve original borrow-time, otherwise use current time
        (let ((original-borrow-time (match existing-loan
                loan (get borrow-time loan)
                stacks-block-height
            )))
            (map-set user-loans { user: tx-sender } {
                principal-amount: (+ current-debt amount),
                interest-accrued: u0, ;; Interest is now part of principal
                borrow-time: original-borrow-time,
                last-interest-update: stacks-block-height,
            })
        )

        ;; Transfer borrowed amount from contract
        (try! (as-contract (stx-transfer? amount tx-sender recipient)))

        ;; Update total borrows
        (var-set total-borrows (+ (var-get total-borrows) amount))

        (ok true)
    )
)

;; Add collateral to enable borrowing
(define-public (add-collateral
        (amount uint)
        (asset (string-ascii 10))
    )
    (let ((current-coll (default-to {
            amount: u0,
            asset: "STX",
        }
            (map-get? user-collateral { user: tx-sender })
        )))
        (asserts! (not (var-get protocol-paused)) err-paused)
        (asserts! (> amount u0) err-invalid-amount)

        ;; Transfer collateral to contract
        (try! (stx-transfer? amount tx-sender CONTRACT-ADDRESS))

        ;; Update collateral
        (map-set user-collateral { user: tx-sender } {
            amount: (+ (get amount current-coll) amount),
            asset: asset,
        })

        (ok true)
    )
)

;; Repay loan
(define-public (repay (amount uint))
    (let (
            (loan-data (unwrap! (map-get? user-loans { user: tx-sender }) err-loan-not-found))
            (current-interest (unwrap-panic (calculate-current-interest tx-sender)))
            (total-debt (+ (get principal-amount loan-data) current-interest))
        )
        (asserts! (not (var-get protocol-paused)) err-paused)
        (asserts! (<= amount total-debt) err-invalid-amount)

        ;; Transfer repayment
        (try! (stx-transfer? amount tx-sender CONTRACT-ADDRESS))

        ;; Update loan
        (if (>= amount total-debt)
            ;; Full repayment - delete loan
            (begin
                (map-delete user-loans { user: tx-sender })
                (var-set total-borrows (- (var-get total-borrows) total-debt))
            )
            ;; Partial repayment - update loan
            (begin
                (map-set user-loans { user: tx-sender } {
                    principal-amount: (- total-debt amount),
                    interest-accrued: u0,
                    borrow-time: (get borrow-time loan-data),
                    last-interest-update: stacks-block-height,
                })
                (var-set total-borrows (- (var-get total-borrows) amount))
            )
        )

        (ok true)
    )
)

;; Liquidate undercollateralized position
(define-public (liquidate
        (borrower principal)
        (liquidator <liquidator-trait-v2>)
    )
    (let (
            (loan-data (unwrap! (map-get? user-loans { user: borrower }) err-loan-not-found))
            (collateral-data (unwrap! (map-get? user-collateral { user: borrower })
                err-loan-not-found
            ))
            (total-debt (+ (get principal-amount loan-data)
                (unwrap-panic (calculate-current-interest borrower))
            ))
            (collateral-value (get amount collateral-data))
            (health-factor (if (is-eq total-debt u0)
                u0
                (/ (* collateral-value u100) total-debt)
            ))
            (liquidation-amount (+ total-debt (/ (* total-debt LIQUIDATION-BONUS) u100)))
        )
        (asserts! (not (var-get protocol-paused)) err-paused)

        ;; Check if position is unhealthy
        (asserts! (< health-factor MIN-HEALTH-FACTOR) err-position-healthy)

        ;; Verify liquidator contract using allowlist
        (asserts! (is-liquidator-verified (contract-of liquidator))
            err-contract-verification-failed
        )

        (let ((liquidator-contract (contract-of liquidator)))
            (asserts! (<= liquidation-amount collateral-value)
                err-asset-restriction-failed
            )

            ;; Call liquidator
            (try! (contract-call? liquidator liquidate borrower total-debt))

            ;; Transfer collateral to liquidator (with bonus)
            (try! (as-contract (stx-transfer? liquidation-amount tx-sender (contract-of liquidator))))

            ;; Clear borrower's loan
            (map-delete user-loans { user: borrower })

            ;; Clear borrower's collateral
            (map-delete user-collateral { user: borrower })

            ;; Update total borrows
            (var-set total-borrows (- (var-get total-borrows) total-debt))

            (ok true)
        )
    )
)

;; Calculate health factor for a user
(define-read-only (get-health-factor (user principal))
    (match (map-get? user-loans { user: user })
        loan-data (match (map-get? user-collateral { user: user })
            coll-data (let (
                    (total-debt (+ (get principal-amount loan-data)
                        (unwrap-panic (calculate-current-interest user))
                    ))
                    (collateral-value (get amount coll-data))
                )
                (if (is-eq total-debt u0)
                    (ok u0)
                    (ok (/ (* collateral-value u100) total-debt))
                )
            )
            (ok u0)
        )
        (ok u0)
    )
)

;; Get loan status
(define-read-only (get-loan-status-ascii (user principal))
    (match (map-get? user-loans { user: user })
        loan-data (let (
                (principal-amt (get principal-amount loan-data))
                (interest-amt (unwrap-panic (calculate-current-interest user)))
                (health (unwrap-panic (get-health-factor user)))
                (status (if (< health MIN-HEALTH-FACTOR)
                    "LIQUIDATABLE"
                    "HEALTHY"
                ))
            )
            (ok {
                principal: principal-amt,
                interest: interest-amt,
                health-factor: health,
                status: status,
            })
        )
        (ok {
            principal: u0,
            interest: u0,
            health-factor: u0,
            status: "NO_LOAN",
        })
    )
)

;; Read-only functions
(define-read-only (get-user-deposit (user principal))
    (ok (map-get? user-deposits { user: user }))
)

(define-read-only (get-user-collateral (user principal))
    (ok (map-get? user-collateral { user: user }))
)

(define-read-only (get-user-loan (user principal))
    (ok (map-get? user-loans { user: user }))
)

(define-read-only (get-total-deposits)
    (ok (var-get total-deposits))
)

(define-read-only (get-total-borrows)
    (ok (var-get total-borrows))
)

;; Admin functions
(define-public (set-paused (paused bool))
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-owner-only)
        (var-set protocol-paused paused)
        (ok true)
    )
)

(define-public (set-admin (new-admin principal))
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-owner-only)
        (var-set admin new-admin)
        (ok true)
    )
)

