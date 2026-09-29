/**
 * Offline checks for the read-aloud helpers, using real scene text observed
 * from the backend. No network, no cost.
 *
 *   npx tsx scripts/voice-check.ts
 */
import { choicesForSpeech, endingLine, resolveChoice, sceneBody, shortLabel, speakableError, toSpeech } from "../src/voice.js";

let failures = 0;
function expect(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`     got:  ${JSON.stringify(got)}`);
    console.log(`     want: ${JSON.stringify(want)}`);
  }
}

// Trailing nudges the model appended in live runs.
expect(
  "strip 'Choose fast—two bright ways wait.'",
  sceneBody("The shell's glow fades into three paths of light. Choose fast—two bright ways wait."),
  "The shell's glow fades into three paths of light.",
);
expect(
  "strip 'What will you do next?'",
  sceneBody("The trench smells like warm bread and magic. What will you do next?"),
  "The trench smells like warm bread and magic.",
);
expect(
  "strip 'You have three ways forward.' after 'Your heart hammers.'",
  sceneBody("Your heart hammers. You have three ways forward."),
  "Your heart hammers.",
);
expect(
  "strip 'You must act fast.'",
  sceneBody("The woods feel close. You must act fast."),
  "The woods feel close.",
);
expect(
  "strip stacked nudges",
  sceneBody("Pip wags. What will you do? The choice is yours!"),
  "Pip wags.",
);
expect(
  "keep an ordinary question",
  sceneBody("Where did the moon-shell go? Pip barks."),
  "Where did the moon-shell go? Pip barks.",
);
expect(
  "strip legacy 'Choices: 1) ...' block",
  sceneBody("Pip barks.\n\nChoices:\n1) Swim left\n2) Swim right"),
  "Pip barks.",
);

// The model restating its own choices at the end of the scene (live, Sprout).
const leafTrail = [
  { id: "a", text: "Reach for a glowing leaf." },
  { id: "b", text: "Follow the tiny light trail." },
];
expect(
  "strip echoed choice sentences plus 'Two paths wait.'",
  sceneBody("He licks your hand. He is warm. Two paths wait. Reach for a glowing leaf. Follow the tiny light trail.", leafTrail),
  "He licks your hand. He is warm.",
);
const shellTrail = [
  { id: "a", text: "Reach toward the glowing shell to hear its hum." },
  { id: "b", text: "Follow the drifting bubble trail." },
];
expect(
  "strip the model's own either/or question (live, Explorer)",
  sceneBody(
    "You take a slow breath and feel small bravery sparkle. Reach toward the glowing shell, or follow the drifting bubble trail?",
    shellTrail,
  ),
  "You take a slow breath and feel small bravery sparkle.",
);
expect(
  "keep a sentence that merely mentions a choice word",
  sceneBody("Waffles noses the blue glow-bush. He digs a soft hole.", leafTrail),
  "Waffles noses the blue glow-bush. He digs a soft hole.",
);

// Choice labels shortened at a clause boundary.
expect(
  "explorer label cut at ' and '",
  shortLabel("Swim toward the coral path glowing silver and listen closely.", 9),
  "Swim toward the coral path glowing silver",
);
expect(
  "creator label cut at comma",
  shortLabel("Follow the glowing footprints down the alley, keeping low and listening to which lamp hums loudest.", 16),
  "Follow the glowing footprints down the alley",
);
expect("short label untouched", shortLabel("Lift the tiny star.", 6), "Lift the tiny star");
// The word cap landing mid-phrase (live, Explorer, 2026-09-26): never end on "to search for".
expect(
  "hard cut backs off dangling words",
  shortLabel("Dive deeper toward the glowing light to search for the missing shell", 9),
  "Dive deeper toward the glowing light",
);
expect("hard cut keeps a clean ending", shortLabel("Follow the fish past the reef into the dark cave beyond", 9), "Follow the fish past the reef into the dark");

