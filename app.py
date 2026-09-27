import streamlit as st
import os
import zipfile
import engine

# --- CONFIG ---
st.set_page_config(page_title="AI Insta-Manager", page_icon="🤖", layout="wide")
RESULTS_DIR = "generated_carousel"

if not os.path.exists(RESULTS_DIR):
    os.makedirs(RESULTS_DIR)

# Initialize Session State variables for the Approve flow
if "draft_topic" not in st.session_state:
    st.session_state.draft_topic = None

# Load credentials from the environment; never store API keys in source code.
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
if not MISTRAL_API_KEY:
    st.error("MISTRAL_API_KEY is not configured. Add it to the app environment to continue.")
    st.stop()
engine.setup_client(MISTRAL_API_KEY)

# --- SIDEBAR ---
with st.sidebar:
    st.header("⚙️ Settings")
    st.success("Mistral API Key Active!")
    
    st.markdown("---")
    st.markdown("### Powered By")
    st.markdown("- **Brain:** Mistral Large")
    st.markdown("- **Art:** Pollinations AI")

# --- MAIN UI ---
st.title("🤖 AI Social Media Manager")
st.markdown("Generate five-slide Instagram carousels for your selected niche.")
selected_genre = st.selectbox("Choose your niche", engine.GENRES, index=engine.GENRES.index("History & Hidden Facts"))

# STEP 1: Brainstorm Topic
st.markdown("### Step 1: Idea Generation")
if st.button("Brainstorm Viral Topic 🎯"):
    with st.spinner("Mistral is brainstorming..."):
        st.session_state.draft_topic = engine.generate_topic(selected_genre)
        
# STEP 2: Approve & Edit
if st.session_state.draft_topic:
    st.markdown("### Step 2: Review Topic")
    edited_topic = st.text_input("Edit the topic if you want:", value=st.session_state.draft_topic)
    
    # STEP 3: Generate
    if st.button("Approve & Generate Carousel 🚀", type="primary"):
        # Clear previous results
        for f in os.listdir(RESULTS_DIR):
            os.remove(os.path.join(RESULTS_DIR, f))
            
        progress_bar = st.progress(0)
        status_text = st.empty()
        
        try:
            # Generate Script
            status_text.text("🧠 Writing 5-slide script...")
            script_data = engine.generate_script(edited_topic, selected_genre)
            progress_bar.progress(20)
            
            with st.expander("View AI Generated Script"):
                st.json(script_data)
            
            final_images = []
            
            # Generate Images & Overlay Text
            for i, slide in enumerate(script_data):
                slide_num = slide.get('slide_number', i+1)
                title = slide.get('title', '')
                body = slide.get('body_text', '')
                image_prompt = slide.get('image_prompt', 'dark gradient background abstract')
                
                status_text.text(f"🎨 Generating background for Slide {slide_num}/5...")
                raw_bg_path = os.path.join(RESULTS_DIR, f"raw_bg_{slide_num}.jpg")
                engine.download_image(image_prompt, raw_bg_path)
                
                status_text.text(f"✍️ Overlaying text for Slide {slide_num}/5...")
                final_path = os.path.join(RESULTS_DIR, f"slide_{slide_num}.jpg")
                engine.draw_text_on_image(raw_bg_path, title, body, slide_num, final_path)
                
                final_images.append(final_path)
                progress_bar.progress(20 + int(16 * (i + 1)))

            status_text.text("✅ Carousel Generation Complete!")
            progress_bar.progress(100)
            
            st.success("Successfully generated!")
            
            # Display Images
            st.markdown("### Carousel Preview")
            cols = st.columns(len(final_images))
            for i, img_path in enumerate(final_images):
                with cols[i]:
                    st.image(img_path, use_column_width=True)
            
            # Create ZIP
            zip_path = "carousel.zip"
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for img_path in final_images:
                    zipf.write(img_path, os.path.basename(img_path))
                    
            with open(zip_path, "rb") as fp:
                st.download_button(
                    label="Download Carousel ZIP 📦",
                    data=fp,
                    file_name="carousel_post.zip",
                    mime="application/zip",
                    type="primary"
                )
        except Exception as e:
            st.error(f"An error occurred: {e}")
