import json
import requests
import os
from PIL import Image, ImageDraw, ImageFont
import urllib.parse
from mistralai import Mistral

# Global Mistral Client
client = None

def setup_client(api_key):
    global client
    client = Mistral(api_key=api_key)

def generate_topic():
    """Asks Mistral AI to brainstorm a trending, viral topic automatically."""
    if not client:
        raise Exception("Mistral client not initialized.")
        
    prompt = "You are a viral Instagram strategist. Give me exactly ONE highly engaging, controversial, and trending topic about macroeconomics, future technology, or geopolitics for an Instagram carousel. Do not include quotes or extra text. Just the short topic name."
    
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

def generate_script(topic):
    """Calls Mistral AI to generate a 5-slide JSON script."""
    if not client:
        raise Exception("Mistral client not initialized.")
        
    system_instruction = '''
    You are an expert geopolitical analyst, tech futurist, and viral Instagram strategist. 
    I will give you a trending topic. Break it down into a highly engaging, 5-slide Instagram carousel.
    Keep text minimal. Slide 1 is a hook. Slide 2 is context. Slide 3-4 is the AI's solution/prediction. Slide 5 is a question to drive comments.
    
    You must output your response in JSON format. The root must be a JSON object with a single key "slides", which is an array of objects. 
    Each object must have exactly these keys: slide_number, title, body_text, image_prompt.
    image_prompt should describe a cinematic, dark, highly aesthetic background without text.
    '''
    
    chat_completion = client.chat.complete(
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": f"Topic: {topic}"},
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
