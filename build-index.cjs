// Scans the extracted "Claude Skills Ultimate Bundle" folder and builds:
//   public/index.json           -> metadata only (name, category, description, path)
//   public/skills-content.json  -> { "<skill-name>": "<full SKILL.md text>", ... }
// Consolidated into two files (not 501+ individual files) so the whole repo
// stays small enough to upload via the GitHub website instead of git/terminal.
//
// Usage: node scripts/build-index.js "/path/to/Claude Skills Ultimate Bundle" ./public

const fs = require("fs");
const path = require("path");

const [, , SRC_DIR, OUT_DIR] = process.argv;

if (!SRC_DIR || !OUT_DIR) {
  console.error('Usage: node build-index.js "<source bundle folder>" <output public folder>');
  process.exit(1);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { name: null, description: null };
  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*("([\s\S]*?)"|'([\s\S]*?)'|.+)$/m);
  let description = null;
  if (descMatch) {
    description = (descMatch[2] || descMatch[3] || descMatch[1] || "").trim();
  }
  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    description
  };
}

function walk(dir, category, results) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nextCategory = category || entry.name;
      walk(full, nextCategory, results);
    } else if (entry.isFile() && entry.name.toUpperCase() === "SKILL.MD") {
      const content = fs.readFileSync(full, "utf8");
      const fm = parseFrontmatter(content);
      const skillFolder = path.basename(dir);
      results.push({
        name: fm.name || skillFolder,
        category: category || "Uncategorized",
        description: fm.description || "",
        content
      });
    }
  }
}

const results = [];
walk(SRC_DIR, null, results);

// dedupe by name (keep first)
const seen = new Set();
const deduped = [];
for (const r of results) {
  if (seen.has(r.name)) continue;
  seen.add(r.name);
  deduped.push(r);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// index.json — metadata only, used for search
const indexData = deduped.map(({ name, category, description }) => ({ name, category, description }));
fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(indexData, null, 2));
console.log(`Indexed ${indexData.length} skills -> ${path.join(OUT_DIR, "index.json")}`);

// skills-content.json — one object, keyed by skill name, full SKILL.md text
const contentData = {};
for (const r of deduped) contentData[r.name] = r.content;
fs.writeFileSync(path.join(OUT_DIR, "skills-content.json"), JSON.stringify(contentData));
console.log(`Wrote full content -> ${path.join(OUT_DIR, "skills-content.json")}`);
