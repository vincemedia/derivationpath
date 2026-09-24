// @bsv/sdk looks for a browser-style `self.crypto`; ESM under vitest has no
// `require` fallback, so expose Node's WebCrypto the way a browser would.
(globalThis as { self?: unknown }).self ??= globalThis;
