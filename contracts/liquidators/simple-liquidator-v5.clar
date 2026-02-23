;; ==========================
;; Implements the liquidator trait and works with the lending pool
;; This contract is verified by the lending pool using contract-hash?

(impl-trait .liquidator-trait-v5.liquidator-trait-v5)

;; Constants
(define-constant LIQUIDATION-BONUS-BPS u1000) ;; 10% bonus
(define-constant err-liquidation-failed (err u500))
(define-constant err-insufficient-funds (err u501))

;; Event to log liquidations
(define-event liquidation-executed
  (borrower principal)
  (debt-amount uint)
  (total-paid uint)
)

;; Implement liquidate function from trait
(define-public (liquidate
        (borrower principal)
        (debt-amount uint)
    )
    (let (
            ;; Calculate total amount needed (debt + bonus)
            (total-needed (+ debt-amount (/ (* debt-amount LIQUIDATION-BONUS-BPS) u10000)))
        )
        ;; Validate inputs
        (asserts! (> debt-amount u0) err-liquidation-failed)
        (asserts! (> total-needed u0) err-liquidation-failed)

        ;; Emit liquidation event
        (emit-event liquidation-executed
          borrower
          debt-amount
          total-needed
        )

        ;; Return the amount that will be received (debt + bonus)
        (ok total-needed)
    )
)

;; Get liquidation bonus
(define-public (get-liquidation-bonus)
    (ok LIQUIDATION-BONUS-BPS)
)

;; Check if a position can be liquidated
;; Note: This is a simplified check - in production, this would:
;; 1. Query the lending pool for the borrower's health factor
;; 2. Check with price oracle for asset prices
;; 3. Verify liquidation is profitable
(define-public (can-liquidate (borrower principal))
    ;; For now, return true - actual check should be done by calling lending pool
    ;; This function exists to satisfy the trait interface
    (ok true)
)

;; Read-only version of liquidation bonus
(define-read-only (get-bonus-amount (debt uint))
    (ok (/ (* debt LIQUIDATION-BONUS-BPS) u10000))
)
