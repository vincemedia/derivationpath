// Terms of Use. Drafted as a strict as-is / no-liability text; have it
// reviewed by counsel before relying on it. Governing law: the Netherlands.
export const TERMS_UPDATED = 'September 25, 2026';

export const TERMS_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Acceptance',
    body: [
      'By accessing, downloading, running or otherwise using Derivation Path (the "Software"), including any hosted copy, you agree to these Terms of Use. If you do not agree, do not use the Software.',
    ],
  },
  {
    title: '2. What the Software is',
    body: [
      'The Software is free, open-source code that runs in your own browser. It is a tool, not a service: no one operates an account for you, holds your keys, stores your seed phrase, or has any ability to access, freeze, reverse or recover your funds.',
      'The Software relies on third-party services, including WhatsOnChain, GorillaPool and any BRC-100 wallet you connect. Those services are not controlled by the authors, and their availability, accuracy and conduct are entirely outside the authors’ control.',
    ],
  },
  {
    title: '3. No warranties',
    body: [
      'THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE AUTHORS, CONTRIBUTORS, COPYRIGHT HOLDERS, MAINTAINERS AND ANY PERSON HOSTING OR DISTRIBUTING THE SOFTWARE (TOGETHER, THE "PROVIDERS") DISCLAIM ALL WARRANTIES, EXPRESS, IMPLIED OR STATUTORY, INCLUDING ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, SECURITY, AVAILABILITY, AND THAT THE SOFTWARE WILL FIND, PROTECT, RECOVER OR CORRECTLY MOVE ANY FUNDS OR DIGITAL ASSETS.',
    ],
  },
  {
    title: '4. Limitation of liability',
    body: [
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ANY PROVIDER BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY LOSS OR DAMAGE OF ANY KIND, INCLUDING LOSS OF FUNDS, DIGITAL ASSETS, TOKENS, ORDINALS, PRIVATE KEYS, SEED PHRASES, DATA, PROFITS, REVENUE OR OPPORTUNITY, OR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY OR OTHERWISE, ARISING FROM OR RELATING TO THE SOFTWARE OR ITS USE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH LOSS.',
      'WHERE LIABILITY CANNOT BE EXCLUDED BY LAW, THE PROVIDERS’ TOTAL AGGREGATE LIABILITY IS LIMITED TO ZERO (0) US DOLLARS, OR, IF A ZERO LIMIT IS NOT PERMITTED, THE SMALLEST AMOUNT THE LAW ALLOWS.',
    ],
  },
  {
    title: '5. Assumption of risk',
    body: [
      'You use the Software entirely at your own risk and accept all risks of doing so, including: mistakes in derivation paths, amounts, fees or addresses; bugs or errors in the Software or its dependencies; incorrect or unavailable data from third-party services; malware, compromised devices or browsers; theft or exposure of your seed phrase, passphrase, private keys or backup password; loss of ordinals or tokens; network, miner or protocol changes; and the irreversible nature of blockchain transactions.',
      'No one, including the Providers, can reverse a transaction, recover funds sent to the wrong address, or recover a lost seed phrase, passphrase or password.',
    ],
  },
  {
    title: '6. Your responsibilities',
    body: [
      'You are solely responsible for: deciding whether and how to use the Software; the security of your device and your seed phrase, passphrase, keys and backups; reviewing every transaction before sending it; confirming that you own or are authorised to control any wallet you use with the Software; and complying with all laws, regulations and tax obligations that apply to you.',
      'You must not use the Software to access wallets or funds that are not yours, or for any unlawful purpose.',
    ],
  },
  {
    title: '7. No advice',
    body: [
      'Nothing in the Software, its documentation or these Terms is financial, investment, legal, tax or other professional advice. No fiduciary or other relationship is created between you and any Provider.',
    ],
  },
  {
    title: '8. Release and indemnity',
    body: [
      'To the maximum extent permitted by applicable law, you release the Providers from all claims, demands and damages of every kind, known and unknown, arising from or connected with the Software or your use of it. You agree to defend, indemnify and hold the Providers harmless from any claim, loss, liability, cost or expense (including reasonable legal fees) arising from your use of the Software, your breach of these Terms, or your violation of any law or third-party right.',
    ],
  },
  {
    title: '9. Open-source licence',
    body: [
      'The source code is licensed under the Apache License, Version 2.0, which also provides the Software "as is" without warranty and limits liability (sections 7 and 8 of that licence). If these Terms and the licence differ, the provision that gives the Providers greater protection from liability applies.',
    ],
  },
  {
    title: '10. Changes, severability and entire agreement',
    body: [
      'These Terms may be updated at any time by publishing a new version; continued use after an update means you accept it. If any provision is found unenforceable, it will be enforced to the maximum extent permitted and the rest remain in full effect. These Terms, together with the licence, are the entire agreement between you and the Providers about the Software.',
    ],
  },
  {
    title: '11. No class or collective actions',
    body: [
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ANY CLAIM RELATING TO THE SOFTWARE OR THESE TERMS MAY BE BROUGHT ONLY IN YOUR INDIVIDUAL CAPACITY. YOU WAIVE ANY RIGHT TO BRING, JOIN, PARTICIPATE IN OR BENEFIT FROM ANY CLASS ACTION, COLLECTIVE ACTION (INCLUDING ANY COLLECTIVE ACTION UNDER ARTICLE 3:305A OF THE DUTCH CIVIL CODE), MASS CLAIM, REPRESENTATIVE PROCEEDING OR CONSOLIDATED ACTION AGAINST ANY PROVIDER, AND YOU AGREE NOT TO ASSIGN OR TRANSFER ANY SUCH CLAIM TO A CLAIM VEHICLE, FOUNDATION OR ASSOCIATION FOR THAT PURPOSE.',
    ],
  },
  {
    title: '12. Governing law and jurisdiction',
    body: [
      'These Terms, and any dispute or claim arising from or relating to them or the Software (including non-contractual disputes or claims), are governed exclusively by the laws of the Netherlands. The United Nations Convention on Contracts for the International Sale of Goods does not apply.',
      'The competent court in Amsterdam, the Netherlands, has exclusive jurisdiction over any such dispute or claim, and you submit to that jurisdiction.',
    ],
  },
];

export const TERMS_SUMMARY =
  'This is free software that runs in your browser. It comes with no warranty. You use it entirely at your own risk, and no one behind it is responsible for any loss, including lost funds.';

/** TERMS.md in the repo root is generated from this; a unit test keeps them in sync. */
export function renderTermsMarkdown(): string {
  const out = [
    '# Terms of Use',
    '',
    `_Last updated ${TERMS_UPDATED}_`,
    '',
    `**In short:** ${TERMS_SUMMARY}`,
    '',
  ];
  for (const s of TERMS_SECTIONS) {
    out.push(`## ${s.title}`, '');
    for (const p of s.body) out.push(p, '');
  }
  out.push('---', '', '_These Terms are also shown in the app at `#terms`. Generated from `src/terms.ts` by `npm run terms:md`; do not edit by hand._', '');
  return out.join('\n');
}
