# ESC job board — iframe embed (how it works)

The Escooter Clinic board (`jobs.escooterclinic.co.uk`) is embedded as an
`<iframe>` inside the **idoSell** storefront (`escooterclinic.co.uk`) — the
"CURRENT OPPORTUNITIES" section. idoSell is closed-source, so an iframe is the
only integration path. Two pieces make it work: an **embed render mode** in the
app, and a **framing-headers override** so the browser permits the frame.

---

## 1. Embed render mode — `?embed=1`

Implemented in `app/layouts/public.vue`.

- Append `?embed=1` to any board URL (`/jobs?embed=1`, or a job detail
  `/jobs/<slug>?embed=1`).
- `isEmbed` (`computed` from `route.query.embed`) then:
  - **hides** the brand `<header>` and `<footer>` (`v-if="!isEmbed"`),
  - makes the wrapper **transparent** and removes page padding/min-height
    (`.rc-embed`), so only the job-list section renders — it drops cleanly into a
    parent page that already has its own "CURRENT OPPORTUNITIES" heading.
- The standalone full page (no param) is unchanged for direct visitors.

### Auto-height (no scrollbars)

On mount in embed mode the layout posts its height to the parent and keeps it
updated with a `ResizeObserver`:

```js
window.parent.postMessage({ type: 'reqcore-embed-height', height: <scrollHeight> }, '*')
```

The parent listens and resizes the iframe (snippet below). Without the parent
script the iframe is fixed at its `height` attribute and inner-scrolls.

---

## 2. Framing headers — `server/plugins/esc-frame-headers.ts`

By default reqcore blocks ALL framing (clickjacking protection):

- `X-Frame-Options: DENY` — static nitro routeRule in `nuxt.config.ts`
- CSP `frame-ancestors 'none'` — `server/middleware/csp.ts`

**Important discovery (2026-06-28):** an earlier handover assumed the Traefik/
Pangolin edge strips these and "iframing works with no app change". That is true
ONLY for **fleet-routed** domains (e.g. `ats.fiszu.com`, which the edge rewrites
with a big `frame-ancestors` allow-list and no `X-Frame-Options`). The ESC board
goes through a **plain pass-through Pangolin resource (212)** that forwards the
app's headers verbatim — so the live response carried `X-Frame-Options: DENY` +
`frame-ancestors 'none'`, and the browser **refused to frame it**.

The fix is a **brand-gated Nitro `beforeResponse` plugin**. It runs AFTER both
the routeRule headers and the csp middleware (so it deterministically wins), and
only when `NUXT_PUBLIC_BRAND === 'escooter-clinic'`:

- **removes** `X-Frame-Options` — the header can't express a cross-origin
  allow-list, and `DENY` would override `frame-ancestors`;
- **rewrites** CSP `frame-ancestors` →
  `'self' https://escooterclinic.co.uk https://www.escooterclinic.co.uk`
  (only the trusted idoSell parent origins; all other CSP directives, incl. the
  per-request script nonce, are left intact);
- is a **no-op** for the Remote Crew board and the admin app — both keep
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`.

Why a plugin and not an edit to the base files: `nuxt.config.ts` and
`server/middleware/csp.ts` stay **byte-for-byte upstream**, so `git merge
origin/main` never conflicts on framing. All ESC framing logic is in this one new
file, gated by the brand env.

---

## 3. The idoSell CMS block (paste this)

```html
<iframe id="esc-jobs" src="https://jobs.escooterclinic.co.uk/jobs?embed=1"
        style="width:100%;border:0;display:block" scrolling="no" height="600"
        title="Current Opportunities"></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://jobs.escooterclinic.co.uk') return;
    if (e.data && e.data.type === 'reqcore-embed-height')
      document.getElementById('esc-jobs').style.height = e.data.height + 'px';
  });
</script>
```

- The `<script>` is the recommended path (auto-fit). Without it, set a larger
  fixed `height` — the iframe will inner-scroll otherwise.
- Remote Crew has the same capability: `https://remotecrew.co.uk/jobs?embed=1`
  (change the `e.origin` check to `https://remotecrew.co.uk`).

---

## 4. How to verify (after any change to framing or embed)

**Headers** (the browser contract):
```bash
# ESC board — must ALLOW escooterclinic.co.uk, NO X-Frame-Options:
curl -sI 'https://jobs.escooterclinic.co.uk/jobs?embed=1' | grep -iE 'x-frame-options|content-security-policy'
# RC board + admin — must STAY strict (DENY + frame-ancestors 'none'):
curl -sI 'https://remotecrew.co.uk/jobs' | grep -i x-frame-options
```

**Embed renders chrome-less:**
```bash
curl -s 'https://jobs.escooterclinic.co.uk/jobs?embed=1' | grep -c 'class="rc-header"'   # 0
```

**End-to-end cross-origin** (via browserless on CT192 — load the REAL parent
origin, inject the iframe, assert it commits with no "Refused to display"
console error). This was run 2026-06-28 and passed: the frame committed
`jobs.escooterclinic.co.uk/jobs?embed=1` inside `escooterclinic.co.uk` with zero
framing-block errors. A `data:`/file parent gives a false negative — the parent
MUST be served from `escooterclinic.co.uk` for `frame-ancestors` to match.
