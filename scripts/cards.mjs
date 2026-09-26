
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const USER = process.env.GH_USER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = "cards";

const C = { bg: "#0d1117", border: "#30363d", title: "#0ea5e9", text: "#c9d1d9", muted: "#8b949e" };

async function fetchData() {
  if (process.env.MOCK) return JSON.parse(readFileSync(process.env.MOCK, "utf8"));
  const query = `query($login:String!,$after:String){user(login:$login){
    name login followers{totalCount}
    contributionsCollection{totalCommitContributions restrictedContributionsCount contributionCalendar{weeks{contributionDays{date contributionCount}}}}
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

function activityCard(u, days = 31) {
  const all = u.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const d = all.slice(-days);
  const W = 900, H = 260, L = 50, R = 24, T = 60, B = 40;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(4, ...d.map((x) => x.contributionCount));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const X = (i) => L + (i / (d.length - 1)) * pw;
  const Y = (v) => T + ph - (v / top) * ph;
  const pts = d.map((x, i) => `${X(i).toFixed(1)},${Y(x.contributionCount).toFixed(1)}`);
  const grid = [0, 1, 2, 3, 4].map((k) => {
    const v = k * step, y = Y(v).toFixed(1);
    return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.border}" stroke-dasharray="3 4"/>
<text x="${L - 10}" y="${+y + 4}" font-size="11" fill="${C.muted}" text-anchor="end">${v}</text>`;
  }).join("\n");
  const labels = d.map((x, i) => (i % 5 === 0 || i === d.length - 1)
    ? `<text x="${X(i).toFixed(1)}" y="${H - 16}" font-size="11" fill="${C.muted}" text-anchor="middle">${x.date.slice(8, 10)}/${x.date.slice(5, 7)}</text>` : "").join("");
  const dots = d.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.contributionCount).toFixed(1)}" r="3" fill="#ffffff"><title>${x.date}: ${x.contributionCount}</title></circle>`).join("");
  const total = d.reduce((a, x) => a + x.contributionCount, 0);
  const body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.title}" stop-opacity=".35"/><stop offset="1" stop-color="${C.title}" stop-opacity="0"/></linearGradient></defs>
<text x="${W - 24}" y="36" font-size="13" fill="${C.muted}" text-anchor="end">${total} contribuições em ${days} dias</text>
${grid}
<polygon points="${L},${Y(0)} ${pts.join(" ")} ${W - R},${Y(0)}" fill="url(#g)"/>
<polyline points="${pts.join(" ")}" fill="none" stroke="${C.title}" stroke-width="2.5" stroke-linejoin="round"/>
${dots}${labels}`;
  return frame(W, H, "Atividade nos últimos dias", body);
}

const u = await fetchData();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/stats.svg`, statsCard(u));
writeFileSync(`${OUT}/langs.svg`, langsCard(u));
writeFileSync(`${OUT}/activity.svg`, activityCard(u));
console.log("cards gerados");
