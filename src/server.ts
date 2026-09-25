/**
 * MCP tool surface for Once Upon YOUR Child.
 *
 * Designed for a voice agent (Alexa+): every tool returns text that can be
 * read aloud as-is, plus structured fields for agents that want them. The
 * phrasing adapts to the hero's age band (Sprout <=5, Explorer 6-8,
 * Adventurer 9-12, Creator 13-14) because a four-year-old and a
 * thirteen-year-old answer a question very differently.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OuycClient, OuycError, type Choice, type Hero } from "./ouyc-client.js";
import {
  ageBand,
  choicesForSpeech,
  endingLine,
  resolveChoice,
  sceneBody,
  segmentForSpeech,
  speakableError,
  storyText,
  toSpeech,
} from "./voice.js";

/** Per open story: the choices on the table plus who the story is for. */
interface OpenStory {
  choices: Choice[];
  age?: number | null;
  heroName?: string;
}
const openStories = new Map<string, OpenStory>();

function heroSummary(h: Hero): string {
  const bits = [h.name];
  if (h.age) bits.push(`age ${h.age}`);
  if (h.role) bits.push(String(h.role));
  const pets = Array.isArray(h.pets) ? h.pets.length : 0;
  if (pets) bits.push(`${pets} buddy${pets === 1 ? "" : "ies"}`);
  if (h.comfort_item) bits.push(`comfort item: ${h.comfort_item}`);
  return bits.join(", ");
}

/** Errors are spoken too, so keep them gentle and short. */
function fail(err: unknown, heroName?: string) {
  let text: string;
  if (err instanceof OuycError) {
    text = speakableError(err.status, err.message, heroName);
  } else if (err instanceof Error) {
    text = speakableError(undefined, err.message, heroName);
  } else {
    text = String(err);
  }
  return { isError: true as const, content: [{ type: "text" as const, text }] };
}

/** Younger children get a shorter path by default; the app's bands do the same. */
function defaultLength(age: number | null | undefined): "short" | "medium" | "long" {
  return ageBand(age) === "sprout" ? "short" : "medium";
}

const adventureOutput = {
  story_id: z.string(),
  title: z.string().optional(),
  speech: z.string().describe("Read this aloud verbatim"),
  choices: z.array(z.object({ number: z.number(), id: z.string(), text: z.string() })),
  is_ending: z.boolean(),
  hero: z.object({ name: z.string(), age: z.number().nullable().optional() }).optional(),
};

