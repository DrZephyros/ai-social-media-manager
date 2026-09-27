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

// Shared guidance keeps topic brainstorming and carousel writing aligned by genre.
const GENRE_PROFILES = {
    'Economics': `Cover an economic idea, event, or measure through its effect on ordinary people. Pick one clear question: prices, wages, jobs, trade, debt, housing, growth, or inequality. Distinguish correlation from cause, specify country/timeframe for figures, and explain terms plainly. Avoid partisan blame and predictions presented as certainty.`,
    'Tech & AI': `Focus on a real technology, product, capability, limitation, or documented use. Explain what it does, how it works at a high level, and who is affected. Separate demonstrated features from speculation; avoid sentient-AI tropes, unsupported capability claims, and generic job-replacement predictions.`,
    'Mental Health': `Offer supportive, nonjudgmental mental-health education or practical coping ideas. Avoid diagnosing the audience, promising cures, shame, or presenting personal advice as treatment. Distinguish everyday stress from clinical conditions and encourage qualified support for serious concerns.`,
    'Physical Fitness': `Give evidence-aware movement, strength, mobility, or training guidance. Make advice practical and adaptable to experience and ability. Avoid miracle transformations, unsafe extremes, body shaming, and guarantees; mention gradual progression and recovery where relevant.`,
    'Health & Nutrition': `Explain a nutrition or general-health question with balanced, evidence-aware language. Use realistic portions and context; distinguish established evidence from uncertainty. Avoid diet absolutism, fearmongering, diagnosis, miracle claims, and individualized medical instructions.`,
    'Bioengineering': `Explain a specific biological engineering method, application, or debate in accessible terms. Clarify what is technically possible today versus experimental or hypothetical. Include benefits, limits, safety, and ethical considerations without sensationalizing or giving actionable wet-lab protocols.`,
    'Student Life': `Address a recognizable student challenge or useful opportunity: studying, time, money, campus life, motivation, or transitions. Give concrete steps that fit real student constraints. Avoid assuming every student has the same resources, schedule, or education system.`,
    'Entrepreneurship': `Focus on a specific founder decision, customer problem, business model, or operating lesson. Explain the tradeoffs and practical takeaway. Avoid get-rich-quick promises, survivorship bias, invented revenue figures, and treating one founder's path as universal.`,
    'Climate & Environment': `Explain a specific environmental change, ecosystem, solution, or local impact. Ground claims in place, timescale, and evidence; distinguish weather from climate. Avoid doom, false balance, unsupported attribution, and implying one action alone solves a systemic problem.`,
    'Space & Astronomy': `Build around a real celestial object, mission, observation, or astronomical concept. Explain scale and evidence accessibly, using comparisons carefully. Separate confirmed findings from hypotheses; avoid fictional alien claims and misleading scale analogies.`,
    'Neuroscience': `Explain one brain or nervous-system process, study, or finding in plain language. Distinguish animal research, early studies, and established human evidence. Avoid brain myths, simplistic neurotransmitter explanations, and claims that scans or studies prove more than they do.`,
    'Relationships': `Explore a specific communication pattern, boundary, or relationship situation with empathy for everyone involved. Offer reflective language or practical options, not universal rules. Avoid diagnosing partners, manipulation tactics, gender stereotypes, or assuming abuse can be solved by ordinary communication advice.`,
    'Personal Finance': `Teach one practical money concept such as budgeting, saving, borrowing, insurance, or investing. Use transparent assumptions and explain risk, fees, and time horizon when relevant. Avoid guaranteed returns, shame, or personalized financial advice; state that outcomes depend on circumstances.`,
    'Future of Work': `Examine a documented workplace change, job practice, or plausible scenario and who it affects. Separate current evidence from forecast, include both opportunities and tradeoffs, and avoid unsupported job-loss percentages or treating workers as interchangeable.`,
    'Psychology': `Explain a specific behavior, bias, or psychological idea with examples. Avoid pop-psych labels, armchair diagnosis, and claiming a single study explains everyone. Note context and individual differences; distinguish a useful model from settled fact.`,
    'History & Hidden Facts': `Stay in the past: center a real person, event, place, object, custom, or discovery, anchored by a name, era, place, or date. Explain what happened, its historical context, evidence, and consequence. Do not attach the word "history" to a modern trend or future prediction. Avoid invented anecdotes, myths stated as facts, anachronism, and flattening disputed interpretations.`,
    'Philosophy': `Explore one philosophical question or argument fairly. Define the key idea in everyday language, present a strong version of the reasoning and a meaningful objection, then leave room for the reader's judgment. Do not misrepresent a philosopher or pretend contested questions have settled answers.`,
    'Geopolitics': `Explain a specific international event, relationship, or policy with clear geography, actors, interests, and timeframe. Attribute claims, distinguish verified facts from each side's position, and provide context without propaganda, dehumanization, or false certainty about motives.`,
    'Parenting': `Give age-aware, compassionate guidance for a clearly defined parenting situation. Respect differences in children, families, disability, culture, and resources. Avoid shame, perfectionism, guarantees, or medical/developmental claims beyond reliable evidence.`,
    'Food Science': `Explain a food property, ingredient, cooking change, or safety question through the science people can observe. Be precise about conditions and evidence. Distinguish taste, nutrition, and safety; avoid fearmongering and unsupported health claims.`,
    'Crypto & Web3': `Explain a specific crypto asset, protocol, use case, or risk without promotion. Describe how it works and its limitations, including volatility, custody, scams, and regulatory uncertainty where relevant. Never promise profits or present token claims as verified facts.`,
    'Other': `Use the user's custom genre as the scope. First identify its central subject and audience, then choose one concrete, useful, accurate angle. Do not drift into unrelated trending subjects.`,
};

