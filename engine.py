import json
import requests
import os
import re
from PIL import Image, ImageDraw, ImageFont
import urllib.parse

# Gemini API key configured by the app environment.
client = None
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

GENRES = [
    "Economics", "Tech & AI", "Mental Health", "Physical Fitness",
    "Health & Nutrition", "Bioengineering", "Student Life", "Entrepreneurship",
    "Climate & Environment", "Space & Astronomy", "Neuroscience", "Relationships",
    "Personal Finance", "Future of Work", "Psychology", "History & Hidden Facts",
    "Philosophy", "Geopolitics", "Parenting", "Food Science", "Crypto & Web3", "Other",
]

# Positive, selected-genre-only examples teach the subject boundary without
# exposing the model to unrelated niches as negative prompts.
TOPIC_BRIEFS = {
    "Economics": ("Explain an economic idea through prices, wages, jobs, trade, debt, housing, or inequality and its effect on ordinary people.", ["Why one supply shock changed grocery prices", "What a housing shortage means for renters"]),
    "Tech & AI": ("Choose a real technology, capability, limitation, or documented use. Separate current evidence from speculation.", ["What a language model can and cannot infer", "Why a device needs a particular sensor"]),
    "Mental Health": ("Choose a mental-health condition or experience, symptoms, stigma, coping, sleep, social support, therapy, help-seeking, or a daily habit that may affect wellbeing. Use compassionate, non-diagnostic language. Explain possible relationships carefully; do not promise cures or present general information as personal treatment.", ["What people misunderstand about depression", "How eating patterns may affect mood and energy", "Why grief can return long after a loss", "What burnout can feel like before you notice it"]),
    "Physical Fitness": ("Focus on movement, strength, mobility, training, or recovery. Keep advice practical and adaptable.", ["Why rest days support strength gains", "How walking pace changes a workout"]),
    "Health & Nutrition": ("Explain a nutrition or general-health question with balanced, evidence-aware language.", ["How fibre supports digestion", "Why meal timing can affect hunger"]),
    "Bioengineering": ("Explain a biological engineering method, application, research challenge, or ethical question accessibly.", ["How engineered cells make insulin", "Why gene therapy delivery is difficult"]),
    "Student Life": ("Address a recognizable student challenge or opportunity in studying, time, money, campus life, or transitions.", ["How to start an overwhelming assignment", "Why office hours can help students learn"]),
    "Entrepreneurship": ("Focus on a customer problem, founder decision, business model, or operating lesson. Avoid guaranteed success claims.", ["How a founder tests an idea with customers", "What pricing can reveal about demand"]),
    "Climate & Environment": ("Explain an ecosystem, environmental change, conservation practice, or local climate impact with place and evidence.", ["How mangroves protect coastal communities", "What wetlands do for a river"]),
    "Space & Astronomy": ("Build around a real celestial object, mission, observation, or astronomical concept.", ["How astronomers find a planet they cannot see", "Why eclipses are not monthly"]),
    "Neuroscience": ("Explain a brain or nervous-system process or finding, distinguishing early research from established evidence.", ["How sleep supports memory", "How the brain processes spoken language"]),
    "Relationships": ("Explore a communication pattern, boundary, conflict skill, or social connection with empathy.", ["How to name a need during a disagreement", "Why repair matters after conflict"]),
    "Personal Finance": ("Teach one practical money concept such as budgeting, saving, borrowing, insurance, or investing.", ["What a minimum card payment can cost", "How compound interest affects monthly savings"]),
    "Future of Work": ("Examine a documented workplace change, job practice, worker skill, or organizational decision. Separate evidence from forecasts.", ["How a tool changes one workplace task", "What workers need during a role redesign"]),
    "Psychology": ("Explain a behavior, cognitive bias, decision process, or social behavior without diagnosing people.", ["Why unfinished tasks stay in memory", "How framing changes a choice"]),
    "History & Hidden Facts": ("Tell an evidence-grounded story about the human past. Prefer ancient and premodern civilizations, temples, rulers, dynasties, empires, archaeology, inscriptions, artifacts, daily life, and discoveries. Name a concrete person, place, object, or event and anchor it in period and place. Distinguish evidence from interpretation or legend.", ["A mystery surrounding King Tut's tomb", "An overlooked detail about Alexander the Great", "What an inscription reveals about a forgotten ruler", "An archaeological find that changed a civilization's story"]),
    "Philosophy": ("Explore one philosophical question, argument, thinker, or ethical dilemma fairly.", ["What makes a choice fair when both options cause harm", "Why Socrates questioned certainty"]),
    "Geopolitics": ("Explain an international event or relationship with clear geography, actors, interests, and timeframe.", ["Why a narrow sea route matters to trade", "How a border shapes neighboring countries' choices"]),
    "Parenting": ("Give compassionate, age-aware guidance for a defined parenting situation while respecting family differences.", ["How to help a child name a big feeling", "Why predictable routines can help children"]),
    "Food Science": ("Explain an ingredient, cooking process, food-safety question, or observable change.", ["Why bread rises in the oven", "How acidity changes a sauce"]),
    "Crypto & Web3": ("Explain a specific digital asset, protocol, security risk, or network behavior without promoting investment.", ["What happens when a wallet recovery phrase is lost", "Why network fees rise when activity increases"]),
    "Other": ("Use the custom genre as the boundary; select one concrete subject useful to its audience.", ["A specific question a curious beginner asks", "A practical process people often misunderstand"]),
}

