# V5670 — Source Repair Preparation

V5670 turns the V5660 queue into concrete, review-only repair assets. Nothing in
this layer is deployed automatically.

## Live source map

- `#HTML6.widget.HTML` is the homepage bundle leaking into custom application
  pages through `#main.main.section`.
- `tggAudio`, `tggNowPlaying`, and `tggClosePlayer` each occur twice because the
  homepage widget and theme both install players.
- The homepage loader still performs the anonymous direct
  `mixtapes -> artists/tracks` join.
- Creator Store loses its public product-template boundary immediately after
  `<div class="shopprice">`, exposing the creator loader as page text.
- Command Center has eight static green `ONLINE` labels even while its protected
  readiness calls fail.

## Prepared repair assets

1. `blogger-shell-isolation.js` removes the leaking homepage widget and hides
   only Blogger chrome on custom application routes. The preferred permanent
   template repair remains adding `cond='data:view.isHomepage'` to `HTML6`.
2. `auth-first-rpc-gate.js` provides one shared session-first protected-RPC
   contract.
3. `homepage-discovery-adapter.js` replaces the unsafe direct join with the
   existing public discovery RPC.
4. `creator-store-loader-repair.js` restores the broken public card boundary and
   routes creator loading through the auth-first helper.
5. `truthful-runtime-status.js` changes optimistic static ONLINE labels to
   UNVERIFIED unless a verified evidence reference is supplied.
6. `tgg-predeploy-lint.mjs` blocks known CDATA, homepage-query, widget-scope,
   Creator Store, and duplicate-ID regressions before Blogger deployment.

## State

All six remediation items are now `READY`; none is `FIXED`. They remain HOLD
until the patch modules are integrated into the canonical Blogger source,
XML-validated, deployed through the human-controlled path, and verified in a
fresh browser execution.
