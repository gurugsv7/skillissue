/**
 * Domain-agnostic interview support.
 *
 * The assistant used to be hardwired for frontend web interviews: the live
 * prompt said "frontend interview assistant", the worked examples were CSS
 * layout, and every answer was forced into a 3-pointer / 30-second shape.
 * That shape is right for a rapid concept question and wrong for almost
 * everything else an interview actually contains.
 *
 * This module replaces that with two generic axes:
 *
 *   1. DOMAIN — what field the interview is in (backend, data science,
 *      finance, nursing, law, sales...). Supplied by the user, never assumed.
 *   2. QUESTION TYPE — what the interviewer just asked for (a concept, a
 *      story, a design, a number, a salary expectation...). Detected per turn,
 *      because a single interview mixes several.
 *
 * The answer shape follows the question type; the vocabulary follows the
 * domain. Neither is baked into the code.
 */

/* ------------------------------------------------------------------ *
 * Session profiles
 * ------------------------------------------------------------------ */

const INTERVIEW_PROFILE_IDS = ['interview', 'technical-interview'];

// Stored preferences may still hold the retired frontend-specific id.
const LEGACY_PROFILE_ALIASES = {
    'frontend-interview': 'technical-interview',
};

function normalizeProfile(profile) {
    const id = String(profile || '').trim();
    return LEGACY_PROFILE_ALIASES[id] || id;
}

function isInterviewProfile(profile) {
    const id = normalizeProfile(profile);
    if (!id) return true; // no profile selected yet — interview is the default
    return INTERVIEW_PROFILE_IDS.includes(id);
}

/* ------------------------------------------------------------------ *
 * Question types
 * ------------------------------------------------------------------ */

/**
 * Each shape describes how the spoken answer should be built. `fragment`
 * controls whether the renderer may chop the answer into short cue-card
 * fragments — right for a quick concept, destructive for a STAR story or a
 * design walkthrough.
 */
