/**
 * Helpers that turn backend story payloads into text an assistant can read
 * aloud. Alexa+ speaks whatever we return, so strip formatting and keep the
 * choices in a shape a child of that age can answer by voice.
 *
 * Age bands follow the app: Sprout <=5, Explorer 6-8, Adventurer 9-12,
 * Creator 13-14, Teen 15+.
 */
import type { BedtimeStory, Choice, Segment } from "./ouyc-client.js";

export type Band = "sprout" | "explorer" | "adventurer" | "creator" | "teen";

export function ageBand(age: number | null | undefined): Band {
  const a = typeof age === "number" ? age : 7;
  if (a <= 5) return "sprout";
  if (a <= 8) return "explorer";
  if (a <= 12) return "adventurer";
  if (a <= 14) return "creator";
  return "teen";
}

export interface SpeechOpts {
  age?: number | null;
  heroName?: string;
}

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

/**
 * The model sometimes appends its own "Choices: 1) ... 2) ..." block, or a
 * closing nudge like "What will you do next?" / "Choose fast—two bright ways
 * wait." The app renders buttons so it never shows; for voice we would ask
 * the question twice, so drop it and keep the structured list.
 */
const TRAILING_NUDGES = [
  /\bwhat (?:will|do|would|should) you (?:do|choose|pick|decide)\b[^.!?]*[.!?]?\s*$/i,
  /\bwhat(?:'s| is| happens| will happen) next\b[^.!?]*[.!?]?\s*$/i,
  /\bwhich (?:path|way|one|door|road)\b[^.!?]*[.!?]?\s*$/i,
  /\bchoose (?:fast|now|quickly|wisely|one|carefully)\b[^.!?]*[.!?]?\s*$/i,
  /\byou (?:have|see|face|must choose between) (?:two|three|four|\d) (?:ways|choices|paths|options|doors)\b[^.!?]*[.!?]?\s*$/i,
  /\b(?:two|three|four) (?:bright |clear |new )?(?:ways|paths|choices|options) (?:wait|await|lie ahead|open|call)\b[^.!?]*[.!?]?\s*$/i,
  /\b(?:the choice is yours|it'?s your choice|your choice|time to choose|decide now)\b[^.!?]*[.!?]?\s*$/i,
  /\byou must (?:act|choose|decide) (?:fast|now|quickly|quick)\b[^.!?]*[.!?]?\s*$/i,
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Drop trailing sentences that merely restate the choices ("Reach for a
 * glowing leaf. Follow the tiny light trail." or "Reach toward the shell, or
 * follow the trail?"), since the structured choices are read right after.
 */
function stripChoiceEchoes(text: string, choices: Choice[]): string {
  if (choices.length === 0) return text;
  const labels = choices.map((c) => normalize(c.text));
  for (let i = 0; i < choices.length + 1; i++) {
    const m = text.match(/(?:^|(?<=[.!?]\s))([^.!?]+[.!?]?)\s*$/);
    if (!m) break;
    const last = normalize(m[1]);
    if (!last) break;
    const echoesOne = labels.some((l) => l === last || overlap(last, l) >= 0.6);
    const eitherOr = /\bor\b/.test(last) && /\?\s*$/.test(m[1].trim()) && labels.some((l) => overlap(last, l) >= 0.5);
    if (!echoesOne && !eitherOr) break;
    text = text.slice(0, text.length - m[0].length).trim();
  }
  return text;
}

export function sceneBody(content: string, choices: Choice[] = []): string {
  let text = toSpeech(content)
    .replace(/\n?\s*choices?\s*:\s*(\n|\s)*1[).]\s[\s\S]*$/i, "")
    .trim();
  // Peel trailing echoes and nudges one sentence at a time (the model may
  // stack several: "Two paths wait. Reach for a leaf. Follow the trail.").
  for (let i = 0; i < 4; i++) {
    const before = text;
    text = stripChoiceEchoes(text, choices);
    for (const re of TRAILING_NUDGES) text = text.replace(re, "").trim();
    if (text === before) break;
  }
  return text;
}

/** "Swim toward the coral path glowing silver and listen closely." -> short clause */
export function shortLabel(text: string, maxWords: number): string {
  let s = toSpeech(text).replace(/[.!?\s]+$/, "");
  const words = s.split(/\s+/);
  // Anything over eight words is hard to hold by ear, so a clause boundary
  // wins even under the band's cap; the cap is the hard limit.
  const SOFT = 8;
  if (words.length <= Math.min(SOFT, maxWords)) return s;
  const boundary = /,|;|:| — | - | while | and | so | to see | keeping | trusting | listening | hoping | before /i;
  const parts = s.split(boundary);
  if (parts.length > 1 && parts[0].split(/\s+/).length >= 3) {
    s = parts[0].trim();
    if (s.split(/\s+/).length <= maxWords) return s;
  }
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

const LABEL_WORDS: Record<Band, number> = {
  sprout: 6,
  explorer: 9,
  adventurer: 12,
  creator: 16,
  teen: 20,
};

export function choicesForSpeech(choices: Choice[], opts: SpeechOpts = {}): string {
  if (!choices || choices.length === 0) return "";
  const band = ageBand(opts.age);
  const labels = choices.map((c) => shortLabel(c.text, LABEL_WORDS[band]));

  if (band === "sprout") {
    // No numbers for the little ones: an either/or question in their name.
    const name = opts.heroName ? `${opts.heroName}, ` : "";
    const lower = labels.map((l) => l.charAt(0).toLowerCase() + l.slice(1));
    const last = lower.pop();
    return `${name}which one? ${lower.join(", ")}, or ${last}?`;
  }

  const parts = labels.map((l, i) => `${numberWord(i + 1)}: ${l}`);
  const own = band === "explorer" ? "Or tell me your own idea." : "Or say your own idea.";
  return `What should happen next? ${parts.join(". ")}. ${own}`;
}

export function segmentForSpeech(segment: Segment, opts: SpeechOpts = {}): string {
  const head = segment.title ? `${toSpeech(segment.title)}.\n\n` : "";
  return `${head}${sceneBody(segment.content, segment.choices)}\n\n${choicesForSpeech(segment.choices, opts)}`.trim();
}

export function endingLine(opts: SpeechOpts = {}): string {
  const band = ageBand(opts.age);
  const name = opts.heroName ? `, ${opts.heroName}` : "";
  if (band === "sprout" || band === "explorer") return `The end. Sweet dreams${name}.`;
  if (band === "adventurer") return `The end. Goodnight${name}.`;
  return "The end.";
}

export function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six"][n] ?? String(n);
}

/**
 * Map what a child said back to a choice id. Accepts an id, a 1-based
 * number (digit, word, or ordinal), "the last one", or a fuzzy match on the
 * choice text. Anything else becomes a free-text "custom" choice, which the
 * backend treats as story input, never as an instruction.
 */
export function resolveChoice(
  spoken: string,
  choices: Choice[],
): { choice_id: string; custom_text?: string } {
  const s = spoken.trim();
  const lower = s.toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
  const byId = choices.find((c) => c.id === s);
  if (byId) return { choice_id: byId.id };

  const words = ["one", "two", "three", "four", "five", "six"];
  const asWord = words.indexOf(lower);
  const asDigit = /^\d+$/.test(lower) ? Number(lower) - 1 : -1;
  const idx = asWord >= 0 ? asWord : asDigit;
  if (idx >= 0 && idx < choices.length) return { choice_id: choices[idx].id };

  // "number two", "option 2", "the second one", "the last one", "the first"
  const numbered = lower.match(/^(?:number|option|choice|path)?\s*(one|two|three|four|five|six|\d)$/);
  if (numbered) {
    const i = words.indexOf(numbered[1]) >= 0 ? words.indexOf(numbered[1]) : Number(numbered[1]) - 1;
    if (i >= 0 && i < choices.length) return { choice_id: choices[i].id };
  }
  const ordinal = lower.match(/\b(first|second|third|fourth|fifth|sixth|last)\b/);
  if (ordinal) {
    const i =
      ordinal[1] === "last"
        ? choices.length - 1
        : ["first", "second", "third", "fourth", "fifth", "sixth"].indexOf(ordinal[1]);
    if (i >= 0 && i < choices.length) return { choice_id: choices[i].id };
  }

  const scored = choices
    .map((c) => ({ c, score: overlap(lower, c.text.toLowerCase()) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.5) return { choice_id: scored[0].c.id };

  return { choice_id: "custom", custom_text: s.slice(0, 200) };
}

function overlap(a: string, b: string): number {
  const stop = new Set([
    "the", "a", "an", "to", "and", "of", "go", "lets", "let's", "i", "want", "wanna", "we", "should", "can", "please", "um", "uh",
  ]);
  const ta = new Set(a.split(/\W+/).filter((w) => w && !stop.has(w)));
  const tb = new Set(b.split(/\W+/).filter((w) => w && !stop.has(w)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

/** Turn a backend failure into one gentle sentence a host can say out loud. */
export function speakableError(status: number | undefined, message: string, heroName?: string): string {
  const who = heroName ? `${heroName}'s` : "the";
  if (status === 429) {
    return `${heroName ? heroName + "'s" : "The"} storybook is resting for tonight. We can start a new story tomorrow.`;
  }
  if (status === 401 || status === 403) {
    return `I can't open ${who} storybook right now. Please check the Once Upon YOUR Child app.`;
  }
  if (status === 404) return "I couldn't find that story. Let's start a new one.";
  if (/timed out/i.test(message)) return "The story is taking too long tonight. Let's try once more.";
  if (status && status >= 500) return "The storybook is having trouble right now. Let's try again in a moment.";
  return message;
}