def setup_client(api_key):
    global client
    client = api_key

def gemini_generate(system_instruction, user_content, temperature=0.7):
    if not client:
        raise Exception("Gemini API key not configured.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    response = requests.post(
        url,
        headers={"x-goog-api-key": client, "Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": [{"text": user_content}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": temperature,
                "thinkingConfig": {"thinkingLevel": "high"},
            },
        },
        timeout=45,
    )
    if not response.ok:
        try:
            detail = response.json().get("error", {}).get("message", "")
        except ValueError:
            detail = ""
        if response.status_code in (400, 403):
            raise Exception(f"Gemini rejected the request or API key: {detail or response.status_code}")
        if response.status_code == 429:
            raise Exception("Gemini usage is temporarily rate-limited. Please wait and try again.")
        raise Exception(f"Gemini request failed: {detail or response.status_code}")
    try:
        parts = response.json()["candidates"][0]["content"]["parts"]
        return "".join(part.get("text", "") for part in parts).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise Exception("Gemini returned no text. Check the prompt and API safety settings.") from exc

def generate_topic(genre):
    """Generate a topic that is directly about the selected genre."""
    if not client:
        raise Exception("Gemini API key not configured.")
    if not isinstance(genre, str) or not genre.strip():
        raise ValueError("Choose a niche before brainstorming a topic.")

    genre = genre.strip()
    brief, examples = TOPIC_BRIEFS.get(genre, TOPIC_BRIEFS["Other"])
    references = "\n".join(f"- {example}" for example in examples)

    prompt = f"""You are an Instagram carousel idea editor.
The required niche is {json.dumps(genre)}. The subject itself must directly belong to this niche.
Niche guidance: {brief}
Reference directions (selected niche only): {references}

The examples show the genre boundary only. Generate a different subject. Do not copy, paraphrase, combine, or add a new claim to an example.
Virality principles: Choose a topic with immediate clarity, audience relevance, specific novelty, and an honest curiosity gap the carousel can pay off. Use the best-fitting angle: a documented surprise, misconception corrected by evidence, real mystery, hidden cause, meaningful contradiction, human consequence, or useful practical insight. Do not force controversy. Privately compare several ideas for stop-scroll clarity, emotional or practical stakes, shareability, evidence quality, and payoff. No prompt can guarantee virality. Never invent a named theory, technique, study, organization, discovery, date, statistic, or causal result to make a topic clickable.
Privately consider three different candidate subjects from the selected niche. Choose the most concrete and well-supported one. Check that the central subject itself fits the niche, then write one clear hook under 15 words. Do not reveal your candidate list or reasoning. Do not invent claims, statistics, or dates.
Return only JSON: {{"topic":"one final hook"}}"""
    
    for attempt in range(3):
        try:
            result = json.loads(gemini_generate("You are an Instagram carousel idea editor. Follow the user's selected niche exactly.", prompt + ("\nStart over with a different concrete subject if your previous answer drifted from the niche." if attempt else ""), 0.7))
            topic = result.get("topic", "").strip()
        except (json.JSONDecodeError, AttributeError):
            continue
        if topic and len(topic) <= 150 and not re.search(r"\b(i fed ai|i asked ai|ai analyzed|the answer surprised me|here's what ai found)\b", topic, re.I):
            if genre != "History & Hidden Facts" or is_history_topic(topic):
                return topic
    raise ValueError(f"Could not create a topic that fits {genre}. Please try brainstorming again.")