const QUESTION_SHAPES = {
    concept: {
        id: 'concept',
        seconds: 30,
        fragment: true,
        allowCode: false,
        shape: `[POINTER 1 - What it is]
(One short line. Plain words.)

[POINTER 2 - How or why it works]
(One or two short lines.)

[POINTER 3 - Tradeoff, limit or when to use it]
(One or two short lines.)`,
    },

    opinion: {
        id: 'opinion',
        seconds: 30,
        fragment: true,
        allowCode: false,
        shape: `[POINTER 1 - Your choice]
(Name the option. One line.)

[POINTER 2 - The reason]
(One or two short lines.)

[POINTER 3 - What you give up]
(One or two short lines.)`,
    },

    comparison: {
        id: 'comparison',
        seconds: 30,
        fragment: true,
        allowCode: false,
        shape: `[POINTER 1 - The first one]
(What it is or does. One line.)

[POINTER 2 - The other one]
(What it is or does. One line.)

[POINTER 3 - When you pick which]
(One or two short lines. This is the line that scores.)`,
    },

    situational: {
        id: 'situational',
        seconds: 40,
        fragment: false,
        allowCode: false,
        shape: `A hypothetical "what would you do" question. Answer as a plan, one short line each:

First - (the immediate step: gather facts, make it safe, clarify)
Then - (the main action and who you involve)
Watch for - (the risk or the thing that could go wrong)
Close - (how you know it is resolved)

Show judgement, not a rulebook. Keep every line speakable.`,
    },

    behavioral: {
        id: 'behavioral',
        seconds: 45,
        fragment: false,
        allowCode: false,
        shape: `Answer as a short story the candidate can finish in their own words:

Situation - (one line: where and when)
Task - (one line: what was on you)
Action - (two lines: what you actually did)
Result - (one line: the outcome, with a number if the context gives one)

Keep each label on its own line. Do not merge it into a paragraph.
Pull the situation from the candidate's own context or resume when it is there.
If the context has no matching example, give a realistic frame the candidate can fill in and mark the blanks like <project>.`,
    },

    experience: {
        id: 'experience',
        seconds: 45,
        fragment: false,
        allowCode: false,
        shape: `Walk through it in this order, one short line each:

What it was - (the project or role in one line)
Your part - (what the candidate personally owned)
The hard bit - (the main problem)
The outcome - (what shipped or improved)

Use the candidate's real context or resume. Mark anything you had to invent as <blank>.`,
    },

    'system-design': {
        id: 'system-design',
        seconds: 60,
        fragment: false,
        allowCode: false,
        // Requirements and constraints get stated a few turns before the
        // question lands, and follow-ups ("now scale that") depend on them.
        needsHistory: true,
        shape: `Give a structure the candidate can talk through, one short line each:

Clarify - (the one assumption or requirement worth stating first)
Core design - (two or three lines: the main pieces and how they connect)
Bottleneck - (what breaks first at scale)
Tradeoff - (what this design gives up)

Do not draw ASCII diagrams. Keep every line speakable.`,
    },

    coding: {
        id: 'coding',
        seconds: 60,
        fragment: false,
        allowCode: true,
        // The interviewer names the tables and columns earlier in the
        // conversation. Without history the model invents plausible-but-wrong
        // names; with it, it uses the real schema. Measured: no latency cost.
        needsHistory: true,
        shape: `Lead with one line naming the approach and its complexity.
Then give the working code in a fenced block.
Preserve any starter scaffold visible in the question (class name, method signature, language).
Do not add imports that were not already present.
Keep the spoken part to one or two lines — the code carries the rest.`,
    },

    estimation: {
        id: 'estimation',
        seconds: 45,
        fragment: false,
        allowCode: false,
        shape: `Show the structure, not just the number, one short line each:

Break it down - (the two or three factors you multiply)
Assume - (the numbers you are picking, said out loud)
Answer - (the resulting estimate)
Sanity check - (one line on whether it looks right)`,
    },

    hr: {
        id: 'hr',
        seconds: 25,
        fragment: false,
        allowCode: false,
        shape: `Two or three short lines, confident and specific.
Anchor on something concrete from the candidate's context rather than a generic virtue.
For compensation or notice-period questions: give a direct answer, then one line of flexibility.
Never sound rehearsed and never over-explain.`,
    },

    general: {
        id: 'general',
        seconds: 30,
        fragment: true,
        allowCode: false,
        shape: `[POINTER 1 - The direct answer]
(One short line.)

[POINTER 2 - The reason or detail]
(One or two short lines.)

[POINTER 3 - The caveat or next step]
(One or two short lines, only if it adds something.)`,
    },
};

/**
 * Ordered most-specific first — the first matching rule wins, so a question
 * like "tell me about a time you designed a system" is treated as behavioral
 * (they want the story) rather than system design.
 */
