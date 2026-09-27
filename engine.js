import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

let groq;
function getGroqClient() {
    if (!groq) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error("GROQ_API_KEY is missing. Please add it to your Vercel Environment Variables.");
        }
        groq = new Groq({ apiKey });
    }
    return groq;
}

// The exact few-shot examples used in the prompt.
// Used by the deduplication guard to detect if the AI just echoed one back.
const FEW_SHOT_EXAMPLES = [
    "I asked AI how to fix the housing crisis without crashing the economy.",
    "Why the Japanese Yen keeps losing value, explained in 5 slides.",
    "Will AI replace software engineers? I asked the AI itself.",
    "What hospitals will look like in 2035 and it's not what you'd expect.",
    "Why you can't afford a house. The actual reason, not the one they tell you.",
    "I gave AI the grocery inflation data. Here's what it found.",
    "CRISPR can already edit your unborn child's DNA. Three countries allow it.",
    "The real reason wages haven't kept up with prices since 2008.",
    "Humanoid robots are cheaper than minimum wage workers in 3 countries already.",
    "I asked an AI to end world hunger. Here is its 3-step plan.",
    "How quantum computing will break the internet in exactly 5 years.",
    "The AI medical revolution: what hospitals will look like in 2035.",
    "Why the Japanese Yen is collapsing, explained by a supercomputer in 5 slides."
];


// Returns a 0-1 score of how many words from b appear in a (simple bag-of-words overlap)

// Finance/tech jargon that kills virality — triggers a regeneration
const JARGON_BLACKLIST = [
    'basis points', 'bps', 'yield curve', 'quantitative easing', 'qe', 'tapering',
    'repo rate', 'monetary policy', 'fiscal policy', 'gdp ratio', 'debt-to-gdp',
    'current account', 'trade deficit', 'net exports', 'liquidity crisis',
    'solvency', 'securitization', 'collateral', 'derivatives', 'tranches',
    'bandwidth', 'latency', 'neural network', 'large language model', 'llm',
    'tokenization', 'blockchain protocol', 'consensus mechanism'
];

function containsJargon(text) {
    const lower = text.toLowerCase();
    return JARGON_BLACKLIST.some(term => lower.includes(term));
}
function wordOverlap(a, b) {
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
    const setA = new Set(normalize(a));
    const wordsB = normalize(b);
    const matches = wordsB.filter(w => setA.has(w)).length;
    return matches / Math.max(setA.size, wordsB.length);
}

// Track recently used seeds to prevent repetition within a session
const recentSeeds = [];

// Fetch real-time trending topics from Hacker News (tech/economics)
async function fetchLiveTrends() {
    try {
        const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        const ids = await topRes.json();
        const top15 = ids.slice(0, 15);
        const titles = [];
        
        for (const id of top15) {
            const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
            const item = await itemRes.json();
            if (item && item.title) {
                titles.push(item.title);
            }
        }
        return titles;
    } catch (e) {
        console.error("Failed to fetch live trends:", e);
        return [];
    }
}

