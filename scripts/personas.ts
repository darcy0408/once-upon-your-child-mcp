/**
 * Age-band walkthrough: one hero per band, an adventure opening + one turn,
 * and a short bedtime story, all through the MCP server against the real
 * backend. Prints read-aloud stats so we can judge each band's fit by ear.
 *
 * Bands follow the app: Sprout <=5, Explorer 6-8, Adventurer 9-12, Creator 13-14.
 * Costs real model calls (about 3 per hero).
 *
 *   npm run dev
 *   npx tsx scripts/personas.ts            # all bands
 *   PERSONAS=Theo,Eli npx tsx scripts/personas.ts
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const API = (process.env.OUYC_API_BASE ?? "https://story-weaver-app-production.up.railway.app").replace(/\/+$/, "");
const TOKEN = process.env.OUYC_TOKEN;
if (!TOKEN) throw new Error("OUYC_TOKEN missing in .env");
const url = new URL(process.env.MCP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3333}/mcp`);

type Persona = {
  name: string;
  age: number;
  band: string;
  hero: Record<string, unknown>;
  theme: string;
  feeling: string;
  bedtimeFeeling: string;
  answer: string; // what this child plausibly says at the first choice
};

const PERSONAS: Persona[] = [
  {
    name: "Theo",
    age: 4,
    band: "Sprout",
    hero: {
      gender: "boy", role: "Little Helper", hair: "short black", eyes: "brown", outfit: "dinosaur pajamas",
      comfort_item: "a soft green dinosaur named Rex", strengths: ["brave", "giggly"], fears: ["the dark"], goals: ["sleep in his own bed"],
      pets: [{ name: "Waffles", species: "puppy", personality: "sleepy", color: "golden" }],
    },
    theme: "Forest friends",
    feeling: "scared of the dark",
    bedtimeFeeling: "scared of the dark",
    answer: "the puppy!",
  },
  {
    name: "Maya",
    age: 6,
    band: "Explorer",
    hero: {},
    theme: "Under the sea",
    feeling: "nervous about her first swim lesson tomorrow",
    bedtimeFeeling: "missing grandma",
    answer: "two",
  },
  {
    name: "Zara",
    age: 10,
    band: "Adventurer",
    hero: {
      gender: "girl", role: "Inventor", hair: "long braids", eyes: "hazel", outfit: "overalls with lots of pockets",
      comfort_item: "her notebook of inventions", strengths: ["clever", "stubborn"], fears: ["being laughed at"], goals: ["win the science fair"],
      pets: [{ name: "Bolt", species: "robot owl", personality: "sarcastic", color: "copper" }],
    },
    theme: "Space",
    feeling: "left out by her friends at school",
    bedtimeFeeling: "worried about a test tomorrow",
    answer: "I want to fix the ship myself instead of asking for help",
  },
  {
    name: "Eli",
    age: 13,
    band: "Creator",
    hero: {
      gender: "boy", role: "Skater", hair: "messy brown", eyes: "green", outfit: "hoodie and scuffed sneakers",
      comfort_item: "his old headphones", strengths: ["loyal", "funny"], fears: ["failing in front of people"], goals: ["land a kickflip"],
      pets: [],
    },
    theme: "Mystery",
    feeling: "had a fight with his best friend",
    bedtimeFeeling: "can't stop thinking about the fight",
    answer: "three",
  },
];

const selected = (process.env.PERSONAS ?? PERSONAS.map((p) => p.name).join(","))
  .split(",")
  .map((s) => s.trim().toLowerCase());

// ── ensure heroes exist ────────────────────────────────────────────────
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  return body;
}

const heroes = await api<{ id: string; name: string; age: number }[]>("/get-characters");
for (const p of PERSONAS) {
  if (!selected.includes(p.name.toLowerCase())) continue;
  if (heroes.some((h) => h.name === p.name)) continue;
  await api("/create-character", { method: "POST", body: JSON.stringify({ name: p.name, age: p.age, ...p.hero }) });
  console.log(`created hero ${p.name} (${p.age})`);
}

// ── stats ──────────────────────────────────────────────────────────────
function stats(text: string) {
  const body = text.replace(/What should happen next\?[\s\S]*$/i, "");
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const wordsPer = sentences.map((s) => s.split(/\s+/).length);
  const words = wordsPer.reduce((a, b) => a + b, 0);
  const avg = sentences.length ? words / sentences.length : 0;
  const max = Math.max(0, ...wordsPer);
  const longest = sentences[wordsPer.indexOf(max)] ?? "";
  return { words, sentences: sentences.length, avg: avg.toFixed(1), max, longest, minutes: (words / 130).toFixed(1) };
}

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[]; structuredContent?: any };
const client = new Client({ name: "personas", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(url));

async function tool(name: string, args: Record<string, unknown>): Promise<{ r: ToolResult; text: string; secs: string }> {
  const t0 = Date.now();
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.isError) throw new Error(`${name} failed: ${text}`);
  return { r, text, secs };
}

function show(label: string, text: string, secs: string, extra = "") {
  const s = stats(text);
  console.log(`\n--- ${label} (${secs}s) ${extra}`);
  console.log(`    ${s.words} words, ${s.sentences} sentences, avg ${s.avg} w/s, longest ${s.max} w, ~${s.minutes} min read`);
  console.log(`    longest: "${s.longest.slice(0, 160)}"`);
  console.log(text.split("\n").map((l) => "    " + l).join("\n").slice(0, 2600));
}

for (const p of PERSONAS) {
  if (!selected.includes(p.name.toLowerCase())) continue;
  console.log(`\n\n########## ${p.name}, age ${p.age} (${p.band}) ##########`);
  try {
    const a = await tool("start_adventure", { hero: p.name, theme: p.theme, feeling: p.feeling, length: "short" });
    const choices = a.r.structuredContent?.choices ?? [];
    show("start_adventure", a.text, a.secs, `${choices.length} choices`);
    const c = await tool("choose_path", { story_id: a.r.structuredContent.story_id, choice: p.answer });
    show(`choose_path "${p.answer}"`, c.text, c.secs, c.r.structuredContent?.is_ending ? "ENDING" : `${c.r.structuredContent?.choices?.length ?? 0} choices`);
    // Bedtime (linear) stories count against the account's daily/monthly
    // quota (free tier: 3/day, 5/month), so they are opt-in here.
    if (process.env.PERSONAS_BEDTIME === "1") {
      const b = await tool("tell_bedtime_story", { hero: p.name, feeling: p.bedtimeFeeling, minutes: 3, mood: "calming" });
      show(`tell_bedtime_story "${p.bedtimeFeeling}"`, b.text, b.secs);
    }
  } catch (e) {
    console.log(`!! ${p.name}: ${(e as Error).message}`);
  }
}

await client.close();
