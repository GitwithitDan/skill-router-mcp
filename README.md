# skill-router-mcp

Remote MCP server exposing the 501-skill "Claude Skills Ultimate Bundle" as two tools:

- `search_skills(query, limit?)` — keyword-scored search over all 501 name/category/description entries
- `get_skill(name)` — returns the full SKILL.md content for one match

No manual per-skill upload, no 20-skill cap. Claude calls these tools itself when a task looks
like it needs one of the bundled skills.

## Structure (8 files total — small enough to upload via the GitHub website)

- `src/index.js` — the Worker / MCP server (Cloudflare Agents SDK, `createMcpHandler`)
- `public/index.json` — metadata index (name, category, description) for all 501 skills — used for search
- `public/skills-content.json` — one JSON object, keyed by skill name, containing the full SKILL.md text for
  all 501 skills — used by `get_skill`. Consolidated into a single file on purpose so the whole repo stays
  under GitHub's 100-file web upload limit.
- `scripts/build-index.cjs` — regenerates both `public/*.json` files from a source bundle folder. Only needed
  again if skills are added or changed.

## Rebuilding the index (only needed if skills are added/changed)

```
node scripts/build-index.cjs "<path to Claude Skills Ultimate Bundle folder>" ./public
```

## Deploying

See the setup instructions provided alongside this file — deployment is done entirely through the
GitHub website and the Cloudflare dashboard (Workers Builds / Connect to Git), no terminal required
beyond unzipping this folder locally.

## Optional auth

Add an `AUTH_TOKEN` secret in the Cloudflare dashboard (Workers & Pages > your Worker > Settings >
Variables and Secrets) to require `Authorization: Bearer <token>` on every request. If no secret is
set, the server is open to anyone with the URL.
