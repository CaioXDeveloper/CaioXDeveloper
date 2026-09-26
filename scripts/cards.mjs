
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = "cards";

const C = { bg: "#0d1117", border: "#30363d", title: "#0ea5e9", text: "#c9d1d9", muted: "#8b949e" };

async function fetchData() {
  if (process.env.MOCK) return JSON.parse(readFileSync(process.env.MOCK, "utf8"));
  const query = `query($login:String!,$after:String){user(login:$login){
    name login followers{totalCount}
    contributionsCollection{totalCommitContributions restrictedContributionsCount}
    pullRequests{totalCount} issues{totalCount}
    repositories(first:100,after:$after,ownerAffiliations:OWNER,isFork:false){
      totalCount pageInfo{hasNextPage endCursor}
      nodes{stargazerCount languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}}}}`;
  let after = null, user = null, repos = [];
  do {
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { login: USER, after } }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    user = j.data.user;
    repos.push(...user.repositories.nodes);
    after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (after);
  user.repositories.nodes = repos;
  return user;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n));
const font = `font-family="'Segoe UI',Ubuntu,'Helvetica Neue',Sans-Serif"`;

function frame(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${font}>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${C.bg}" stroke="${C.border}"/>
<text x="24" y="36" font-size="17" font-weight="600" fill="${C.title}">${esc(title)}</text>
${body}
</svg>`;
}

function statsCard(u) {
  const repos = u.repositories.nodes;
  const rows = [
    ["Estrelas", repos.reduce((a, r) => a + r.stargazerCount, 0)],
    ["Commits no último ano", u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount],
    ["Pull requests", u.pullRequests.totalCount],
    ["Issues", u.issues.totalCount],
    ["Repositórios", u.repositories.totalCount],
    ["Seguidores", u.followers.totalCount],
  ];
  const body = rows.map(([k, v], i) => {
    const y = 70 + i * 26;
    return `<text x="24" y="${y}" font-size="14" fill="${C.text}">${k}</text>
<text x="316" y="${y}" font-size="14" font-weight="700" fill="${C.text}" text-anchor="end">${fmt(v)}</text>`;
  }).join("\n");
  return frame(340, 70 + rows.length * 26, "No GitHub", body);
}

function langsCard(u, max = 8) {
  const tot = {};
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      const k = e.node.name;
      tot[k] ??= { size: 0, color: e.node.color || C.muted };
      tot[k].size += e.size;
    }
  const list = Object.entries(tot).sort((a, b) => b[1].size - a[1].size).slice(0, max);
  const sum = list.reduce((a, [, v]) => a + v.size, 0) || 1;
  const W = 340, barW = W - 48;
  let x = 24;
  const bar = list.map(([, v]) => {
    const w = (v.size / sum) * barW;
    const s = `<rect x="${x}" y="52" width="${w}" height="8" fill="${v.color}"/>`;
    x += w;
    return s;
  }).join("");
  const items = list.map(([name, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const px = 24 + col * 150, py = 88 + row * 24;
    return `<circle cx="${px + 5}" cy="${py - 4}" r="5" fill="${v.color}"/>
<text x="${px + 16}" y="${py}" font-size="13" fill="${C.text}">${esc(name)} <tspan fill="${C.muted}">${((v.size / sum) * 100).toFixed(1)}%</tspan></text>`;
  }).join("\n");
  const h = 88 + Math.ceil(list.length / 2) * 24;
  return frame(W, h, "Linguagens", `<clipPath id="r"><rect x="24" y="52" width="${barW}" height="8" rx="4"/></clipPath><g clip-path="url(#r)">${bar}</g>\n${items}`);
}

const u = await fetchData();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/stats.svg`, statsCard(u));
writeFileSync(`${OUT}/langs.svg`, langsCard(u));
console.log("cards gerados");
