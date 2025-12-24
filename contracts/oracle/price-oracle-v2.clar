;; Price Oracle Contract
;; =====================
;; Clarity 3-compatible implementation (block-height timestamps)

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u200))
(define-constant err-price-stale (err u201))
(define-constant err-invalid-asset (err u202))
(define-constant err-conversion-failed (err u203))

;; Maximum age for price data (approx 24h in 10-min blocks)
(define-constant MAX-PRICE-AGE u144)

;; Data Variables
(define-data-var admin principal contract-owner)

;; Data Maps
;; Store prices with timestamp and source
(define-map prices
    { asset: (string-ascii 10) }
    {
        price: uint,              ;; Price in USD with 6 decimals (e.g., 50000000000 = $50,000.00)
        last-updated: uint,       ;; Block height timestamp
        source: (string-ascii 50) ;; Price feed source identifier
    }
)

;; Price update history for audit trail
(define-map price-history
    { asset: (string-ascii 10), block-height: uint }
    { price: uint, timestamp: uint }
)

;; Initialize Function
;; Set initial prices for main assets
(define-private (initialize)
    (begin
        ;; Using block height for timestamp tracking
        (map-set prices 
            { asset: "sBTC" }
            { 
                price: u50000000000,  ;; $50,000 with 6 decimals
                last-updated: stacks-block-height,
                source: "initialization"
            }
        )
        (map-set prices 
            { asset: "STX" }
            { 
                price: u2000000,      ;; $2.00 with 6 decimals
                last-updated: stacks-block-height,
                source: "initialization"
            }
        )
        true
    )
)

;; Generate human-readable price status message
(define-read-only (get-price-status (asset (string-ascii 10)))
    (let (
        (price-data (unwrap! (map-get? prices { asset: asset }) 
            (ok "Price feed not found")))
        (age (- stacks-block-height (get last-updated price-data)))
        (is-fresh (< age MAX-PRICE-AGE))
    )
        ;; CLARITY 4: Convert status to ASCII for readable output
        (if is-fresh
            (ok "ACTIVE: Price feed is fresh and reliable")
            (ok "STALE: Price feed requires update")
        )
    )
)

;; Get formatted price info
(define-read-only (get-price-info-ascii (asset (string-ascii 10)))
    (match (map-get? prices { asset: asset })
        price-data
            (let (
                (price-val (get price price-data))
                (timestamp-val (get last-updated price-data))
            )
                (ok {
                    asset: asset,
                    price: price-val,
                    last-updated: timestamp-val,
                    source: (get source price-data)
                })
            )
        err-invalid-asset
    )
)

;; Update price with new data
;; Automatically timestamps with block height
(define-public (update-price 
    (asset (string-ascii 10)) 
    (new-price uint) 
    (source (string-ascii 50)))
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-owner-only)
        (asserts! (> new-price u0) err-invalid-asset)
        
        ;; Use block height for timestamp
        (map-set prices
            { asset: asset }
            {
                price: new-price,
                last-updated: stacks-block-height,
                source: source
            }
        )
        
        ;; Store in history (using block-height as key for historical lookup)
        (map-set price-history
            { asset: asset, block-height: stacks-block-height }
            { price: new-price, timestamp: stacks-block-height }
        )
        
        (ok true)
    )
)

;; Get current price for an asset
(define-read-only (get-price (asset (string-ascii 10)))
    (match (map-get? prices { asset: asset })
        price-data (ok (get price price-data))
        err-invalid-asset
    )
)

;; Get price with freshness check
;; Uses block height for staleness detection
(define-read-only (get-fresh-price (asset (string-ascii 10)))
    (let (
        (price-data (unwrap! (map-get? prices { asset: asset }) 
            err-invalid-asset))
        (age (- stacks-block-height (get last-updated price-data)))
    )
        (asserts! (< age MAX-PRICE-AGE) err-price-stale)
        (ok (get price price-data))
    )
)

;; Check if price is fresh
;; Block height enables time-based validation
(define-read-only (is-price-fresh (asset (string-ascii 10)))
    (match (map-get? prices { asset: asset })
        price-data
            (let ((age (- stacks-block-height (get last-updated price-data))))
                (ok (< age MAX-PRICE-AGE))
            )
        (ok false)
    )
)

;; Get price age in seconds
;; Calculate using block height
(define-read-only (get-price-age (asset (string-ascii 10)))
    (match (map-get? prices { asset: asset })
        price-data
            (ok (- stacks-block-height (get last-updated price-data)))
        err-invalid-asset
    )
)

;; Get full price data including timestamp
(define-read-only (get-price-data (asset (string-ascii 10)))
    (ok (map-get? prices { asset: asset }))
)

;; Get historical price at specific block
(define-read-only (get-historical-price 
    (asset (string-ascii 10)) 
    (block-height-val uint))
    (ok (map-get? price-history 
        { asset: asset, block-height: block-height-val }))
)

;; Admin function to change admin
(define-public (set-admin (new-admin principal))
    (begin
        (asserts! (is-eq tx-sender (var-get admin)) err-owner-only)
        (var-set admin new-admin)
        (ok true)
    )
)

;; Initialize the contract
(initialize)