export async function generateTopic(genre = null) {
    // PROVEN VIRAL FORMATS — sentence structures that consistently go viral
    // The AI does NOT invent these. It only fills in the blanks.
    const FORMATS = [
        "I asked AI {angle}. Here's what it found.",
        "Why {angle} — it's not what they tell you.",
        "{angle}. And nobody is talking about it.",
        "I fed AI all the data on {angle_short}. The answer surprised me.",
        "{angle_short} will look completely different by {year}. Here's why.",
        "The real reason {angle}.",
        "{angle}. Explained in 5 slides.",
        "What {angle_short} will look like in {year}. It's not what you expect.",
        "Everyone is wrong about {angle_short}. Here's the data.",
        "{angle}. I broke it down so you don't have to.",
        "In {years} years, {angle_short} won't exist. Here's what replaces it.",
        "I made AI analyze {angle_short}. It found something no one expected."
    ];

    // SPECIFIC ANGLES — real, relatable, jargon-free topics
    const ANGLES = [
        { full: "why you still can't afford a house", short: "the housing market", category: "crisis" },
        { full: "why grocery prices won't come back down", short: "food prices", category: "crisis" },
        { full: "why your salary buys less every year", short: "wages vs. prices", category: "crisis" },
        { full: "how AI is already replacing software engineers", short: "AI coding", category: "future" },
        { full: "what hospitals will look like in 10 years", short: "AI healthcare", category: "future" },
        { full: "why a college degree is worth less every year", short: "college education", category: "crisis" },
        { full: "how student loans were designed to keep you in debt", short: "student debt", category: "crisis" },
        { full: "why self-driving cars are always '5 years away'", short: "self-driving cars", category: "future" },
        { full: "how gene editing could eliminate diseases before birth", short: "CRISPR gene editing", category: "future" },
        { full: "why scientists think we could stop aging by 2045", short: "the aging cure", category: "future" },
        { full: "why rent is rising even where apartments sit empty", short: "the rental crisis", category: "crisis" },
        { full: "how robots are already cheaper than factory workers", short: "humanoid robots", category: "future" },
        { full: "why your health insurance costs more but covers less", short: "healthcare costs", category: "crisis" },
        { full: "how AI could replace 40% of jobs within a decade", short: "AI job replacement", category: "future" },
        { full: "how brain chips could let you control devices with thoughts", short: "brain-computer interfaces", category: "future" },
        { full: "why lab-grown meat still isn't in supermarkets", short: "lab-grown meat", category: "future" },
        { full: "why remote work is quietly disappearing", short: "remote work", category: "crisis" },
        { full: "how deepfakes will make it impossible to trust any video", short: "deepfake technology", category: "future" },
        { full: "why small businesses are dying faster than ever", short: "small business survival", category: "crisis" },
        { full: "how quantum computers will break every password ever made", short: "quantum computing", category: "future" }
    ];

    const YEARS = ["2028", "2030", "2032", "2035", "2040", "2045"];
    const YEAR_SPANS = ["5", "8", "10", "15", "20"];

    // Pick random format + angle (avoid recent combos)
    const format = FORMATS[Math.floor(Math.random() * FORMATS.length)];
    let angle;
    let attempts = 0;
    do {
        angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
        attempts++;
    } while (recentSeeds.includes(angle.short) && attempts < 10);

    recentSeeds.push(angle.short);
    if (recentSeeds.length > 8) recentSeeds.shift();

    const year = YEARS[Math.floor(Math.random() * YEARS.length)];
    const years = YEAR_SPANS[Math.floor(Math.random() * YEAR_SPANS.length)];

    // Build the raw hook from the template
    const rawHook = format
        .replace("{angle}", angle.full)
        .replace("{angle_short}", angle.short)
        .replace("{year}", year)
        .replace("{years}", years);

    console.log("Template hook:", rawHook);

    // SINGLE AI call: just polish the grammar and make it flow naturally
    const polishPrompt = `Take this Instagram carousel hook and make it sound natural and punchy. 
${genre ? `Adapt it slightly to fit the genre/niche: "${genre}". ` : ''}Fix any awkward grammar. Keep it under 15 words. Do NOT add jargon, buzzwords, or change the core meaning.

Raw hook: "${rawHook}"

Output ONLY the polished hook. No quotes, no explanation.`;

    try {
        const groqClient = getGroqClient();
        const res = await groqClient.chat.completions.create({
            messages: [{ role: 'user', content: polishPrompt }],
            model: 'openai/gpt-oss-120b',
            temperature: 0.3,
        });
        const polished = res.choices[0].message.content.trim().replace(/^"|"$/g, '');
        
        // Final jargon check
        if (!containsJargon(polished) && polished.length < 120) {
            console.log("Final hook:", polished);
            return polished;
        }
    } catch (e) {
        console.error("Polish step failed:", e.message);
    }

    // If AI polish fails or adds jargon, just use the raw template (it's already good)
    console.log("Using raw template hook:", rawHook);
    return rawHook;
}

