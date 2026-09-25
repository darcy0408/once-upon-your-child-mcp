/**
 * Helpers that turn backend story payloads into text an assistant can read
 * aloud. Alexa+ speaks whatever we return, so strip formatting and keep the
 * choices in a shape a child can answer by voice ("one", "the cave", ...).
 */
import type { BedtimeStory, Choice, Segment } from "./ouyc-client.js";

export function toSpeech(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[*_#>`~]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The backend's story payload carries the body as `story_text`, with `pages`
 * as a list of plain strings (older shapes used `{text}` objects).
 */
export function storyText(story: BedtimeStory): string {
  const body = toSpeech(story.story_text ?? story.content ?? story.text ?? "");
  if (body) return body;
  if (Array.isArray(story.pages) && story.pages.length > 0) {
    return story.pages
      .map((p) => toSpeech(typeof p === "string" ? p : p?.text))
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

/** "Swim left along the trail." -> "Swim left along the trail" */
function choiceLabel(text: string): string {
  return toSpeech(text).replace(/[.!?\s]+$/, "");
}

export function choicesForSpeech(choices: Choice[]): string {
  if (!choices || choices.length === 0) return "";
  const parts = choices.map((c, i) => `${numberWord(i + 1)}: ${choiceLabel(c.text)}`);
  return `What should happen next? ${parts.join(". ")}. You can also say something else.`;
}

/**
 * The model sometimes appends its own "Choices: 1) ... 2) ..." block to the
 * scene text. The app renders buttons so it never shows; for voice we would
 * read the choices twice, so drop it and keep the structured list.
 */
export function sceneBody(content: string): string {
  return toSpeech(content)
    .replace(/\n?\s*choices?\s*:\s*(\n|\s)*1[).]\s[\s\S]*$/i, "")
    .trim();
}

export function segmentForSpeech(segment: Segment): string {
  const head = segment.title ? `${toSpeech(segment.title)}.\n\n` : "";
  return `${head}${sceneBody(segment.content)}\n\n${choicesForSpeech(segment.choices)}`.trim();
}

export function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six"][n] ?? String(n);
}

/**
 * Map what a child said back to a choice id. Accepts an id, a 1-based
 * number (digit, word, or ordinal), or a fuzzy match on the choice text.
 * Anything else becomes a free-text "custom" choice, which the backend
 * treats as story input, never as an instruction.
 */
export function resolveChoice(
  spoken: string,
  choices: Choice[],
): { choice_id: string; custom_text?: string } {
  const s = spoken.trim();
  const lower = s.toLowerCase();
  const byId = choices.find((c) => c.id === s);
  if (byId) return { choice_id: byId.id };

  const words = ["one", "two", "three", "four", "five", "six"];
  const asWord = words.indexOf(lower);
  const asDigit = /^\d+$/.test(lower) ? Number(lower) - 1 : -1;
  const idx = asWord >= 0 ? asWord : asDigit;
  if (idx >= 0 && idx < choices.length) return { choice_id: choices[idx].id };

  const ordinal = lower.match(/\b(first|second|third|fourth|fifth|sixth)\b/);
  if (ordinal) {
    const i = ["first", "second", "third", "fourth", "fifth", "sixth"].indexOf(ordinal[1]);
    if (i < choices.length) return { choice_id: choices[i].id };
  }

  const scored = choices
    .map((c) => ({ c, score: overlap(lower, c.text.toLowerCase()) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.5) return { choice_id: scored[0].c.id };

  return { choice_id: "custom", custom_text: s.slice(0, 200) };
}

function overlap(a: string, b: string): number {
  const stop = new Set(["the", "a", "an", "to", "and", "of", "go", "lets", "i", "want"]);
  const ta = new Set(a.split(/\W+/).filter((w) => w && !stop.has(w)));
  const tb = new Set(b.split(/\W+/).filter((w) => w && !stop.has(w)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.min(ta.size, tb.size);
}