function getGenreGuidance(genre) {
    if (!genre) return 'Choose one concrete, accurate, broadly interesting subject and keep every slide on that subject.';
    return GENRE_PROFILES[genre] || `Treat "${genre}" as the subject and audience. Pick one concrete angle that clearly belongs to it, explain it accurately in accessible language, and exclude unrelated trends or topics.`;
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
    const generatePrompt = `You are an expert Instagram carousel idea editor.
Suggest ONE specific, genuinely interesting subject for a short ${genre ? `"${genre}"` : 'surprising general-knowledge'} carousel.

The selected genre defines what the post is ABOUT. Keep the subject inside that genre from the first word to the last. Do not pivot to business, economics, technology, current trends, or the future unless that is the selected genre and the specific subject calls for it.
GENRE-SPECIFIC BRIEF: ${getGenreGuidance(genre)}

Write a clear, intriguing hook under 15 words. Be accurate and concrete; prefer a named person, place, event, object, or time period. Avoid vague bait such as "hidden truth nobody talks about" and generic templates about AI, data, or what the future will look like. Do not invent facts or imply a connection that the subject does not have.

Output only the hook, with no quotes or explanation.`;

    try {
        const groqClient = getGroqClient();
        const res = await groqClient.chat.completions.create({
            messages: [{ role: 'system', content: generatePrompt }],
            model: 'openai/gpt-oss-120b',
            temperature: 0.8,
        });
        
        let hook = res.choices[0].message.content.trim().replace(/^"|"$/g, '');
        if (genre === 'History & Hidden Facts' && !isClearlyHistoricalHook(hook)) {
            console.warn("Generated hook did not fit the history genre. Retrying.");
            const retry = await groqClient.chat.completions.create({
                messages: [
                    { role: 'system', content: `${generatePrompt}\n\nYour previous hook was off-genre. Generate a different hook that follows the history brief and is unmistakably about a real subject from the past.` },
                    { role: 'user', content: `Off-genre hook to avoid: "${hook}"` }
                ],
                model: 'openai/gpt-oss-120b',
                temperature: 0.7,
            });
            hook = retry.choices[0].message.content.trim().replace(/^"|"$/g, '');
        }
        
        // Final jargon check
        if (!containsJargon(hook) && hook.length < 120 && (genre !== 'History & Hidden Facts' || isClearlyHistoricalHook(hook))) {
            console.log("Dynamically generated hook:", hook);
            return hook;
        } else {
            console.warn("Generated hook contained jargon or was too long. Falling back to default.");
        }
    } catch (e) {
        console.error("Hook generation failed:", e.message);
    }

    // Fallback if AI fails
    const defaultTopic = genre === 'History & Hidden Facts'
        ? "How an ancient Roman fire brigade fought the city's deadliest blazes"
        : genre ? `A surprising story from ${genre}` : "A surprising fact hiding in plain sight";
    return defaultTopic;
}

