import fs from "fs";
import path from "path";
import { chromium } from "playwright";

export type Planche = {
  titre: string;
  cases: { auteur: string; replique: string; emoji: string; legende: string }[];
};

export const BD_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      titre: { type: "string" },
      cases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            auteur: { type: "string" },
            replique: { type: "string" },
            emoji: { type: "string" },
            legende: { type: "string" },
          },
          required: ["auteur", "replique", "emoji", "legende"],
          additionalProperties: false,
        },
      },
    },
    required: ["titre", "cases"],
    additionalProperties: false,
  },
};

const MAX_PLANCHES = 3;

/** Same normalisation on both sides: the pseudo Claude returns vs the one we saw in Discord. */
export const avatarKey = (pseudo: string) => pseudo.trim().toLowerCase();

// Everything shown comes from Discord users via the model: escape it all before it reaches the page.
// Data only ever lands in text nodes or quoted attributes; CSS gets numbers and values from our own tables.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---- manga look: emoji -> mood, which drives background, pose, bubble shape and SFX ----
type Mood = "smug" | "doubt" | "rage" | "sweat" | "dead" | "melt" | "plain";
const MOODS: Record<Exclude<Mood, "plain">, string> = {
  smug: "😎😇😏😌🤑🥳😁😄😂🤣😈🤓😜",
  doubt: "🤨🧐🙄🤔😒😑😐🫤",
  rage: "😤😡🤬😠👿💢🔥",
  sweat: "😬😅😰😳🥲😓🫣😶",
  dead: "💀☠😵😱🪦👻😭⚰",
  melt: "🫠🥴😩😮😪🫥",
};
// two variants per mood, alternating by row so two neighbours with the same mood differ
const SFX: Partial<Record<Mood, [string, string]>> = {
  smug: ["HIN HIN", "TRANQUILLE"], doubt: ["HMMM?", "LOUCHE..."], rage: ["GRRR!!", "RAAAH!!"],
  sweat: ["GLOUPS", "EUH..."], dead: ["R.I.P.", "COULÉ"], melt: ["PFFF...", "FONDU"],
};
const TILT: Record<Mood, number> = { smug: -7, doubt: 9, rage: -5, sweat: 5, dead: 0, melt: -9, plain: 0 };
const moodOf = (emoji: string): Mood => {
  const first = [...emoji][0] || "";
  return (Object.keys(MOODS) as Exclude<Mood, "plain">[]).find((m) => first && MOODS[m].includes(first)) || "plain";
};

const INK = "#111", PAPER = "#fff", RED = "#e4002b";