// Age-banded question.
const two = [
  { id: "a", text: "Follow the glowing map." },
  { id: "b", text: "Lift the tiny star." },
];
expect(
  "sprout: either/or in the child's name, no numbers",
  choicesForSpeech(two, { age: 4, heroName: "Theo" }),
  "Theo, which one? follow the glowing map, or lift the tiny star?",
);
expect(
  "explorer: numbered, own idea",
  choicesForSpeech(two, { age: 6, heroName: "Maya" }),
  "What should happen next? one: Follow the glowing map. two: Lift the tiny star. Or tell me your own idea.",
);
expect(
  "adventurer wording",
  choicesForSpeech(two, { age: 10 }).endsWith("Or say your own idea."),
  true,
);
expect("sprout ending", endingLine({ age: 4, heroName: "Theo" }), "The end. Sweet dreams, Theo.");
expect("adventurer ending", endingLine({ age: 10, heroName: "Zara" }), "The end. Goodnight, Zara.");
expect("creator ending", endingLine({ age: 13, heroName: "Eli" }), "The end.");

// What children actually say.
const three = [
  { id: "x", text: "Follow the glowing footprints down the alley." },
  { id: "y", text: "Climb the iron drainpipe to the rooftops." },
  { id: "z", text: "Grab the glowing paper map." },
];
expect("'two'", resolveChoice("two", three).choice_id, "y");
expect("'number 3'", resolveChoice("number 3", three).choice_id, "z");
expect("'the first one'", resolveChoice("the first one", three).choice_id, "x");
expect("'the last one'", resolveChoice("the last one", three).choice_id, "z");
expect("'climb the drainpipe!'", resolveChoice("climb the drainpipe!", three).choice_id, "y");
expect("'lift the star' vs sprout pair", resolveChoice("lift the star", two).choice_id, "b");
expect("'the puppy!' becomes custom", resolveChoice("the puppy!", two), { choice_id: "custom", custom_text: "the puppy!" });
expect(
  "long own idea becomes custom",
  resolveChoice("I want to fix the ship myself instead of asking for help", two).choice_id,
  "custom",
);

// Stage-direction labels seen live on 2026-09-26 in a Pick-a-Path scene.
expect(
  "strip '(action)' style stage directions",
  sceneBody("Pip snuffles the egg (action). Pip barks a bright tune (dialogue). Pip nudges your hand (bond)."),
  "Pip snuffles the egg. Pip barks a bright tune. Pip nudges your hand.",
);
// Combined labels seen live on 2026-09-28 (Maya, "Under the sea").
expect(
  "strip '(dialogue/action)'",
  sceneBody("His bark makes tiny bell-sounds that answer the lantern's hum (dialogue/action)."),
  "His bark makes tiny bell-sounds that answer the lantern's hum.",
);
expect(
  "strip '(action, bond)'",
  sceneBody("He presses his silvery head against the glowing shell to warm it (action, bond)."),
  "He presses his silvery head against the glowing shell to warm it.",
);
expect("strip '(action and dialogue)'", sceneBody("Pip wags (action and dialogue)."), "Pip wags.");
expect("keep a label word mixed with others", toSpeech("She hugged it (comfort blanket)."), "She hugged it (comfort blanket).");
expect("keep real parentheticals", sceneBody("The map (the one from Grandma) glows."), "The map (the one from Grandma) glows.");
// Bedtime stories gloss new words in parentheses on purpose.
expect("keep vocabulary glosses", toSpeech("The pebble was luminescent (glowing), soft (velvety)."), "The pebble was luminescent (glowing), soft (velvety).");

// Since OUYC PR #72 the per-minute limit is per account, so judges sharing the
// demo account can trip it mid-story. That must not sound like "come back tomorrow".
expect(
  "quota 429 means tomorrow",
  speakableError(429, "Daily story limit reached", "Maya", "QUOTA_EXCEEDED"),
  "Maya's storybook is resting for tonight. We can start a new story tomorrow.",
);
expect(
  "rate-limit 429 means try again",
  speakableError(429, "5 per 1 minute", "Maya"),
  "The story needs a quick breath. Let's try again in a moment.",
);

console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