export function buildServer(client: OuycClient): McpServer {
  const server = new McpServer(
    { name: "once-upon-your-child", version: "0.2.0" },
    {
      instructions: [
        "You are a warm bedtime storyteller for a child, speaking through Once Upon YOUR Child.",
        "Call list_heroes first if you do not know the child's hero name.",
        "For a choose-your-own-path story: start_adventure, read the speech aloud, wait for the",
        "child's answer, then call choose_path with exactly what they said. Repeat until is_ending.",
        "For a wind-down story with no choices: tell_bedtime_story.",
        "Story turns take ten to twenty seconds. Before each call say one short bridge line,",
        "like 'Let's see what happens next' or 'Once upon a time', then read the result.",
        "The speech is already written for the child's age: for five and under it ends with an",
        "either-or question in the child's name, so do not add numbers or extra options.",
        "Never invent story text yourself; read what the tools return. Keep your own words short and gentle.",
      ].join(" "),
    },
  );

  server.registerTool(
    "list_heroes",
    {
      title: "List the family's heroes",
      description:
        "Lists the saved hero characters (the child's custom heroes) so the storyteller can ask which one to use.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const heroes = await client.listHeroes();
        if (heroes.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No heroes yet. Create one in the Once Upon YOUR Child app first, then ask again.",
              },
            ],
          };
        }
        const lines = heroes.map((h) => `- ${heroSummary(h)} (id ${h.id})`);
        return { content: [{ type: "text", text: `Heroes:\n${lines.join("\n")}` }] };
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "start_adventure",
    {
      title: "Start a choose-your-own-path story",
      description:
        "Begins an interactive Pick-a-Path story for a hero. Returns the opening scene and the choices to read aloud, phrased for the hero's age. Optional feeling (e.g. 'worried about the first day of school') steers the story toward a gentle coping arc.",
      inputSchema: {
        hero: z.string().describe("Hero name or id from list_heroes"),
        theme: z.string().optional().describe("e.g. Dragons, Space, Under the sea, Forest friends"),
        feeling: z
          .string()
          .optional()
          .describe("What the child is feeling or facing tonight, in their words"),
        length: z
          .enum(["short", "medium", "long"])
          .optional()
          .describe("Default: short for ages 5 and under, otherwise medium"),
        tone: z.string().optional().describe("e.g. whimsical, calm, silly. Default whimsical"),
        avoid: z.string().optional().describe("Things to keep out of the story, e.g. 'no monsters, no storms'"),
      },
      outputSchema: adventureOutput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ hero, theme, feeling, length, tone, avoid }) => {
      let h: Hero | undefined;
      try {
        h = await client.findHero(hero);
        if (!h) return fail(new Error(`I could not find a hero called "${hero}". Try list_heroes.`));
        const result = await client.startAdventure({
          character_id: h.id,
          age: h.age,
          theme: theme ?? "Adventure",
          tone: tone ?? "whimsical",
          length: length ?? defaultLength(h.age),
          life_challenge: feeling,
          avoid,
        });
        const seg = result.segment;
        const opts = { age: h.age, heroName: h.name };
        openStories.set(result.story_id, { choices: seg.choices ?? [], ...opts });
        const speech = segmentForSpeech(seg, opts);
        const structured = {
          story_id: result.story_id,
          title: result.title ? toSpeech(result.title) : undefined,
          speech,
          choices: (seg.choices ?? []).map((c, i) => ({ number: i + 1, id: c.id, text: c.text })),
          is_ending: (seg.choices ?? []).length === 0,
          hero: { name: h.name, age: h.age ?? null },
        };
        return { content: [{ type: "text", text: speech }], structuredContent: structured };
      } catch (e) {
        return fail(e, h?.name);
      }
    },
  );

  server.registerTool(
    "choose_path",
    {
      title: "Continue the story with the child's choice",
      description:
        "Continues an interactive story. Pass the child's answer as spoken: a number ('two'), the choice text ('the cave'), or anything else they suggest. Returns the next scene and new choices, or the ending.",
      inputSchema: {
        story_id: z.string().describe("story_id from start_adventure"),
        choice: z.string().describe("What the child said"),
      },
      outputSchema: adventureOutput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ story_id, choice }) => {
      let open = openStories.get(story_id);
      try {
        if (!open) {
          // Server restarted or another instance took the first turn: rebuild
          // the open choices and the hero from the story itself.
          const full = await client.getAdventure(story_id);
          const last = full.segments?.[full.segments.length - 1];
          const heroName = typeof full.character_name === "string" ? full.character_name : undefined;
          const age = typeof full.age === "number" ? full.age : undefined;
          open = { choices: last?.choices ?? [], heroName, age };
        }
        const resolved = resolveChoice(choice, open.choices);
        const result = await client.continueAdventure({ story_id, ...resolved });
        const seg = result.segment;
        const ended = Boolean(result.is_completed) || (seg.choices ?? []).length === 0;
        const opts = { age: open.age, heroName: open.heroName };
        if (ended) openStories.delete(story_id);
        else openStories.set(story_id, { ...open, choices: seg.choices });
        const body = ended
          ? `${seg.title ? toSpeech(seg.title) + ".\n\n" : ""}${sceneBody(seg.content)}\n\n${endingLine(opts)}`
          : segmentForSpeech(seg, opts);
        const structured = {
          story_id,
          title: seg.title ? toSpeech(seg.title) : undefined,
          speech: body,
          choices: ended ? [] : seg.choices.map((c, i) => ({ number: i + 1, id: c.id, text: c.text })),
          is_ending: ended,
          hero: open.heroName ? { name: open.heroName, age: open.age ?? null } : undefined,
        };
        return { content: [{ type: "text", text: body }], structuredContent: structured };
      } catch (e) {
        return fail(e, open?.heroName);
      }
    },
  );

  server.registerTool(
    "tell_bedtime_story",
    {
      title: "Tell a calming bedtime story",
      description:
        "Generates a complete wind-down story for a hero, sized to a number of minutes. No choices; read it straight through, slowly. The hero's buddies come along; a feeling, if given, is passed to the app.",
      inputSchema: {
        hero: z.string().describe("Hero name or id from list_heroes"),
        feeling: z
          .string()
          .optional()
          .describe("What the child is feeling tonight, e.g. 'sad that grandma went home'"),
        minutes: z.number().int().min(2).max(15).optional().describe("Target length, default 5; 3 for ages 5 and under"),
        mood: z
          .enum(["calming", "brave", "funny", "friendship", "silly", "dreamy"])
          .optional()
          .describe("Default calming. 'silly' means funny; 'dreamy' means calming."),
        theme: z.string().optional(),
      },
      outputSchema: {
        title: z.string().optional(),
        speech: z.string().describe("Read this aloud verbatim"),
        wisdom_gem: z.string().optional(),
        minutes: z.number().describe("Approximate read-aloud minutes"),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ hero, feeling, minutes, mood, theme }) => {
      let h: Hero | undefined;
      try {
        h = await client.findHero(hero);
        if (!h) return fail(new Error(`I could not find a hero called "${hero}". Try list_heroes.`));
        const mins = minutes ?? (ageBand(h.age) === "sprout" ? 3 : 5);
        const story = await client.bedtimeStory({
          hero: h,
          theme: theme ?? "Bedtime",
          feelings_prompt: feeling,
          bedtime_duration_minutes: mins,
          // The backend knows calming, brave, funny and friendship; anything
          // else silently becomes calming, so map the friendly aliases.
          bedtime_mood: mood === "silly" ? "funny" : mood === "dreamy" || !mood ? "calming" : mood,
          story_length: mins <= 3 ? "short" : mins >= 10 ? "long" : "standard",
        });
        const title = story.title ? toSpeech(story.title) : undefined;
        const text = storyText(story);
        const gem = story.wisdom_gem ? toSpeech(story.wisdom_gem) : undefined;
        const speech = [title ? `${title}.` : "", text, gem ? `Tonight's wisdom gem: ${gem}` : "", endingLine({ age: h.age, heroName: h.name })]
          .filter(Boolean)
          .join("\n\n");
        const words = text.split(/\s+/).filter(Boolean).length;
        return {
          content: [{ type: "text", text: speech }],
          structuredContent: { title, speech, wisdom_gem: gem, minutes: Math.round((words / 130) * 10) / 10 },
        };
      } catch (e) {
        return fail(e, h?.name);
      }
    },
  );

  server.registerTool(
    "narrate",
    {
      title: "Narrate text with a storybook voice",
      description:
        "Turns story text into MP3 narration using the app's child-safe storyteller voices. Use when the host can play audio instead of reading aloud itself.",
      inputSchema: {
        text: z.string().min(1).max(6000),
        voice_id: z.string().optional().describe("From list_voices; default is the app's default"),
        speed: z.number().min(0.7).max(1.2).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ text, voice_id, speed }) => {
      try {
        const r = await client.synthesize({ text: toSpeech(text), voice_id, speed });
        return {
          content: [
            { type: "audio", data: r.audio_base64, mimeType: "audio/mpeg" },
            { type: "text", text: `Narration ready (${r.provider ?? "tts"}, voice ${r.voice_id ?? "default"}).` },
          ],
        };
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_voices",
    {
      title: "List storyteller voices",
      description: "Lists the narration voices available to the narrate tool.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const v = await client.listVoices();
        const lines = v.voices.map((x) => `- ${x.name} (id ${x.id})${x.id === v.default_voice_id ? " [default]" : ""}`);
        return { content: [{ type: "text", text: `Voices:\n${lines.join("\n")}` }] };
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerPrompt(
    "bedtime",
    {
      title: "Bedtime with a hero",
      description: "A ready-made opening for a voice bedtime session.",
      argsSchema: { hero: z.string().describe("Hero name"), feeling: z.string().optional() },
    },
    ({ hero, feeling }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `It's bedtime. Start a gentle choose-your-own-path story for ${hero}${
              feeling ? ` who is feeling ${feeling}` : ""
            }. Read each scene slowly, then ask me which path to take.`,
          },
        },
      ],
    }),
  );

  return server;
}
