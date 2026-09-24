# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript + Vite application for recovering BSV (Bitcoin SV) funds from wallets that may no longer be online. It derives addresses from a mnemonic phrase, scans for UTXOs, and creates BRC-100 compatible ingest transactions to sweep funds into a local wallet.

**Security Context:** This tool handles sensitive cryptographic material (mnemonic phrases, PINs, private keys). The application is designed to run locally to prevent exposure of these secrets. Never log, store, or transmit mnemonic phrases or private keys unnecessarily.

## Commands

```bash
npm run dev        # dev server (port 5173)
npm run build      # typecheck + production build
npm run lint
npm test           # vitest unit tests (src/**/*.test.ts) + legacy tsx signing scripts
npm run test:unit  # vitest only
```

## Architecture

UI-free logic lives in `src/lib`; React panels in `src/components`; shared state in `src/state.ts` (context) owned by `src/App.tsx`.

- [src/lib/derive.ts](src/lib/derive.ts) — wallet presets and **derivation templates** (`m/44'/0'/0'/{chain}/{index}`; `{chain}` optional), mnemonic generation/validation, `rootFromMnemonic` (PIN = BIP39 passphrase), `deriveKey`, address validation.
- [src/lib/net.ts](src/lib/net.ts) — WhatsOnChain + GorillaPool clients. WoC calls go through a serial rate limiter (~3 req/s) and `withRetry`; failures throw. Broadcast is never retried.
- [src/lib/tokens.ts](src/lib/tokens.ts) — ordinal/token protection. `protectedSet` pages the 1Sat indexer with **both** `bsv20=false` and `bsv20=true` (BSV-20 outputs are hidden otherwise); `filterSpendable` also drops every 1-sat output.
- [src/lib/scan.ts](src/lib/scan.ts) — gap-limit discovery over templates × chains; aborts on any API failure.
- [src/lib/tx.ts](src/lib/tx.ts) — local P2PKH build/sign (Send and sweep-to-address). Verifies each source tx pays a plain P2PKH output of the reported value before signing; guards against `tx.fee()` silently dropping change when funds are short.
- [src/lib/brc100.ts](src/lib/brc100.ts) — sweep into a BRC-100 wallet: BEEF → `createAction` → sign inputs (SIGHASH_ALL) → `signAction`.
- [src/lib/vault.ts](src/lib/vault.ts) — AES-GCM/PBKDF2 backup; also restores SatoFinder (`satofinder-aes-gcm-v2`) files.
- [src/hooks/useAutoLock.ts](src/hooks/useAutoLock.ts) — wipes the session after 10 min idle / 60 s hidden; deferred while a task holds `beginBusy()`.

Panels are keyed on an `epoch` counter in `App.tsx`; loading, clearing or locking a wallet bumps it so every panel remounts and drops keys, scan results and built transactions.

## Design

Styling follows the BitcoinSV Wallet prototype (`../BitcoinSV Wallet/bitcoinsv-wallet-proto/app/globals.css`): Nunito (bundled via `@fontsource-variable/nunito`), gold `#FFAF00` for the one primary CTA per panel, soft-black ink `#2D2D31` for selection/state (active nav, segmented tabs, switches, next-step buttons), warm paper background, light default with a `.dark` theme toggle. Tokens live at the top of `src/App.css`; icons are `lucide-react`. Use `color-mix(in srgb, …)` for tints — OKLCH mixes with the achromatic card colour interpolate hue and come out pink.

## Important Patterns

- **Every spend must go through `protectedSet` + `filterSpendable`.** Indexer unreachable ⇒ refuse to build; there is no override.
- **Fail closed:** never `break`/continue past a failed lookup in a scan — throw so the user doesn't see a partial scan as complete.
- **Fee validation:** local builds check the final fee against the fee model; BRC-100 sweeps reject > 1000 sat/KB.
- **Mempool-spent UTXOs** are filtered in `api.woc.unspent`.
- **User-facing errors** go to a panel status line via `useTask().run`, which also holds off auto-lock while work is in flight. Status text is rendered as text, never HTML.

### Security Considerations
- Mnemonic, passphrase and derived keys live in React state only; persisted only inside an encrypted vault.
- Secrets are blurred until revealed; copying a secret requires confirmation.
- Explorer/API URLs must be HTTPS.
- SIGHASH_ALL is used for every input.

## BSV SDK Integration

This project heavily uses `@bsv/sdk` primitives:
- `Mnemonic`: BIP39 mnemonic phrase handling
- `HD`: Hierarchical deterministic key derivation
- `PrivateKey`/`PublicKey`: Key management
- `P2PKH`: Pay-to-public-key-hash script templates
- `Transaction`: Transaction construction and signing
- `Beef`: BSV Expanded Format for transaction ancestry
- `WalletClient`: BRC-100 wallet communication

Refer to BSV SDK documentation when modifying transaction construction or key derivation logic.
