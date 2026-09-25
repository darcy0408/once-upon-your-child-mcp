/**
 * Offline checks for the read-aloud helpers, using real scene text observed
 * from the backend. No network, no cost.
 *
 *   npx tsx scripts/voice-check.ts
 */
import { choicesForSpeech, endingLine, resolveChoice, sceneBody, shortLabel } from "../src/voice.js";

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

console.log(failures ? `\n${failures} failing` : "\nall passed");
process.exit(failures ? 1 : 0);
