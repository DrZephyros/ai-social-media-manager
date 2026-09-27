import json
import requests
import os
from PIL import Image, ImageDraw, ImageFont
import urllib.parse
from mistralai import Mistral

# Global Mistral Client
client = None

GENRES = [
    "Economics", "Tech & AI", "Mental Health", "Physical Fitness",
    "Health & Nutrition", "Bioengineering", "Student Life", "Entrepreneurship",
    "Climate & Environment", "Space & Astronomy", "Neuroscience", "Relationships",
    "Personal Finance", "Future of Work", "Psychology", "History & Hidden Facts",
    "Philosophy", "Geopolitics", "Parenting", "Food Science", "Crypto & Web3", "Other",
]

def setup_client(api_key):
    global client
    client = Mistral(api_key=api_key)

def generate_topic(genre):
    """Generate a topic that is directly about the selected genre."""
    if not client:
        raise Exception("Mistral client not initialized.")
    if not isinstance(genre, str) or not genre.strip():
        raise ValueError("Choose a niche before brainstorming a topic.")

    genre = genre.strip()
    history_guidance = """
For History & Hidden Facts, default to ancient and premodern civilizations. Choose from temples, kingdoms, dynasties, kings and emperors, architecture, archaeology, excavations, inscriptions, coins, manuscripts, artifacts, ruins, daily life, beliefs, trade, or art. Name a concrete historical person, place, object, or event and anchor it to its civilization or period. Distinguish documented evidence from legend or interpretation. Make the central subject historical in its own right.""" if genre == "History & Hidden Facts" else ""

    prompt = f"""You are an Instagram carousel idea editor.
The required niche is {json.dumps(genre)}. The subject itself must directly belong to this niche.
Niche guidance: {history_guidance or 'Choose a specific, useful, accurate subject that directly fits the selected niche. Do not substitute a familiar trending topic.'}

Privately consider three different candidate subjects from the selected niche. Choose the most concrete and well-supported one. Check that the central subject itself fits the niche, then write one clear hook under 15 words. Do not reveal your candidate list or reasoning. Do not invent claims, statistics, or dates.
Return only the hook."""
    
    chat_completion = client.chat.complete(
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        model="mistral-large-latest",
    )
    return chat_completion.choices[0].message.content.strip()

def generate_script(topic, genre):
    """Calls Mistral AI to generate a 5-slide script within the selected genre."""
    if not client:
        raise Exception("Mistral client not initialized.")
        
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
    
    chat_completion = client.chat.complete(
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": json.dumps({"genre": genre, "topic": topic})},
        ],
        model="mistral-large-latest",
        response_format={"type": "json_object"}
    )
    
    response_text = chat_completion.choices[0].message.content
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
