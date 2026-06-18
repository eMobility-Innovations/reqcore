# ESC overlay — escooterclinic/reqcore (branch `esc`, deployed on 001esc CT213)

This fork tracks upstream `reqcore-inc/reqcore` (remote: `origin`). The deploy
branch is `esc`.

## Update procedure (DO NOT hard-reset esc to upstream)

```bash
cd /opt/reqcore
git fetch origin
git merge origin/main      # keeps the ESC commits below; conflicts (if any)
                           # are limited to the few leaf-file lines we touch
docker compose build app && docker compose up -d app
```

If `esc` ever gets hard-reset to upstream, re-apply the deviations with:
```bash
git apply overlay/esc/patches/*.patch
```

## Deviations from upstream

| File | Change | Why |
|------|--------|-----|
| `app/layouts/public.vue` | brand wordmark `Reqcore` -> `Remote Crew`; removed `<LanguageSwitcher />` from the public header | white-label the public job board for Remote Crew; site is English-only |

Keep every deviation tiny and confined to leaf files (layouts/components) so
`git merge origin/main` stays clean. Never edit broad files like
`nuxt.config.ts` for cosmetic changes.
