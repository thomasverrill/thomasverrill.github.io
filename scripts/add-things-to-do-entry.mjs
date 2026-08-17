#!/usr/bin/env node
// Local-only form for adding an entry to src/pages/things-to-do.astro.
// Not part of the deployed site — run with `npm run add-entry`, fill in
// the form at http://localhost:4322, review the resulting diff, and
// commit as usual.

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(__dirname, "../src/pages/things-to-do.astro");
const PORT = 4322;

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(area) {
  return area.toLowerCase().trim().replaceAll(/\s+/g, "-");
}

function wrap(text, width = 68, indent = "          ") {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

function buildEntry({ title, link, description }) {
  const t = escapeHtml(title.toLowerCase().trim());
  const href = escapeHtml(link.trim());
  const desc = wrap(description.toLowerCase().trim());
  return `      <li>\n        <a href="${href}">${t}</a>\n        <p class="section-note">\n${desc}\n        </p>\n      </li>`;
}

function readSections(html) {
  // Leading [ \t]* is included in the match on purpose, so `full` carries
  // its own indentation and callers never have to reason about whatever
  // whitespace happened to precede it in the surrounding document.
  const sectionRe =
    /[ \t]*<section id="([a-z0-9-]+)" aria-labelledby="[a-z0-9-]+-heading">\s*<h2[^>]*>([^<]*)<\/h2>\s*<ul class="archive-list"[^>]*>([\s\S]*?)<\/ul>\s*<\/section>/g;
  const sections = [];
  let m;
  while ((m = sectionRe.exec(html))) {
    sections.push({ id: m[1], name: m[2].trim(), listInner: m[3], full: m[0] });
  }
  return sections;
}

function replaceListInner(sectionFull, newListInner) {
  // Structural replace, not string replace: `existing.listInner` can be ""
  // for a previously-empty section, and String.replace("", x) inserts at
  // index 0 of the whole string rather than at the <ul> — so match the
  // <ul>...</ul> shape instead of the (possibly empty) captured inner text.
  return sectionFull.replace(
    /(<ul class="archive-list"[^>]*>)[\s\S]*?(<\/ul>)/,
    (_match, open, close) => `${open}${newListInner}${close}`,
  );
}

function extractEntries(listInner) {
  return listInner.match(/[ \t]*<li>[\s\S]*?<\/li>/g) ?? [];
}

function entryTitle(li) {
  const m = li.match(/<a[^>]*>([^<]*)<\/a>/);
  return m ? m[1].trim().toLowerCase() : "";
}

function rebuildNav(html, areaName, id) {
  const navRe = /<PageNav\s+items=\{\[[\s\S]*?\]\}\s*\/>/;
  const navMatch = html.match(navRe);
  if (!navMatch) return html;

  const itemRe = /\{\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"\s*\}/g;
  const items = [];
  let im;
  while ((im = itemRe.exec(navMatch[0]))) {
    items.push({ label: im[1], href: im[2] });
  }

  const home = items.find((i) => i.href === "/");
  const rest = items.filter((i) => i.href !== "/");
  if (!rest.some((i) => i.href === `#${id}`)) {
    rest.push({ label: areaName, href: `#${id}` });
  }
  rest.sort((a, b) => a.label.localeCompare(b.label));

  const all = home ? [home, ...rest] : rest;
  const itemsStr = all
    .map((i) => `      { label: "${escapeHtml(i.label)}", href: "${escapeHtml(i.href)}" },`)
    .join("\n");
  const newNav = `<PageNav\n    items={[\n${itemsStr}\n    ]}\n  />`;

  return html.replace(navRe, newNav);
}

async function addEntry({ area, title, link, description }) {
  const html = await readFile(TARGET, "utf8");
  const sections = readSections(html);
  const areaName = area.toLowerCase().trim();
  const id = slugify(areaName);
  const newEntry = buildEntry({ title, link, description });

  const existing = sections.find((s) => s.id === id);

  if (existing) {
    const entries = extractEntries(existing.listInner);
    entries.push(newEntry);
    entries.sort((a, b) => entryTitle(a).localeCompare(entryTitle(b)));
    const newListInner = "\n" + entries.join("\n") + "\n    ";
    const newFull = replaceListInner(existing.full, newListInner);
    const newHtml = html.replace(existing.full, newFull);
    await writeFile(TARGET, newHtml);
    return { created: false, id };
  }

  const newSection = `  <section id="${id}" aria-labelledby="${id}-heading">\n    <h2 id="${id}-heading">${escapeHtml(
    areaName,
  )}</h2>\n    <ul class="archive-list" aria-label="${escapeHtml(areaName)} entries">\n${newEntry}\n    </ul>\n  </section>`;

  const insertBefore = sections.find((s) => s.name.toLowerCase() > areaName);
  let newHtml;
  if (insertBefore) {
    // insertBefore.full already carries its own leading indentation
    // (see readSections), so no extra whitespace is added here.
    newHtml = html.replace(insertBefore.full, `${newSection}\n\n${insertBefore.full}`);
  } else if (sections.length > 0) {
    const last = sections[sections.length - 1];
    newHtml = html.replace(last.full, `${last.full}\n\n${newSection}`);
  } else {
    newHtml = html.replace(/\n<\/BaseLayout>/, `\n\n${newSection}\n</BaseLayout>`);
  }

  newHtml = rebuildNav(newHtml, areaName, id);
  await writeFile(TARGET, newHtml);
  return { created: true, id };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(Object.fromEntries(new URLSearchParams(data)));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function existingAreas() {
  const html = await readFile(TARGET, "utf8");
  return readSections(html).map((s) => s.name);
}

function page(body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>add things-to-do entry</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; color: #2f2c29; }
  label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
  input, textarea { width: 100%; padding: 0.5rem; font: inherit; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
  textarea { min-height: 5rem; }
  button { margin-top: 1.5rem; padding: 0.6rem 1.2rem; font: inherit; cursor: pointer; }
  .ok { color: #2a7a3b; }
  .err { color: #b3261e; }
  a { color: #285f6b; }
</style>
</head>
<body>
<h1>add a things-to-do entry</h1>
${body}
</body>
</html>`;
}

async function formPage(message = "") {
  const areas = await existingAreas();
  const datalist = areas.map((a) => `<option value="${escapeHtml(a)}">`).join("");
  return page(`
${message}
<form method="post" action="/submit">
  <label for="area">area (existing: ${areas.map(escapeHtml).join(", ") || "none yet"})</label>
  <input id="area" name="area" list="areas" required autocomplete="off" />
  <datalist id="areas">${datalist}</datalist>

  <label for="title">title</label>
  <input id="title" name="title" required autocomplete="off" />

  <label for="link">link</label>
  <input id="link" name="link" type="url" required autocomplete="off" />

  <label for="description">description (1-2 sentences)</label>
  <textarea id="description" name="description" required></textarea>

  <button type="submit">add entry</button>
</form>
`);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(await formPage());
      return;
    }

    if (req.method === "POST" && req.url === "/submit") {
      const fields = await parseBody(req);
      const { area, title, link, description } = fields;
      if (!area || !title || !link || !description) {
        res.writeHead(400, { "content-type": "text/html" });
        res.end(await formPage(`<p class="err">all fields are required.</p>`));
        return;
      }
      const { created, id } = await addEntry({ area, title, link, description });
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        await formPage(
          `<p class="ok">added "${escapeHtml(title.toLowerCase())}" to ${created ? "new" : "existing"} section #${id}. review with <code>git diff src/pages/things-to-do.astro</code>, then commit.</p>`,
        ),
      );
      return;
    }

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`add-entry form running at http://localhost:${PORT}`);
  console.log("Ctrl-C to stop");
});
