// Builds the API reference from the live Pramaan OpenAPI document.
// Run: node scripts/build-api.mjs [openapi.json path or URL]
//
// Splits the document into one file per website category, so each docs page only carries the
// sidebar of its own category (one file for everything made every page about 7 MB).
// Categories, families and mission names come from the public catalogue on www.pramaan.dev, so
// the docs and the website sort things the same way. Writes specs/ and the API tabs in docs.json.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = "https://www.pramaan.dev";
const source = process.argv[2] ?? "https://api.pramaan.dev/openapi.json";

const getJson = async (src) => {
  if (!/^https?:/.test(src)) return JSON.parse(readFileSync(src, "utf8"));
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} answered ${res.status}.`);
  return res.json();
};
const [spec, superpowers, missions] = await Promise.all([
  getJson(source),
  getJson(`${site}/data/superpowers.json`),
  getJson(`${site}/data/missions.json`),
]);

const slug = (name) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dollars = (micro) => `$${(Number(micro) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;

const superpowerAt = new Map();
for (const f of superpowers.families) for (const i of f.items) superpowerAt.set(i.id, { category: f.category, group: f.name });
const missionAt = new Map(missions.missions.map((m) => [m.id, { category: m.category, name: m.name }]));

// One bucket per output file: "platform", "superpowers/<category>" or "missions/<category>".
const buckets = new Map();
const put = (key, path, method, op) => {
  if (!buckets.has(key)) buckets.set(key, {});
  const paths = buckets.get(key);
  paths[path] = { ...paths[path], [method]: op };
};
const skipped = { missionsNotOnSite: [] };
const otherSuperpowers = [];

for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, original] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const op = structuredClone(original);
    if (op.description) op.description = op.description.replace(/(\d+) micro-USD/g, (_, n) => dollars(n));
    const cap = path.match(/^\/v1\/capabilities\/([^/{][^/]*)/);
    const mis = path.match(/^\/v1\/outcomes\/([^/{][^/]*)/);
    if (cap) {
      const at = superpowerAt.get(cap[1]);
      if (!at) otherSuperpowers.push(cap[1]);
      op.tags = [at?.group ?? "Other"];
      put(`superpowers/${at?.category ?? "Other"}`, path, method, op);
    } else if (mis) {
      const at = missionAt.get(mis[1]);
      if (!at) { skipped.missionsNotOnSite.push(mis[1]); continue; } // hidden by the owner, or not sorted yet
      op.tags = [at.category];
      op["x-mint"] = { ...op["x-mint"], metadata: { ...op["x-mint"]?.metadata, title: at.name } };
      put(`missions/${at.category}`, path, method, op);
    } else {
      put("platform", path, method, op);
    }
  }
}

rmSync(`${root}/specs`, { recursive: true, force: true });
const order = (kind, data) => [...data.categories.map((c) => c.name), "Other"].filter((name) => buckets.has(`${kind}/${name}`));
const write = (key) => {
  const file = `specs/${key.split("/").map(slug).join("/")}.json`;
  mkdirSync(dirname(`${root}/${file}`), { recursive: true });
  writeFileSync(`${root}/${file}`, JSON.stringify({ ...spec, servers: [{ url: "https://api.pramaan.dev" }], paths: buckets.get(key) }));
  return file;
};
const menu = (kind, data) =>
  order(kind, data).map((name) => ({
    item: name,
    description: data.categories.find((c) => c.name === name)?.blurb,
    // Page URLs are /<kind>/<tag>/<id>: the tag is the family (superpowers) or category (missions).
    openapi: { source: write(`${kind}/${name}`), directory: kind },
  }));

const docs = JSON.parse(readFileSync(`${root}/docs.json`, "utf8"));
const guides = docs.navigation.tabs.filter((t) => !["Superpowers", "Missions", "Platform API"].includes(t.tab));
docs.navigation.tabs = [
  ...guides,
  { tab: "Superpowers", menu: menu("superpowers", superpowers) },
  { tab: "Missions", menu: menu("missions", missions) },
  { tab: "Platform API", openapi: { source: write("platform"), directory: "platform" } },
];
writeFileSync(`${root}/docs.json`, `${JSON.stringify(docs, null, 2)}\n`);

const count = (prefix) => [...buckets].filter(([k]) => k.startsWith(prefix)).reduce((n, [, p]) => n + Object.keys(p).length, 0);
console.log(`superpowers ${count("superpowers/")}, missions ${count("missions/")}, platform ${count("platform")} paths.`);
if (otherSuperpowers.length) console.log(`${otherSuperpowers.length} superpowers are not on the website yet, listed under Other:`, otherSuperpowers.slice(0, 10).join(", "));
if (skipped.missionsNotOnSite.length) console.log(`${skipped.missionsNotOnSite.length} missions left out (not on the website):`, skipped.missionsNotOnSite.join(", "));