// The character: the avatar is the head of a drawn bust, posed by mood.
// Drawn for a speaker standing on the right (hands on the outer side); mirrored for the left.
function character(mood: Mood, avatarUrl: string | undefined, auteur: string, right: boolean, id: number): string {
  const arm = (d: string) => `<path d="${d}" stroke="${PAPER}" stroke-width="44" stroke-linecap="round"/><path d="${d}" stroke="${INK}" stroke-width="35" stroke-linecap="round"/>`;
  const hand = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>`;
  const mirror = right ? "" : "translate(300 0) scale(-1 1)";
  const behind = ({
    sweat: arm("M250 262 L248 118") + hand(236, 86, 21),
    rage: arm("M246 262 L262 132") + hand(264, 104, 28) +
      `<path d="M250 96h28M252 108h26" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M226 60q-8 -22 4 -40M300 70q10 -24 -2 -44" stroke="${RED}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  } as Partial<Record<Mood, string>>)[mood] || "";
  const front = ({
    smug: arm("M72 262 L214 238") + hand(222, 236, 16) + arm("M228 264 L90 238") + hand(80, 236, 16) +
      `<path d="M250 8l5 14l14 5l-14 5l-5 14l-5 -14l-14 -5l14 -5zM276 76l3 9l9 3l-9 3l-3 9l-3 -9l-9 -3l9 -3z" fill="${PAPER}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
    doubt: arm("M226 290 L200 204") + hand(190, 168, 22),
    sweat: `<path d="M214 -6c9 15 12 22 0 29c-12 -7 -9 -14 0 -29zM272 28c7 12 9 18 0 23c-9 -5 -7 -11 0 -23z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`,
    rage: `<g transform="translate(104 12)" stroke="${RED}" stroke-width="7" fill="none" stroke-linecap="round"><path d="M-4 -18q2 12 -14 14M4 -18q-2 12 14 14M-4 18q2 -12 -14 -14M4 18q-2 -12 14 -14"/></g>`,
  } as Partial<Record<Mood, string>>)[mood] || "";
  // drawn on the head itself (follows the head tilt)
  const onHead = ({
    dead: `<g clip-path="url(#c${id})" stroke="${INK}" stroke-width="5">${[96, 112, 128, 144, 160, 176, 192, 208]
      .map((x, i) => `<path d="M${x} 20V${62 + ((i * 37) % 34)}"/>`).join("")}</g>`,
    melt: `<path d="M92 120q-4 30 6 44q10 -14 4 -40zM204 112q6 34 -4 52q-12 -20 -6 -48z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>`,
  } as Partial<Record<Mood, string>>)[mood] || "";
  const soul = mood === "dead" ? `<g transform="${mirror}"><g transform="translate(238 44)"><path d="M0 0C-18 -36 32 -46 27 -10C25 6 36 14 46 9C36 30 4 26 0 0Z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/><circle cx="8" cy="-16" r="2.6"/><circle cx="18" cy="-17" r="2.6"/></g></g>` : "";
  const puddle = mood === "melt" ? `<path d="M4 262q24 -22 66 -14q80 -16 160 0q48 -8 66 14q-10 22 -146 22t-146 -22z" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>` : "";
  const whole = mood === "dead" ? "rotate(13 150 280)" : mood === "melt" ? "translate(0 62)" : "";
  const tilt = (right ? 1 : -1) * TILT[mood];
  const head = avatarUrl // avatars stay in colour: the only colour on the page besides the red accent
    ? `<image href="${esc(avatarUrl)}" x="84" y="26" width="132" height="132" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${id})"/>`
    : `<circle cx="150" cy="92" r="66" fill="url(#dots${id})"/><text x="150" y="124" text-anchor="middle" font-size="96" font-family="Bangers,Impact,sans-serif" fill="${INK}" stroke="${PAPER}" stroke-width="7" paint-order="stroke">${esc([...auteur.trim()][0]?.toUpperCase() || "?")}</text>`;
  return `<svg class="perso" viewBox="0 0 300 280" overflow="visible">
    <defs><clipPath id="c${id}"><circle cx="150" cy="92" r="66"/></clipPath>
    <pattern id="dots${id}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${PAPER}"/><circle cx="4.5" cy="4.5" r="2" fill="${INK}"/></pattern></defs>
    ${soul}
    <g transform="${whole}">
      <g transform="${mirror}">${behind}
        <path d="M28 290C28 212 66 184 122 176L178 176C234 184 272 212 272 290Z" fill="${INK}" stroke="${PAPER}" stroke-width="4"/>
        <path d="M128 150V182Q150 198 172 182V150Z" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
        <path d="M120 178L150 216L180 178" fill="none" stroke="${PAPER}" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="150" cy="238" r="4.5" fill="${PAPER}"/><circle cx="150" cy="262" r="4.5" fill="${PAPER}"/>
      </g>
      <g transform="rotate(${tilt} 150 160)">
        <circle cx="150" cy="92" r="71" fill="${PAPER}"/>${head}
        <circle cx="150" cy="92" r="66" fill="none" stroke="${INK}" stroke-width="6"/>${onHead}
      </g>
      <g transform="${mirror}">${front}</g>
    </g>${puddle}</svg>`;
}