function isClearlyHistoricalHook(hook) {
    const text = hook.toLowerCase();
    const modernFutureTerms = /\b(ai|artificial intelligence|jobs?|workforce|2030|2040|2050|in ten years|next decade|future|will replace|will erase)\b/i;
    if (modernFutureTerms.test(text)) return false;
    const historicalClues = /\b(ancient|medieval|century|centuries|bc|bce|ad|ce|empire|king|queen|pharaoh|roman|ottoman|vikings?|samurai|dynasty|historical|history|war|revolution|invention|invented|founded|built|ruled|discovered|before \d{3,4}|\d{3,4})\b/i;
    return historicalClues.test(text);
}

export async function generateScript(topic, genre = null) {
    const systemInstruction = `You write Instagram carousel scripts. Your style: conversational, insightful, and punchy. Like a smart friend texting you something wild they just found out.
${genre ? `SELECTED GENRE: ${genre}.
GENRE-SPECIFIC BRIEF: ${getGenreGuidance(genre)}
GENRE FIDELITY (top priority): The selected genre is the subject, not a decorative angle. Every slide must directly develop the same topic within "${genre}". Do not import unrelated topics just to create drama. If the supplied hook conflicts with the selected genre, preserve its core only if it fits; otherwise replace it with a clearly on-genre subject and tell that story.
` : ''}
HARD RULES — violating any = failure:
1. Carousel Length: Generate between 5 to 8 slides. Choose the length that best fits the story.
2. Body text = 2 to 3 sentences. No more.
3. Each sentence = MAX 15 words. Count them. Cut if over. Keep it readable.
4. ZERO corporate/abstract words. Cut: "productivity", "imbalance", "firms", "sectors", "entities", "mechanisms", "dynamics", "paradigm", "leverage", "ecosystem".
5. Stats: 1-2 stats max per slide. Make them feel real and specific (not round numbers like 40%).
6. Titles = max 5 words. Thriller chapter energy.
7. Avoid unsupported blame. Be accurate and fair. Discuss sensitive or political material only when central to the genre and topic; describe it with context and neutral, attributable claims. Slide titles and body text must NEVER be misleading.

NARRATIVE FLOW:
Tell one cohesive story suited to the genre and topic, not a generic problem-and-villain formula. Use the sequence that fits: for history, establish time and place, introduce the people or event, explain what happened and why, then show its consequence or legacy; for science/health, explain the discovery or mechanism and its evidence; for advice/lifestyle, offer a useful progression; for ideas/culture, unpack the claim with examples. Do not force a false culprit, villain, crisis, or controversy. End with a relevant question that invites genuine discussion.

WRITING QUALITY:
- Use plain, vivid language and specific details. Explain necessary technical terms in everyday words.
- Build curiosity with a clear question or reveal, then give the answer promptly. Never rely on vague phrases such as "the real surprise" or "hidden imbalance".
- Keep claims factual and proportionate. Do not invent statistics, quotes, motives, or causal links. If a detail is uncertain, omit it or qualify it.
- Give each slide a useful role in the story; avoid repeating the hook or padding with generic engagement bait.
- The final slide should deliver the takeaway and end with a relevant question for discussion.

BACKGROUND TYPES:
"gradient-blue" = calm, analytical
"gradient-purple" = hidden truth, mystery
"gradient-red" = alarm, crisis, urgency
"gradient-green" = hope, solution
"gradient-gold" = consequence, big reveal

IMAGE SEARCH KEYWORDS (CRITICAL FOR VISUAL QUALITY):
Each slide MUST include an "image_query" field — a 2-4 word search query for finding a relevant stock photo background.
- Make it VISUAL and CONCRETE. Think: what would look dramatic as a background image?
- GOOD: "empty office desk", "robot factory assembly", "crowded city skyline", "person holding cash"
- BAD: "economics", "future", "crisis" (too abstract, bad search results)
- Each slide should have a DIFFERENT image_query. Variety is key.

BEFORE OUTPUTTING: Check each slide body:
□ 2-3 sentences?
□ Each sentence under 15 words?
□ Zero corporate words?
□ Does it stay specifically within the selected genre and deliver the supplied topic?
□ Does its story structure fit this genre instead of forcing a villain/problem narrative?
□ image_query is concrete and visual?

Output ONLY strict JSON:
{ "slides": [ { "slide_number": 1, "title": "...", "body_text": "...", "bg_type": "...", "image_query": "..." }, ... ] }`;

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
