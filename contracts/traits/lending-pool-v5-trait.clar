;; Lending Pool Trait

(define-trait lending-pool-v4-trait (
    (deposit
        (uint)
        (response bool uint)
    )
    (withdraw
        (uint)
        (response bool uint)
    )
    (borrow
        (uint)
        (response bool uint)
    )
    (repay
        (uint)
        (response bool uint)
    )
    (get-collateral
        (principal)
        (response uint uint)
    )
    (get-debt
        (principal)
        (response uint uint)
    )
    (get-interest-rate
        ()
        (response uint uint)
    )
))
