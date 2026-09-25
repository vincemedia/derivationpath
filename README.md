# Mnemonic to BRC-100

This tool helps recover funds from Bitcoin SV (BSV) wallets that may no longer be online by deriving addresses from a mnemonic phrase, checking for unspent transaction outputs (UTXOs), and creating an ingest transaction compatible with BRC-100 wallets.

**Important Security Note:**  
For maximum security, we strongly recommend running this tool locally on your own machine. This ensures that your mnemonic phrase and PIN never leave your device. If you use a hosted copy, you must trust whoever runs it not to capture or misuse your sensitive information. Running locally eliminates this trust requirement and is the safer option when dealing with private keys and funds recovery.

## Features
- **Wallet & derivation**: import a 12–24 word BIP39 phrase (with optional PIN / BIP39 passphrase) or generate a new one. Pick a wallet preset (Centbee, RockWallet, BIP44, MoneyButton, Twetch, ElectrumSV, Exodus, RelayX, Keevo, Atomic, SimplyCash, BIP32) or type any template such as `m/44'/0'/0'/{chain}/{index}`. Shows address, public key, fingerprint and (behind a confirm) the WIF and mnemonic.
- **Recover**: gap-limit discovery across receive and change chains, on one template or every known preset at once. Sweep the funded UTXOs into a local **BRC-100 wallet** (Metanet Desktop) or to **any BSV address**.
- **Send**: build, review and broadcast a signed P2PKH transaction from the selected address, including "send entire balance".
- **Tokens**: read-only list of 1Sat ordinals and BSV-20 balances at the selected address.
- **History**: transactions across a window of derived addresses.
- **Backup**: AES-GCM (PBKDF2-SHA256, 310k iterations) encrypted backup, saved in the browser or downloaded.
- **Settings**: WhatsOnChain API base, explorer URL and fee rate.

### Safety rails
- **Ordinal/token protection:** every spend checks GorillaPool's 1Sat indexer, including BSV-20 outputs and paged results. Flagged outputs and every 1-sat output are left untouched. If the indexer is unreachable, no transaction is built.
- **Source verification:** before signing, each input's source transaction is checked to be a plain P2PKH output of the reported value to the derived address, so an inscription or a misreported amount is refused.
- **Fail closed:** API calls are rate-limited and retried; a scan that can't reach the API aborts instead of reporting a partial result as complete.
- **Auto-lock:** keys are wiped after 10 minutes idle or 60 seconds with the tab hidden. With a browser backup saved, unlock with its password.
- Mnemonics and keys are never sent to any API and never written to storage unencrypted.

## Prerequisites
- Node.js (version 18 or later)
- npm (comes with Node.js)

## Installation and Running Locally

1. Clone the repository:
   ```
   git clone https://github.com/vincemedia/derivationpath.git
   cd derivationpath
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173` (or the port shown in the terminal).

The app will now be running locally, and you can use it securely without sending data to any external servers.

## Usage

1. On **Wallet**, choose the preset for the wallet that created the phrase, enter the mnemonic and PIN/passphrase (leave blank if none) and click **Import / derive**.
2. On **Recover**, click **Scan for UTXOs**. If you are not sure which wallet made the phrase, choose **Every known wallet preset**.
3. Review the funded addresses, untick any you want to leave, and pick a destination:
   - **Local BRC-100 wallet**: Metanet Desktop must be running. The wallet assigns the outputs and broadcasts.
   - **Any BSV address**: build the consolidated transaction, review it, then broadcast.
4. A link to the transaction on WhatsOnChain is shown. Results are cleared so the same coins can't be swept twice.

**Warning:** Handle your mnemonic and PIN with extreme care. Exposure can lead to loss of funds. Always verify addresses and transactions before broadcasting.

## Derivation templates

A template is a BIP32 path with `{index}` and, optionally, `{chain}` (0 = receive, 1 = change). `'` (or `h`) marks a hardened level.

| Wallet | Template |
| --- | --- |
| Centbee | `m/44'/0/0/{index}` |
| RockWallet | `m/0'/0/{index}` |
| BIP44 default, MoneyButton, Twetch | `m/44'/0'/0'/{chain}/{index}` |
| ElectrumSV, Exodus, RelayX, Keevo | `m/44'/236'/0'/{chain}/{index}` |
| Atomic, SimplyCash | `m/44'/145'/0'/{chain}/{index}` |
| BIP32 basic | `m/0'/{chain}'/{index}'` |
| Legacy prefixes from earlier versions of this tool | `m/44'/236'/0'/{index}`, `m/44'/0'/0'/{index}` |

If no funds are found, scan **Every known wallet preset**, raise the gap limit, or enter a custom template from your wallet's documentation.

## Development
This project is built with React, TypeScript, and Vite.
```
npm run build      # production build
npm run lint
npm test           # vitest unit tests + legacy signing scripts
```
Core logic lives in `src/lib` (derivation, network, token protection, transaction building, vault) and is UI-free; panels live in `src/components`.

## Disclaimer

See also the Terms of Use in the app (the "Terms of Use" link in the footer, or `#terms`).

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY AND NON-INFRINGEMENT. YOU USE IT ENTIRELY AT YOUR OWN RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE AUTHORS, CONTRIBUTORS, COPYRIGHT HOLDERS OR ANYONE HOSTING THIS SOFTWARE BE LIABLE FOR ANY CLAIM, LOSS OF FUNDS OR DIGITAL ASSETS, LOSS OF DATA, OR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR OTHER DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT (INCLUDING NEGLIGENCE) OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR ITS USE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. NOTHING HERE IS FINANCIAL, LEGAL OR TAX ADVICE. BLOCKCHAIN TRANSACTIONS ARE IRREVERSIBLE, AND NO ONE CAN RECOVER FUNDS SENT TO THE WRONG ADDRESS OR A LOST SEED PHRASE, PASSPHRASE OR PASSWORD.

## License
MIT License. See [LICENSE](LICENSE) for details.
