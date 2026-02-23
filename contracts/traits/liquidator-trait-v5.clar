;; Liquidator Trait
;; Enables verified third-party liquidation bots

(define-trait liquidator-trait-v5 (
    (liquidate
        (principal uint)
        (response uint uint)
    )
    (get-liquidation-bonus
        ()
        (response uint uint)
    )
    (can-liquidate
        (principal)
        (response bool uint)
    )
))