const CLASSIFIER_RULES = [
    {
        type: 'behavioral',
        pattern:
            /\b(tell me about a time|describe a (?:time|situation)|give me an example of a time|walk me through a time|have you ever had to|how did you (?:handle|deal with|resolve|approach)|what did you do when|a time when you|conflict with|disagreed with|your biggest failure|mistake you made)\b/,
    },
    {
        type: 'hr',
        pattern:
            /\b(why (?:do you want to|should we|this company|us\b|are you leaving)|salary|compensation|\bctc\b|notice period|expected pay|where do you see yourself|greatest (?:strength|weakness)|your (?:strengths|weaknesses)|tell me about yourself|relocate|willing to work|start date)\b/,
    },
    {
        type: 'coding',
        pattern:
            // Allow qualifiers between the verb and the noun: "write a pandas
            // snippet", "write a SQL query", "write a short python function".
            /\b(write (?:me )?(?:a |an |the )?(?:\w+ ){0,3}(?:function|program|method|query|script|snippet|solution|loop|code)|implement (?:a|an|the)|code (?:this|it) up|reverse (?:a|the) (?:string|array|list)|leetcode|edge cases? for your code|debug this|what does this code (?:print|output|return)|(?:do|solve) (?:this|it) (?:using|in) (?:pandas|numpy|sql|python))/,
    },
    {
        type: 'system-design',
        pattern:
            /\b(design (?:a|an|the)\b|architect(?:ure)? (?:for|of)|how would you (?:build|scale|structure)|scale (?:this|it|to)|high level design|low level design|system design|schema for|handle (?:a )?million)\b/,
    },
    {
        type: 'estimation',
        pattern:
            /\b(how many .* (?:are there|in the|per|would)|estimate (?:the|how)|market siz|ballpark|back of the envelope|guesstimate|what would it cost to)\b/,
    },
    {
        type: 'experience',
        pattern:
            /\b((?:walk me through|tell me about|talk about) your (?:\w+ ){0,2}(?:resume|background|project|experience|role|work|job)|(?:for|in|on|about) your (?:\w+ ){0,4}(?:project|model|work|internship|capstone)|what (?:did|have) you (?:work|been working) on|your most recent project|about your last (?:job|role|company))\b/,
    },
    {
        type: 'comparison',
        pattern: /\b(difference between|compared? (?:to|with)|\bvs\.?\b|versus|how (?:is|are|does) .* differ)\b/,
    },
    {
        type: 'opinion',
        pattern:
            /\b(which (?:one )?(?:would|do) you (?:choose|prefer|pick|use)|what would you (?:choose|prefer|pick)|when (?:would|should) (?:you|we|i) use|(?:better|best) (?:choice|option|approach)|would you rather)\b/,
    },
    {
        type: 'situational',
        pattern:
            /\b(what would you do if|how (?:do|would) you (?:handle|deal with|approach|respond to|manage)|what if the|suppose (?:a|an|the)|imagine (?:a|an|the)|if a (?:customer|client|patient|user|colleague|team member|student))\b/,
    },
    {
        type: 'concept',
        pattern:
            /\b(what is|what are|what's|explain|define|describe (?:the|how|what)|how does .* work|why (?:do|does|is|are)|walk me through (?:a|an|the)|tell me about (?!yourself|a time|your))\b/,
    },
];

/**
 * Template for a stacked question.
 *
 * Reusing a single-answer template here backfires: told to fill 50 seconds with
 * a three-pointer layout while three separate things were asked, the model
 * abandons the layout and writes paragraphs. Giving each sub-question its own
 * labelled block keeps the answer in short speakable lines.
 */
const MULTI_PART_SHAPE = `This question has SEVERAL PARTS. Answer each part separately, in the order asked.

For each part, write a short label from the question itself, then 1-3 pointer lines under it:

[Part 1 label — a few words lifted from the question]
- One short line, about 12 words.
- A second line only if it adds something.

[Part 2 label]
- One short line.
- A second line only if it adds something.

[Part 3 label]
- One short line.

HARD RULES FOR THIS SHAPE:
- Every line starts with "- " and is about 12 words. Never longer than 18.
- Never write a paragraph. Never join two ideas with "along with", "such as" or "because".
- Answer EVERY part. Missing one is the worst failure here.
- Blank line between parts so the candidate can see where each answer ends.`;

/** Several questions asked in one breath — needs a longer, unfragmented answer. */
function isMultiPartQuestion(normalized) {
    if ((normalized.match(/\?/g) || []).length >= 2) return true;
    // "..., and why did you ...": a second interrogative joined by and/also.
    return /\b(and|also) (what|why|how|which|when|who)\b/.test(normalized);
}

function classifyInterviewQuestion(text = '') {
    const normalized = String(text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return QUESTION_SHAPES.general;

    let matched = QUESTION_SHAPES.general;
    for (const rule of CLASSIFIER_RULES) {
        if (rule.pattern.test(normalized)) {
            matched = QUESTION_SHAPES[rule.type];
            break;
        }
    }

    // Interviewers stack asks into one breath: "what was the target, what
    // features did you engineer, and why XGBoost?". Answering that as a
    // three-line cue card drops two thirds of the question, so a multi-part
    // turn gets room and is never fragmented.
    if (isMultiPartQuestion(normalized)) {
        return {
            ...matched,
            fragment: false,
            seconds: Math.max(matched.seconds, 50),
            multiPart: true,
            // Replace the single-answer template with one block per sub-question.
            shape: MULTI_PART_SHAPE,
        };
    }

    return matched;
}

function getQuestionShape(typeId) {
    return QUESTION_SHAPES[typeId] || QUESTION_SHAPES.general;
}

/* ------------------------------------------------------------------ *
 * Locale
 * ------------------------------------------------------------------ */

/**
 * The English variant used to be hardcoded to Indian English. It now follows
 * the speech language the user picked, and falls back to plain neutral
 * English rather than assuming a region.
 */
const ENGLISH_VARIANTS = {
    'en-in': 'natural Indian English',
    'en-gb': 'natural British English',
    'en-au': 'natural Australian English',
    'en-us': 'natural American English',
};

function describeSpokenLanguage(languageCode = '') {
    const code = String(languageCode || '')
        .trim()
        .toLowerCase();
    if (!code) return 'natural spoken English';

    if (ENGLISH_VARIANTS[code]) return ENGLISH_VARIANTS[code];
    if (code.startsWith('en')) return 'natural spoken English';

    // Non-English locale — name it so the model answers in that language.
    return `natural spoken ${code}`;
}

/* ------------------------------------------------------------------ *
 * Live prompt
 * ------------------------------------------------------------------ */

const DOMAIN_FALLBACK = 'the field established by the candidate context and the conversation so far';

function describeDomain(domain = '') {
    const value = String(domain || '').trim();
    return value || DOMAIN_FALLBACK;
}

/**
 * The low-latency prompt used for every live interview turn.
 *
 * Domain-neutral by construction: the subject matter comes from `domain`
 * (a user-supplied field, e.g. "backend Go services", "clinical nursing",
 * "M&A finance") and the answer shape comes from the detected question type.
 */
/**
 * Optional per-interview briefing, loaded from an untracked local file.
 *
 * Lets you tune the assistant hard for one specific interview (company, role,
 * the topics that will actually be asked) without any of it entering the
 * repository. Delete `src/profiles/interview.local.js` and everything below
 * reverts to the generic behaviour — nothing else references it.
 */
let localBriefingCache;
function getLocalBriefing() {
    if (localBriefingCache !== undefined) return localBriefingCache;
    try {
        // eslint-disable-next-line global-require
        const local = require('../profiles/interview.local.js');
        localBriefingCache = local && typeof local.briefing === 'string' ? local : null;
    } catch {
        localBriefingCache = null; // no local profile present — generic behaviour
    }
    return localBriefingCache;
}

function buildLiveInterviewPrompt({ domain = '', languageCode = '', questionShape = null } = {}) {
    const shape = questionShape || QUESTION_SHAPES.general;
    const spoken = describeSpokenLanguage(languageCode);
    const local = getLocalBriefing();
    const field = describeDomain(domain || local?.domain || '');

    const codeRule = shape.allowCode
        ? 'Code blocks are expected for this answer.'
        : 'No code blocks, bullets, headers or markdown.';

    return `You are an interview assistant. You feed the candidate words they can say out loud, in ${spoken}, as the interview happens.

DOMAIN LOCK
The interview is about ${field}.
Read every ambiguous term in that domain and nowhere else. Lock onto it from the first question and do not drift to another field mid-conversation.
If a term is genuinely ambiguous even inside the domain, pick the most likely reading and answer — do not stall to ask.

THIS QUESTION
The interviewer just asked a ${shape.id.replace('-', ' ')} question. Answer it in about ${shape.seconds} seconds of speech.

${shape.shape}
${local ? `\n${local.briefing}\n` : ''}
RULES
- Plain spoken words. If a term needs jargon, explain it in the same line.
- Give sentence starters the candidate can finish themselves, not finished essays.
- Blank lines between parts. Never one dense paragraph.
- Avoid stitched-together clauses: because, however, therefore, although.
- Sound like a person thinking out loud, not a document being read.
- ${codeRule}
- If you do not know, say so in one line and give the best practical answer anyway.

Output only the words the candidate will speak.`;
}

module.exports = {
    INTERVIEW_PROFILE_IDS,
    LEGACY_PROFILE_ALIASES,
    QUESTION_SHAPES,
    normalizeProfile,
    isInterviewProfile,
    classifyInterviewQuestion,
    getQuestionShape,
    describeSpokenLanguage,
    describeDomain,
    buildLiveInterviewPrompt,
};
