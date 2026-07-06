# reqcore (CT213) — lessons

Format: DATE, WHAT WENT WRONG, RULE FOR NEXT TIME

2026-07-06, After changing app/layouts/public.vue I ran `docker compose build` and told the user it was deployed — but the running containers still used the OLD image (`Up 29 hours`), so the user saw no change. Building an image does NOT swap the running container., ALWAYS follow `docker compose build` with `docker compose up -d --force-recreate <svc>` and VERIFY the change is in the RUNNING container (`docker exec <c> grep -rl <token> /app/.output`), never claim a deploy from "image built" alone.
2026-07-06, Spent time hunting a "red line" bug inside reqcore that was actually the IdoSell parent page wrapper (grey `.careers-embed` card edges) — the red boxes in the screenshot were the users annotations, not page elements., When an embed artifact is not found in the iframes own rendered HTML+compiled CSS, STOP looking inside the app and check the PARENT page/theme; distinguish real page elements from screenshot annotation marks before editing.
