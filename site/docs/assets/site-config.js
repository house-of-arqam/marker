// Runtime configuration for the static pages. `npm run init` at the repo root
// rewrites this from paidextension.config.json; edit by hand otherwise.
//
// Paddle client-side tokens are public, but pinning them here stops anyone
// from opening a checkout on this domain that pays into their own Paddle
// account. Both environments are pinned, so ?token= is never honoured.
window.SITE_CONFIG = {
  productName: 'Marker',
  proLabel: 'Pro',
  supportEmail: 'hello@paidextension.dev',
  licenseApi: 'https://license.demo.paidextension.dev',
  maxSeats: 3,
  paddleTokens: {
    production: '',
    sandbox: 'test_9b4a1b9e97df12157dc72ab7840'
  }
};