export async function generateScript(topic, genre = null) {
    const systemInstruction = `You write Instagram carousel scripts. Your style: conversational, insightful, and punchy. Like a smart friend texting you something wild they just found out.
${genre ? `The target niche/genre is: ${genre}. Ensure the content fits this genre.` : ''}
HARD RULES — violating any = failure:
1. Carousel Length: Generate between 5 to 8 slides. Choose the length that best fits the story.
2. Body text = 2 to 3 sentences. No more.
3. Each sentence = MAX 15 words. Count them. Cut if over. Keep it readable.
4. ZERO corporate/abstract words. Cut: "productivity", "imbalance", "firms", "sectors", "entities", "mechanisms", "dynamics", "paradigm", "leverage", "ecosystem".
5. Stats: 1-2 stats max per slide. Make them feel real and specific (not round numbers like 40%).
6. Titles = max 5 words. Thriller chapter energy.
7. ABSOLUTELY NO POLITICS: Do NOT name, criticize, or blame any government, political party, politician, or public official. Do not frame any slide as "the government did this." Keep blame on systemic economic forces, market dynamics, or corporate behaviour. Slide titles and body text must NEVER be misleading — if the title says "Blame X", the body MUST be about X, not something else.

NARRATIVE FLOW (CRITICAL):
Your slides CANNOT just be a random list of facts on a topic. They must tell a cohesive story.
- Slide 1: The Hook/Problem. State a mind-blowing fact that challenges what the reader believes.
- Slide 2: The False Culprit. What people *think* is causing the problem.
- Slide 3: The Real Villain. Reveal the hidden mechanism or truth nobody talks about.
- Slide 4/5/6: The Escalation. Show exactly how this mechanism works using concrete examples.
- Final Slide: The Conclusion/Question. Ask a compelling, relevant question that sparks debate in the comments.

SENTENCE QUALITY — read this carefully:

BAD: "AI and robots will boost productivity, forcing firms to raise pay to attract talent."
WHY BAD: 16 words, corporate words "productivity" and "firms", too abstract.
GOOD: "Robots already do 30% of factory jobs in Japan."
WHY GOOD: 11 words, one concrete stat, zero jargon.

BAD: "But the price surge outpacing that rise is the real surprise."
WHY BAD: Vague. "The real surprise" says nothing. No actual tension.
GOOD: "But nobody's telling you where those wages disappear to."
WHY GOOD: Creates genuine curiosity. Forces the swipe.

BAD: "Yet those same machines also slash the cost of goods, creating a hidden imbalance."
WHY BAD: 15 words, multi-clause, "hidden imbalance" is meaningless.
GOOD: "And the people losing jobs aren't the ones benefiting."
WHY GOOD: Simple, relatable, makes reader feel something.

CLIFFHANGER & PAYOFF RULE (CRITICAL):
- If you end a slide with a curiosity gap (a cliffhanger), the VERY NEXT SLIDE must immediately answer it. Do not stack unanswered questions.
- Slide 1 and 2 should use cliffhangers to pull the reader in. (e.g., "But you'll never guess who's paying for it.")
- Slides 3, 4, and 5 must DELIVER the answers. Stop using cliffhangers in the middle of the story—state the hard facts directly. Do not leave the reader hanging at the end of the carousel.
- NEVER use: "is the real surprise", "is the real issue", "is what nobody talks about", "hidden imbalance", "fuels a bubble".
- Final Slide: No cliffhangers. Just a compelling, relevant question that sparks debate in the comments.

PERFECT EXAMPLE to match EXACTLY (this is 5 slides, but you can do up to 8):
Hook: "Why you still can't afford a house."

Slide 1 (The Hook):
Title: "It's Not You"
Body: "A house cost 3x the average salary in 1990. Today it's 8x — and it's not inflation."
bg_type: "gradient-red"

Slide 2 (The False Culprit):
Title: "Forget Avocado Toast"
Body: "Financial gurus blame your spending habits. But the math literally doesn't add up."
bg_type: "gradient-purple"

Slide 3 (The Real Villain):
Title: "Who Bought Them All"
Body: "Investment firms bought 1 in 4 homes sold in America since 2020. And they're legally allowed to keep doing it."
bg_type: "gradient-purple"

Slide 4 (The Escalation):
Title: "The Scale Of It"
Body: "In some cities, investment companies now own 1 in every 3 rental properties. Regular buyers simply can't compete."
bg_type: "gradient-red"

Slide 5 (The Question):
Title: "Ban Them Or Not?"
Body: "Should corporations be banned from buying residential homes? Drop your take in the comments 👇"
bg_type: "gradient-gold"

BACKGROUND TYPES:
"gradient-blue" = calm, analytical
"gradient-purple" = hidden truth, mystery
"gradient-red" = alarm, crisis, urgency
"gradient-green" = hope, solution
"gradient-gold" = consequence, big reveal

BEFORE OUTPUTTING: Check each slide body:
□ 2-3 sentences?
□ Each sentence under 15 words?
□ Zero corporate words?
□ Does it tell a single chronological story?
□ Cliffhanger creates real curiosity?

Output ONLY strict JSON:
{ "slides": [ { "slide_number": 1, "title": "...", "body_text": "...", "bg_type": "..." }, ... ] }`;

    const groqClient = getGroqClient();
    const chatResponse = await groqClient.chat.completions.create({
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Hook: "${topic}"` }
        ],
        model: 'openai/gpt-oss-120b',
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const data = JSON.parse(chatResponse.choices[0].message.content);
    return data.slides;
}

export async function generateCaption(topic, script) {
    const systemInstruction = `You write punchy Instagram captions for viral carousels.

STRUCTURE (follow this EXACT format with a line break):
Line 1: A clean, single-sentence thought-provoking hook (under 15 words) ending with 1-2 emojis.
Line 2: Blank line.
Line 3: Copy the EXACT question from the final slide of the carousel script to prompt comments. Add 👇 at the end if it doesn't have it.

NO hashtags. NO stats. Just the one-liner, a blank line, and the question.

EXAMPLE OUTPUT 1:
Your boss might not be a person anymore—it might be an algorithm. 🤖💼

Should we ban AI from setting wages? 👇

EXAMPLE OUTPUT 2:
The people losing jobs aren't the ones benefiting from the shift. 📉

Would you take a pay cut if it meant keeping your human boss? 👇

RULES:
- NO filler phrases like "In this carousel" or "Swipe to learn".
- Write like a confident creator, not a textbook.

Output ONLY a JSON object: { "caption": "your multi-line caption here" }`;

    const groqClient = getGroqClient();
    const chatResponse = await groqClient.chat.completions.create({
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Topic: "${topic}"\n\nCarousel Script:\n${JSON.stringify(script)}` }
        ],
        model: 'openai/gpt-oss-120b',
        response_format: { type: 'json_object' },
        temperature: 0.7,
    });

    const data = JSON.parse(chatResponse.choices[0].message.content);
    return data.caption;
}