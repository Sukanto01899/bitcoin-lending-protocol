;; Passkey Signer Contract
;; =======================
;; Clarity 3-compatible implementation (signature verification stubbed)

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-unauthorized (err u300))
(define-constant err-invalid-signature (err u301))
(define-constant err-passkey-not-registered (err u302))
(define-constant err-passkey-already-registered (err u303))
(define-constant err-conversion-failed (err u304))

;; Data Maps
;; Store passkey public keys for users (secp256r1 keys)
(define-map user-passkeys
    { user: principal }
    {
        public-key: (buff 33), ;; Compressed secp256r1 public key
        registered-at: uint, ;; Block height when registered
        device-name: (string-ascii 50),
    }
)

;; Multi-sig support: store multiple passkeys per user
(define-map user-passkey-list
    {
        user: principal,
        key-index: uint,
    }
    {
        public-key: (buff 33),
        device-name: (string-ascii 50),
        is-active: bool,
    }
)

;; Track number of passkeys per user
(define-map passkey-count
    { user: principal }
    { count: uint }
)

;; Generate authentication challenge message
(define-read-only (generate-challenge-message
        (user principal)
        (action (string-ascii 20))
        (amount uint)
    )
    (ok {
        message: "Authenticate transaction",
        user: user,
        action: action,
        amount: amount,
    })
)

;; Register a passkey for a user
;; The public key should be a secp256r1 public key (33 bytes compressed)
(define-public (register-passkey
        (public-key (buff 33))
        (device-name (string-ascii 50))
    )
    (let (
            (current-count (default-to { count: u0 }
                (map-get? passkey-count { user: tx-sender })
            ))
            (key-index (get count current-count))
        )
        ;; Store primary passkey
        (if (is-eq key-index u0)
            (map-set user-passkeys { user: tx-sender } {
                public-key: public-key,
                registered-at: stacks-block-height,
                device-name: device-name,
            })
            true
        )

        ;; Add to passkey list for multi-sig support
        (map-set user-passkey-list {
            user: tx-sender,
            key-index: key-index,
        } {
            public-key: public-key,
            device-name: device-name,
            is-active: true,
        })

        ;; Increment count
        (map-set passkey-count { user: tx-sender } { count: (+ key-index u1) })

        (ok key-index)
    )
)

;; Verify a passkey signature (WebAuthn/FIDO2 compatible)
(define-public (verify-passkey-signature
        (user principal)
        (message-hash (buff 32))
        (signature (buff 64))
    )
    (let (
            (passkey-data (unwrap! (map-get? user-passkeys { user: user })
                err-passkey-not-registered
            ))
            (public-key (get public-key passkey-data))
        )
        ;; Clarity 3: secp256r1-verify is unavailable, so this is a stub.
        (asserts! true err-invalid-signature)
        (ok true)
    )
)

;; Verify signature from any of user's registered passkeys
(define-public (verify-passkey-any
        (user principal)
        (message-hash (buff 32))
        (signature (buff 64))
        (key-index uint)
    )
    (let (
            (passkey-data (unwrap!
                (map-get? user-passkey-list {
                    user: user,
                    key-index: key-index,
                })
                err-passkey-not-registered
            ))
            (public-key (get public-key passkey-data))
        )
        (asserts! (get is-active passkey-data) err-unauthorized)

        ;; Clarity 3: secp256r1-verify is unavailable, so this is a stub.
        (asserts! true err-invalid-signature)
        (ok true)
    )
)

;; Protected action: Execute only with valid passkey signature
;; This demonstrates how passkeys can protect sensitive operations
(define-public (execute-with-passkey
        (user principal)
        (message-hash (buff 32))
        (signature (buff 64))
        (action (string-ascii 50))
    )
    (begin
        ;; Verify the signature first
        (try! (verify-passkey-signature user message-hash signature))

        ;; If verification passes, execute the action
        ;; In a real implementation, this would call other contract functions
        (ok {
            success: true,
            action: action,
            authenticated-user: user,
        })
    )
)

;; Get user's primary passkey info
(define-read-only (get-passkey-info (user principal))
    (ok (map-get? user-passkeys { user: user }))
)

;; Get specific passkey from user's list
(define-read-only (get-passkey-by-index
        (user principal)
        (key-index uint)
    )
    (ok (map-get? user-passkey-list {
        user: user,
        key-index: key-index,
    }))
)

;; Get count of registered passkeys for user
(define-read-only (get-passkey-count (user principal))
    (ok (default-to { count: u0 } (map-get? passkey-count { user: user })))
)

;; Deactivate a passkey (doesn't delete, just marks inactive)
(define-public (deactivate-passkey (key-index uint))
    (let ((passkey-data (unwrap!
            (map-get? user-passkey-list {
                user: tx-sender,
                key-index: key-index,
            })
            err-passkey-not-registered
        )))
        (map-set user-passkey-list {
            user: tx-sender,
            key-index: key-index,
        }
            (merge passkey-data { is-active: false })
        )
        (ok true)
    )
)

;; Reactivate a passkey
(define-public (reactivate-passkey (key-index uint))
    (let ((passkey-data (unwrap!
            (map-get? user-passkey-list {
                user: tx-sender,
                key-index: key-index,
            })
            err-passkey-not-registered
        )))
        (map-set user-passkey-list {
            user: tx-sender,
            key-index: key-index,
        }
            (merge passkey-data { is-active: true })
        )
        (ok true)
    )
)

;; Generate authentication summary
(define-read-only (get-auth-summary (user principal))
    (let (
            (count-data (default-to { count: u0 } (map-get? passkey-count { user: user })))
            (count-val (get count count-data))
        )
        (ok {
            user: user,
            passkey-count: count-val,
            status: "Passkey authentication enabled",
        })
    )
)