def is_history_topic(topic):
    anchors = r"\b(ancient|medieval|empire|dynasty|king|queen|emperor|temple|archaeolog\w*|excavat\w*|inscription|coin|manuscript|artifact|ruins?|fort|palace|monument|tomb|pyramid|civilization|chola|maurya|gupta|mughal|ashoka|hampi|ajanta|nalanda|harappa|indus|mesopotamia|egyptian|roman|greek|aztec|inca|maya|century|bce|bc|ce|ad)\b"
    return bool(re.search(anchors, topic, re.IGNORECASE))

def generate_script(topic, genre):
    """Calls Gemini to generate a 5-slide script within the selected genre."""
    if not client:
        raise Exception("Gemini API key not configured.")
    if genre == "History & Hidden Facts" and not is_history_topic(topic):
        raise ValueError("Choose a genuine historical subject before generating a history carousel.")
        
    system_instruction = f'''
    You are a careful, engaging Instagram carousel writer.
    The selected niche is {json.dumps(genre)}. Keep every slide directly about that niche and the supplied topic. Do not switch to another subject or invent a prediction or solution.
    For history, default to ancient and premodern civilizations, including temples, rulers, dynasties, empires, archaeology, inscriptions, and artifacts. Explain when and where the subject belongs; distinguish evidence from interpretation and legend.
    Build a concise five-slide story: introduce the concrete subject, give its context, explain the key evidence or development, show its significance, then ask a relevant question.
    Use plain language. Do not invent dates, statistics, quotes, or causal claims.
    
    You must output your response in JSON format. The root must be a JSON object with a single key "slides", which is an array of objects. 
    Each object must have exactly these keys: slide_number, title, body_text, image_prompt.
    image_prompt should describe a cinematic, dark, highly aesthetic background without text.
    '''
    
    response_text = gemini_generate(system_instruction, json.dumps({"genre": genre, "topic": topic}), 0.7)
    try:
        data = json.loads(response_text)
        return data["slides"] # Return the array of slides
    except Exception as e:
        raise Exception(f"Failed to generate valid script: {str(e)}\nRaw Response: {response_text}")

def download_image(prompt, filepath):
    """Uses a free no-auth API (Pollinations.ai) to generate and download an image."""
    encoded_prompt = urllib.parse.quote(prompt + " dark cinematic highly aesthetic wallpaper")
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1080&height=1080&nologo=true"
    
    response = requests.get(url)
    if response.status_code == 200:
        with open(filepath, 'wb') as f:
            f.write(response.content)
    else:
        raise Exception("Failed to download image.")

def draw_text_on_image(image_path, title, body, slide_number, output_path):
    """Adds a dark overlay and text to the image using Pillow."""
    try:
        img = Image.open(image_path).convert("RGBA")
    except Exception as e:
        raise Exception(f"Could not open image {image_path}: {e}")
    
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 160))
    img = Image.alpha_composite(img, overlay)
    
    draw = ImageDraw.Draw(img)
    width, height = img.size
    
    try:
        title_font = ImageFont.truetype("arialbd.ttf", 80)
        body_font = ImageFont.truetype("arial.ttf", 50)
        footer_font = ImageFont.truetype("arial.ttf", 35)
    except IOError:
        title_font = ImageFont.load_default()
        body_font = ImageFont.load_default()
        footer_font = ImageFont.load_default()
    
    def wrap_text(text, font, max_width):
        lines = []
        words = text.split()
        while words:
            line = ''
            while words and draw.textlength(line + words[0], font=font) <= max_width:
                line += (words.pop(0) + ' ')
            lines.append(line.strip())
        return lines

    margin = 80
    max_text_width = width - (margin * 2)
    
    # Title
    title_lines = wrap_text(title, title_font, max_text_width)
    y_text = height // 3 - 100
    for line in title_lines:
        draw.text((margin, y_text), line, font=title_font, fill="white")
        y_text += 90
        
    # Body
    y_text += 40
    body_lines = wrap_text(body, body_font, max_text_width)
    for line in body_lines:
        draw.text((margin, y_text), line, font=body_font, fill="#DDDDDD")
        y_text += 60
        
    # Footer
    footer_text = f"Slide {slide_number} / 5 | @YourAI_Page"
    draw.text((margin, height - 100), footer_text, font=footer_font, fill="#888888")
    
    img = img.convert("RGB")
    img.save(output_path)
