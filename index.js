import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import index from "../public/index.json" with { type: "json" };

// ---- search scoring (plain keyword match, no embeddings/external calls) ----

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreSkill(queryTerms, skill) {
  const nameTokens = tokenize(skill.name.replace(/-/g, " "));
  const descTokens = tokenize(skill.description);
  const catTokens = tokenize(skill.category);
  const haystack = `${skill.name} ${skill.description} ${skill.category}`.toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (nameTokens.includes(term)) score += 5;
    if (descTokens.includes(term)) score += 2;
    if (catTokens.includes(term)) score += 1;
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function searchSkills(query, limit = 5) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  return index
    .map((skill) => ({ skill, score: scoreSkill(queryTerms, skill) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      name: s.skill.name,
      category: s.skill.category,
      description: s.skill.description
    }));
}

// ---- optional shared-secret check (see: add AUTH_TOKEN secret in Cloudflare dashboard) ----

function isAuthorized(request, env) {
  if (!env.AUTH_TOKEN) return true; // no secret configured = open server
  const header = request.headers.get("Authorization") || "";
  return header === `Bearer ${env.AUTH_TOKEN}`;
}

// ---- content lookup — single consolidated file, served as a static asset ----

let contentCache = null;

async function getSkillContent(env, name) {
  if (!contentCache) {
    const res = await env.ASSETS.fetch(new Request("https://internal.local/skills-content.json"));
    if (!res.ok) throw new Error(`Could not load skills-content.json (${res.status})`);
    contentCache = await res.json();
  }
  return contentCache[name] || null;
}

// ---- MCP server factory — must build a NEW McpServer per request (MCP SDK 1.26.0+ requirement) ----

function createServer(env) {
  const server = new McpServer({
    name: "skill-router",
    version: "1.0.0"
  });

  server.tool(
    "search_skills",
    "Search a library of 501 business/marketing/ops skill definitions by task description. " +
      "Returns the top matching skill names + descriptions. Call this whenever a request looks " +
      "like it needs a specialized business skill (ad copy, pricing strategy, legal docs, " +
      "analytics reports, etc.) before answering from general knowledge.",
    {
      query: z.string().describe("Plain description of the task, e.g. 'write a facebook ad campaign'"),
      limit: z.number().optional().describe("Max results to return (default 5)")
    },
    async ({ query, limit }) => {
      const results = searchSkills(query, limit || 5);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
      };
    }
  );

  server.tool(
    "get_skill",
    "Fetch the full SKILL.md instructions for one skill by exact name (as returned by search_skills).",
    {
      name: z.string().describe("Exact skill name, e.g. 'facebook-ad-campaign'")
    },
    async ({ name }) => {
      const text = await getSkillContent(env, name);
      if (!text) {
        return {
          content: [{ type: "text", text: `No skill found with name "${name}".` }],
          isError: true
        };
      }
      return { content: [{ type: "text", text }] };
    }
  );

  return server;
}

export default {
  async fetch(request, env, ctx) {
    if (!isAuthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }
    // New server instance per request — required by MCP SDK 1.26.0+
    const server = createServer(env);
    return createMcpHandler(server, { route: "/mcp" })(request, env, ctx);
  }
};
