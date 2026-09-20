# Marker — highlight the web

Select text on any page, click the colour, and the highlight is there when you
come back. Free: 10 highlights. Pro: unlimited, four colours, Markdown export,
and shareable read-only pages.

**Site:** https://demo.paidextension.dev · **Install:** [latest release](https://github.com/house-of-arqam/marker/releases/latest)

Marker is the open-core demo for [PaidExtension](https://paidextension.dev),
the $0/month stack for paid browser extensions. Everything in this repository
is the *product*; the licensing, checkout, Worker core and tooling come from
the kit and are shown here only inside the built extension zip. Purchases on
the demo use Paddle's sandbox — card `4242 4242 4242 4242`, nothing is charged.

## Try it

1. Download and unzip the latest release.
2. Chrome / Edge: `chrome://extensions` → Developer mode → *Load unpacked* → the
   unzipped folder. Firefox: `about:debugging#/runtime/this-firefox` → *Load
   Temporary Add-on* → `manifest.json`.
3. Select text on any page. Highlight it. Reload the page.
4. Open the popup → *Start free trial* → try colours, export and share. Or
   *Upgrade* with the sandbox card and watch Pro unlock; refund it in the Paddle
   sandbox and watch it lock again within the entitlement window.

## What is in here

```
paidextension.config.json        product, plans, feature names — the kit reads everything from this
extension/src/marker/model.ts    Highlight type, per-URL storage, free cap, Markdown export
extension/src/marker/anchor.ts   text-quote anchoring (quote + context, no brittle DOM paths)
extension/src/marker/share.ts    publishes a page's highlights to POST /share with the entitlement token
extension/src/content/marker.ts  selection toolbar, feature-gated colours, re-render on storage change
extension/src/popup/             popup: quota meter, per-page list, export, share, upgrade
worker/src/share.js              POST /share (entitlement-gated, validated, 90-day TTL) + GET /share?id=
worker/test/share.test.js        node:test suite for the route
site/docs/                       demo.paidextension.dev: landing, share viewer, checkout, key, devices
```

About 650 lines of product code. The only places it touches licensing:

```ts
// content script: asks the service worker, which reads the verified entitlement
const [unlimited, colors] = await Promise.all([hasFeature(FEATURE.unlimited), hasFeature(FEATURE.colors)]);
if (!unlimited && (await countAllHighlights()) >= FREE_HIGHLIGHT_LIMIT) { /* nudge to upgrade */ }
if (!colors) { /* one colour */ }
```

`hasFeature()` reads the verified entitlement — an ES256 token signed by the
Worker, bound to this install, renewed every few days — not a boolean in
storage. Feature names live in the config (`features.free`, `features.pro`),
so the gate is a string, not a code change.

### The server-side part

Sharing is the feature a client-side flag cannot fake. `share.ts` sends the
entitlement token as `Authorization: Bearer`; `share.js` verifies its
signature with the same public key the extension ships, checks it is an
entitlement (or a trial key) and only then writes the highlights to KV under an
opaque id. The viewer at `/share#<id>` fetches `GET /share?id=` — the id
travels in the fragment so it never appears in server logs. Payloads are capped
(200 highlights, 2,000 chars each, 64 KiB body), colours are whitelisted, and
records expire after 90 days.

## Build yours

This is what a product built on PaidExtension looks like after `npm run init`
and a day of product work. The kit — extension licensing module, Cloudflare
Worker, static site, Paddle integration, agent skills — is at
https://paidextension.dev.

## License

Product code and site: MIT ([LICENSE](LICENSE)). The PaidExtension kit is
licensed separately and is not part of this repository.