// shouting bubble: deterministic starburst, stretched to the bubble box
const BURST = (() => {
  const n = 26, pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? 43.5 + ((i * 7) % 3) : 50 - ((i * 5) % 6) * 0.5;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<svg class="burst" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="${pts.join(" ")}" fill="${PAPER}" stroke="${INK}" stroke-width="5" vector-effect="non-scaling-stroke" stroke-linejoin="miter"/></svg>`;
})();

// short lines shout, long lines stay readable at Discord size (23px * 550/900 = 14px)
const fontSize = (len: number, boxW: number) =>
  (len <= 14 ? 50 : len <= 28 ? 38 : len <= 55 ? 30 : len <= 85 ? 26 : 23) - (boxW < 380 && len > 28 ? 2 : 0);

const CSS = `
body{margin:0}
#bd{width:900px;padding:20px 20px 24px;background:#fff;box-sizing:border-box;font-family:"Comic Neue","Comic Sans MS",cursive;color:${INK}}
header{position:relative;background:${INK};color:#fff;padding:14px 26px 24px 26px;margin-bottom:14px;clip-path:polygon(0 0,100% 0,100% 100%,0 calc(100% - 14px));overflow:hidden}
header::after{content:"";position:absolute;inset:0 0 0 55%;background:radial-gradient(circle,#fff 1.7px,transparent 2px) 0 0/10px 10px;-webkit-mask-image:linear-gradient(100deg,transparent 10%,#000);opacity:.55}
.tag{position:relative;z-index:1;display:inline-block;background:${RED};font:22px Bangers,Impact,sans-serif;letter-spacing:2px;padding:1px 12px;transform:skewX(-12deg)}
h1{position:relative;z-index:1;margin:4px 0 0;font:400 62px/1 Bangers,Impact,sans-serif;letter-spacing:2px;text-shadow:4px 4px 0 ${RED};text-transform:uppercase;overflow-wrap:break-word}
h1.m{font-size:48px}h1.l{font-size:38px}
.cast{position:relative;z-index:1;font-weight:700;font-size:19px;letter-spacing:1px;text-transform:uppercase;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* a row = 2 panels stacked in one grid cell, each clipped to its slanted polygon; row height follows content */
.row{display:grid}
.panel{grid-area:1/1;display:grid;background:${INK};--ink:${INK};--paper:#fff}
.panel.inv{--ink:#fff;--paper:${INK}}
.in{position:relative;display:flex;min-height:330px;background:#fff}
.inv .in{background:${INK}}
.bg,.spot{position:absolute;inset:0}
/* screentone: real halftone (dots shrink along the gradient) */
.plain .bg,.smug .bg,.doubt .bg{background:linear-gradient(var(--a),#fff 12%,#000 72%),radial-gradient(circle,#000,#fff 75%) 0 0/9px 9px;background-blend-mode:screen;filter:contrast(40)}
.L .bg{--a:65deg}.R .bg{--a:295deg}.L.doubt .bg{--a:115deg}.R.doubt .bg{--a:245deg}
.inv.plain .bg,.inv.smug .bg,.inv.doubt .bg{filter:contrast(40) invert(1)}
.sweat .bg{background:repeating-linear-gradient(115deg,var(--ink) 0 1.5px,transparent 1.5px 9px);-webkit-mask-image:linear-gradient(to top,#000,transparent 75%)}
/* focus lines converge on the speaker's head */
.rage .bg{background:repeating-conic-gradient(from 3deg at var(--hx) var(--hy),var(--ink) 0 1.1deg,transparent 1.1deg 6deg),repeating-conic-gradient(from 0deg at var(--hx) var(--hy),var(--ink) 0 .5deg,transparent .5deg 4.3deg),repeating-conic-gradient(from 1deg at var(--hx) var(--hy),var(--ink) 0 2deg,transparent 2deg 17deg);-webkit-mask-image:radial-gradient(circle at var(--hx) var(--hy),transparent 105px,#000 235px)}
/* gloom lines falling from the top */
.dead .bg,.melt .bg{background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 15px),repeating-linear-gradient(90deg,var(--ink) 0 3px,transparent 3px 37px);-webkit-mask-image:linear-gradient(to bottom,#000 0,transparent 45%)}
/* punchline: white halo + halftone glow behind the head */
.spot{background:radial-gradient(circle at var(--hx) var(--hy),#fff 0 92px,transparent 93px),radial-gradient(circle,#fff 1.7px,transparent 2.1px) 0 0/9px 9px;-webkit-mask-image:radial-gradient(circle at var(--hx) var(--hy),#000 92px,rgba(0,0,0,.9) 93px,transparent 190px)}
.box{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;box-sizing:border-box;padding-left:14px;padding-right:14px}
.R .box{align-items:flex-end}
.legende{align-self:flex-start;max-width:100%;box-sizing:border-box;background:${INK};color:#fff;font-weight:700;font-style:italic;font-size:20px;line-height:1.15;padding:5px 12px 6px;margin-left:-8px;border:3px solid ${INK};position:relative;z-index:3;overflow-wrap:break-word}
.inv .legende{background:#fff;color:${INK};border-color:#fff}
/* bubble sits right above its speaker (margin-top:auto), tail on the speaker's side */
.bulle{position:relative;z-index:3;margin-top:auto;isolation:isolate;max-width:100%;min-width:170px;box-sizing:border-box;background:#fff;color:${INK};border:4px solid ${INK};border-radius:34px;padding:12px 20px 14px;font-weight:700;line-height:1.14;text-align:center;overflow-wrap:break-word}
.bulle.rond{border-radius:50%/46%;padding:20px 30px 22px}
.inv .bulle{box-shadow:0 0 0 3px #fff}
.b-sweat,.b-melt{border-radius:46% 54% 50% 50%/58% 44% 56% 42%;border-style:dashed;padding:18px 26px}
.b-doubt{border-radius:28px 44px 30px 40px}
.b-rage{border:none;background:none;padding:40px 62px 42px;margin-left:-6px;margin-right:-6px}
.burst{position:absolute;inset:0;width:100%;height:100%;z-index:-1;overflow:visible}
.bulle::before,.bulle::after{content:"";position:absolute;top:100%;left:70px}
.bulle::before{width:44px;height:46px;margin-left:-6px;background:${INK};clip-path:polygon(0 0,100% 0,22% 100%)}
.bulle::after{width:30px;height:32px;margin-top:-5px;background:#fff;clip-path:polygon(0 0,100% 0,20% 100%)}
.R .bulle::before,.R .bulle::after{left:auto;right:70px;transform:scaleX(-1)}
.R .bulle::before{margin-right:-6px}
.b-rage::before,.b-rage::after{top:calc(100% - 26px)}
/* the scene: fixed-height stage under the bubble, so text never covers the character */
.scene{position:relative;height:205px;margin-top:26px;align-self:stretch;flex:none}
.perso{position:absolute;bottom:0;left:-20px;width:220px;z-index:2}
.R .perso{left:auto;right:-20px}
.emoji{position:absolute;bottom:138px;left:138px;z-index:4;font:58px/1 "Segoe UI Emoji","Noto Color Emoji",sans-serif;white-space:nowrap;transform:rotate(12deg);filter:grayscale(1) contrast(1.45) brightness(1.1) drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff)}
.R .emoji{left:auto;right:138px;transform:rotate(-12deg)}
.nom{position:absolute;bottom:10px;left:12px;z-index:4;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;color:${INK};border:3px solid ${INK};font:22px/1.1 Bangers,Impact,sans-serif;letter-spacing:1.5px;padding:2px 10px;transform:rotate(-4deg)}
.R .nom{left:auto;right:12px;transform:rotate(4deg)}
.sfx{position:absolute;bottom:26px;right:-4px;z-index:1;font:64px/1 Bangers,Impact,sans-serif;letter-spacing:3px;color:var(--paper);-webkit-text-stroke:2.5px var(--ink);text-shadow:4px 4px 0 var(--ink);transform:rotate(-11deg);white-space:nowrap}
.R .sfx{right:auto;left:-4px;transform:rotate(9deg)}
.rage .sfx,.last .sfx{color:${RED};-webkit-text-stroke:2.5px ${INK};text-shadow:4px 4px 0 var(--ink)}
.inv .sfx{-webkit-text-stroke-color:#fff;text-shadow:none}
.last .sfx{bottom:56px}
.fin{position:absolute;bottom:12px;z-index:5;background:${RED};color:#fff;font:24px Bangers,Impact,sans-serif;letter-spacing:3px;padding:0 12px;transform:skewX(-12deg)}
.L .fin{right:2px}.R .fin{left:2px}
`;

function html(planche: Planche, avatars: Map<string, string>): string {
  const n = planche.cases.length >= 6 ? 6 : 4; // 2 per row: keep the grid full
  const cases = planche.cases.slice(0, n);
  const speakers = [...new Set(cases.map((c) => avatarKey(c.auteur)))];
  const names = [...new Set(cases.map((c) => c.auteur.trim()))];
  const W = 860, GAP = 14, TILT_Y = 16;
  const rows: string[] = [];
  for (let r = 0; r < n / 2; r++) {
    const pair = [cases[2 * r], cases[2 * r + 1]];
    const lastRow = r === n / 2 - 1;
    // the one who talks more gets more room (clamped); the slanted vertical gutter alternates direction
    const la = pair[0].replique.length + 30, lb = pair[1].replique.length + 30;
    const x = Math.round(W * Math.min(0.6, Math.max(0.4, la / (la + lb))));
    const s = r % 2 ? -24 : 24;
    // horizontal gutters are tilted too: this row's top edge follows the previous row's bottom edge
    const dTop = r === 0 ? 0 : r % 2 ? TILT_Y : -TILT_Y, dBot = lastRow ? 0 : r % 2 ? -TILT_Y : TILT_Y;
    const top = (px: number) => (dTop > 0 ? dTop * (1 - px / W) : -dTop * (px / W)); // from the row top
    const bot = (px: number) => (dBot > 0 ? dBot * (px / W) : -dBot * (1 - px / W)); // from the row bottom
    // panel k as a clip polygon inset by d (0 = black frame shape, d = paper inside the frame)
    const poly = (k: number, d: number) => {
      const xs = k === 0 ? [d, x + s - GAP / 2 - d, x - s - GAP / 2 - d, d] : [x + s + GAP / 2 + d, W - d, W - d, x - s + GAP / 2 + d];
      const pt = (px: number, i: number) => `${px.toFixed(1)}px ${i < 2 ? `${(top(px) + d).toFixed(1)}px` : `calc(100% - ${(bot(px) + d).toFixed(1)}px)`}`;
      return `polygon(${xs.map(pt).join(",")})`;
    };
    const boxes = [
      { left: 0, width: x - Math.abs(s) - GAP / 2 },
      { left: x + Math.abs(s) + GAP / 2, width: W - x - Math.abs(s) - GAP / 2 },
    ];
    const panels = pair.map((c, k) => {
      const i = 2 * r + k, last = i === n - 1;
      const mood = moodOf(c.emoji);
      const right = speakers.indexOf(avatarKey(c.auteur)) % 2 === 1; // a speaker always stands on the same side
      const box = boxes[k], replique = clip(c.replique, 110), len = replique.length;
      // head centre, for focus lines / halo
      const hx = right ? box.left + box.width - 104 : box.left + 104;
      const hy = `calc(100% - ${Math.abs(dBot) + (mood === "melt" ? 93 : 138)}px)`;
      const fsz = fontSize(len, box.width) + (last && len <= 28 ? 8 : 0);
      const sfx = SFX[mood];
      return `<div class="panel ${mood} ${right ? "R" : "L"}${last ? " inv last" : ""}" style="clip-path:${poly(k, 0)};--hx:${hx}px;--hy:${hy}">
        <div class="in" style="clip-path:${poly(k, last ? 9 : 6)}"><div class="bg"></div>${last ? `<div class="spot"></div>` : ""}
        <div class="box" style="margin-left:${box.left}px;width:${box.width}px;padding-top:${Math.abs(dTop) + 18}px;padding-bottom:${Math.abs(dBot)}px">
          ${c.legende ? `<div class="legende">${esc(clip(c.legende, 70))}</div>` : ""}
          <div class="bulle b-${mood}${len <= 28 && mood !== "rage" ? " rond" : ""}" style="font-size:${fsz}px">${mood === "rage" ? BURST : ""}${esc(replique)}</div>
          <div class="scene">
            ${sfx && box.width > 330 ? `<div class="sfx">${sfx[r % 2]}</div>` : ""}
            ${character(mood, avatars.get(avatarKey(c.auteur)), c.auteur, right, i)}
            <span class="emoji">${esc(clip(c.emoji, 8))}</span>
            <span class="nom">${esc(c.auteur)}</span>
            ${last ? `<span class="fin">FIN</span>` : ""}
          </div>
        </div></div>
      </div>`;
    });
    rows.push(`<div class="row" style="margin-top:${r ? GAP - TILT_Y : 0}px">${panels.join("")}</div>`);
  }
  const t = clip(planche.titre, 60);
  return `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:ital,wght@0,700;1,700&display=swap" rel="stylesheet">
<style>${CSS}</style>
<div id="bd"><header><span class="tag">MINI BD</span><h1 class="${t.length > 40 ? "l" : t.length > 24 ? "m" : ""}">${esc(t)}</h1>
<div class="cast">avec ${esc(names.join(" · "))}</div></header>${rows.join("")}</div>`;
}

/** One PNG per planche (4 or 6 cases each). Planches with fewer than 4 cases are skipped. */
export async function renderPlanches(planches: Planche[], avatars: Map<string, string>): Promise<Buffer[]> {
  const todo = planches.filter((p) => p.cases.length >= 4).slice(0, MAX_PLANCHES);
  if (todo.length === 0) return [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1.5 });
    const images: Buffer[] = [];
    for (const planche of todo) {
      await page.setContent(html(planche, avatars), { waitUntil: "networkidle", timeout: 10_000 });
      images.push(await page.locator("#bd").screenshot({ type: "png" }));
    }
    return images;
  } finally {
    await browser.close();
  }
}

// Visual check: `pnpm exec ts-node src/commands/bd.ts` writes screens/bd-test.png, bd-test-6.png, bd-test-stress.png
if (require.main === module) {
  const long = (s: string) => s.padEnd(110, " Vraiment.").slice(0, 110);
  const samples: Planche[] = [
    {
      titre: "Le reroll de trop",
      cases: [
        { auteur: "Henri", emoji: "😎", legende: "Stage 3-2", replique: "Je reroll tout au niveau 6, faites-moi confiance." },
        { auteur: "Kévin", emoji: "🤨", legende: "", replique: "C'est exactement ce que tu as dit avant de finir 8e hier." },
        { auteur: "Henri", emoji: "😤", legende: "Mauvaise foi, épisode 47", replique: "Hier c'était la faute du lobby, du matchmaking, de mon chat et de la météo. Aujourd'hui c'est du pur skill." },
        { auteur: "Kévin", emoji: "💀", legende: "Vingt minutes plus tard…", replique: "8e. Encore." },
        { auteur: "Henri", emoji: "🙃", legende: "", replique: "Case en trop, ignorée." },
      ],
    },
    {
      titre: "Qui a touché au planning ?",
      cases: [
        { auteur: "Léa", emoji: "🙄", legende: "Dimanche, 23h", replique: "Qui a déplacé la soirée ranked à mardi ?" },
        { auteur: "Henri", emoji: "😇", legende: "", replique: "Aucune idée." },
        { auteur: "Maxime_du_38", emoji: "🧐", legende: "", replique: "L'historique dit que c'est toi, à 14h02." },
        { auteur: "Henri", emoji: "😬", legende: "", replique: "C'était un test." },
        { auteur: "Léa", emoji: "😤", legende: "Silence dans le salon", replique: "Un test qui tombe pile le soir de ton anniversaire de couple, quel hasard." },
        { auteur: "Henri", emoji: "🫠", legende: "", replique: "On dit mardi alors ?" },
      ],
    },
    {
      // stress: max lengths, 4 speakers, one without avatar, unknown emoji, markup in every string
      titre: 'Le <b>titre</b> "le plus long" qu\'on puisse & doive écrire!!',
      cases: [
        { auteur: "xX_<b>Le_Roi_Du_Reroll</b>_&_Xxx", emoji: "😎", legende: 'Une <b>légende</b> de "soixante-dix" caractères & pas un d\'plus, juré!', replique: 'Un <b>gras</b>, des "guillemets", une \'apostrophe\' & une esperluette.' },
        { auteur: "Kévin", emoji: "🦆", legende: "", replique: "Coin." },
        { auteur: "Léa", emoji: "😤", legende: "Les deux parlent trop", replique: long("Cent dix caractères à gauche, pour voir si la bulle tient encore debout.") },
        { auteur: "Sans_Avatar", emoji: "🧐", legende: "", replique: long("Et cent dix à droite dans la même rangée, <script>alert(1)</script>.") },
        { auteur: "Kévin", emoji: "😬", legende: "", replique: "Bon." },
        { auteur: "Sans_Avatar", emoji: "💀", legende: "Fin de soirée", replique: long("Une chute de cent dix caractères, parce que le modèle n'écoute jamais.") },
        { auteur: "Léa", emoji: "🙃", legende: "", replique: "Case en trop, ignorée." },
      ],
    },
  ];
  for (const [what, v] of [["titre", samples[2].titre], ["pseudo", samples[2].cases[0].auteur], ["legende", samples[2].cases[0].legende], ["replique", samples[2].cases[2].replique]] as const) {
    const want = { titre: 60, pseudo: 32, legende: 70, replique: 110 }[what];
    if (v.length !== want) throw new Error(`stress ${what}: ${v.length} chars, expected ${want}`);
  }
  const av = (k: number) => `https://cdn.discordapp.com/embed/avatars/${k}.png`;
  const avatars = new Map([
    [avatarKey("Henri"), av(0)], [avatarKey("Kévin"), av(1)], [avatarKey("Léa"), av(2)],
    [avatarKey(samples[2].cases[0].auteur), av(4) + "?x=1&y=<2>"],
  ]);
  const doc = html(samples[2], avatars);
  if (/<b>|<script|"le plus|\?x=1&y/.test(doc)) throw new Error("unescaped data reached the page");
  renderPlanches([samples[0], { titre: "trop courte", cases: [] }, samples[1], samples[2], samples[0]], avatars).then((images) => {
    if (images.length !== 3) throw new Error(`expected 3 planches, got ${images.length}`);
    const dir = path.join(__dirname, "../../screens");
    fs.mkdirSync(dir, { recursive: true });
    ["bd-test.png", "bd-test-6.png", "bd-test-stress.png"].forEach((f, i) => fs.writeFileSync(path.join(dir, f), images[i]));
    console.log("bd: ok ->", dir);
  });
}
