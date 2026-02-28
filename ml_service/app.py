"""
Plant Scope AI — ML Service
Dual-model plant disease detection:
  1. ViT classifier (PlantVillage 38 classes) — fast, offline
  2. Gemini Vision (any plant) — broader coverage, handles house plants
Plus Gemini LLM for treatment advice.
"""

import os
import json
import io
import base64
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import torch
from transformers import ViTForImageClassification, ViTImageProcessor
import google.generativeai as genai

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals (loaded at startup)
# ---------------------------------------------------------------------------
vit_model = None
vit_processor = None
plant_classes = {}
gemini_text_model = None
gemini_vision_model = None

VIT_MODEL_NAME = "google/vit-base-patch16-224"
CLASSES_FILE = os.path.join(os.path.dirname(__file__), "plant_classes.json")

# Confidence threshold: if ViT confidence is below this, use Gemini Vision
VIT_CONFIDENCE_THRESHOLD = 40.0  # percent


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup."""
    global vit_model, vit_processor, plant_classes, gemini_text_model, gemini_vision_model

    # 1. Load class labels
    with open(CLASSES_FILE, "r") as f:
        plant_classes = json.load(f)
    logger.info(f"Loaded {len(plant_classes)} plant disease classes")

    # 2. Load ViT model
    logger.info(f"Loading ViT model: {VIT_MODEL_NAME} ...")
    vit_processor = ViTImageProcessor.from_pretrained(VIT_MODEL_NAME)
    vit_model = ViTForImageClassification.from_pretrained(
        VIT_MODEL_NAME,
        num_labels=len(plant_classes),
        ignore_mismatched_sizes=True,
    )
    vit_model.eval()
    logger.info("ViT model loaded successfully")

    # 3. Init Gemini (text + vision)
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        gemini_text_model = genai.GenerativeModel("gemini-1.5-flash")
        gemini_vision_model = genai.GenerativeModel("gemini-1.5-flash")
        logger.info("Gemini (text + vision) configured")
    else:
        logger.warning("No GEMINI_API_KEY — Gemini Vision + treatment advice disabled")

    yield
    logger.info("Shutting down ML service")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Plant Scope AI — ML Service",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Model 1: ViT Classifier (PlantVillage)
# ---------------------------------------------------------------------------
def classify_with_vit(image: Image.Image) -> dict:
    """Run ViT inference. Returns {disease, confidence, model_used}."""
    inputs = vit_processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = vit_model(**inputs)
        logits = outputs.logits
        probs = torch.nn.functional.softmax(logits, dim=-1)

    predicted_idx = probs.argmax(-1).item()
    confidence = round(probs[0, predicted_idx].item() * 100, 2)

    disease_name = plant_classes.get(str(predicted_idx), f"Unknown ({predicted_idx})")

    return {
        "disease": disease_name,
        "confidence": confidence,
        "class_index": predicted_idx,
        "model_used": "ViT (PlantVillage)",
    }


# ---------------------------------------------------------------------------
# Model 2: Gemini Vision (any plant — house plants, flowers, herbs)
# ---------------------------------------------------------------------------
async def classify_with_gemini_vision(image: Image.Image) -> dict:
    """Use Gemini Vision to identify plant disease from image. Works for ANY plant."""
    if not gemini_vision_model:
        return None

    # Convert PIL image to bytes
    img_bytes = io.BytesIO()
    image.save(img_bytes, format="JPEG")
    img_bytes.seek(0)

    prompt = """You are an expert plant pathologist specializing in house-grown, indoor, and small garden plants
including herbs (mint, tulsi, basil, coriander, rosemary, oregano), flowers (rose, hibiscus, marigold,
jasmine, dahlia, lavender), vegetables (tomato, chilli, capsicum, spinach), fruits (strawberry, lemon,
guava, mango, banana, grapes), and other common house plants (aloe vera, drumstick/moringa, curry leaves).

Analyze this plant leaf image and identify:
1. The plant species (if identifiable)
2. Any disease or health issue visible
3. Your confidence level (0-100%)

Respond in EXACTLY this JSON format, nothing else:
{"plant": "plant name", "disease": "disease name or Healthy", "confidence": 85}

If the plant looks healthy, set disease to "Healthy".
If you cannot identify the plant, still try to identify any visible disease symptoms."""

    try:
        img_part = {
            "mime_type": "image/jpeg",
            "data": img_bytes.getvalue(),
        }

        response = await gemini_vision_model.generate_content_async([prompt, img_part])
        text = response.text.strip()

        # Parse JSON from response
        # Handle potential markdown code blocks
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)

        plant_name = result.get("plant", "Unknown")
        disease = result.get("disease", "Unknown")
        confidence = float(result.get("confidence", 50))

        # Format disease name with plant name
        if disease.lower() == "healthy":
            full_name = f"{plant_name} — Healthy"
        else:
            full_name = f"{plant_name} — {disease}"

        return {
            "disease": full_name,
            "confidence": confidence,
            "class_index": -1,
            "model_used": "Gemini Vision",
            "plant_identified": plant_name,
        }

    except Exception as e:
        logger.error(f"Gemini Vision error: {e}")
        return None


# ---------------------------------------------------------------------------
# Smart Detection: ViT first, Gemini Vision fallback
# ---------------------------------------------------------------------------
async def smart_classify(image: Image.Image) -> dict:
    """
    Dual-model detection:
    1. Try ViT (fast, offline) — great for PlantVillage crops
    2. If confidence is low, use Gemini Vision (broader coverage for house plants)
    """
    # Step 1: ViT classification
    vit_result = classify_with_vit(image)
    logger.info(f"ViT result: {vit_result['disease']} ({vit_result['confidence']}%)")

    # Step 2: If ViT is confident enough, use it
    if vit_result["confidence"] >= VIT_CONFIDENCE_THRESHOLD:
        return vit_result

    # Step 3: Low confidence → try Gemini Vision for better coverage
    logger.info(f"ViT confidence ({vit_result['confidence']}%) below threshold, trying Gemini Vision...")
    gemini_result = await classify_with_gemini_vision(image)

    if gemini_result:
        logger.info(f"Gemini Vision result: {gemini_result['disease']} ({gemini_result['confidence']}%)")
        return gemini_result

    # Step 4: Gemini Vision unavailable/failed, return ViT result anyway
    logger.warning("Gemini Vision unavailable, returning ViT result")
    return vit_result


# ---------------------------------------------------------------------------
# Treatment Advice (Gemini LLM)
# ---------------------------------------------------------------------------
async def get_treatment_advice(disease: str) -> str:
    """Ask Gemini for plant disease treatment advice tailored to house plants."""
    if not gemini_text_model:
        return "Treatment advice unavailable — no Gemini API key configured."

    prompt = f"""You are a plant care expert specializing in house-grown, indoor, and small home garden plants.
A home-grown plant has been diagnosed with: "{disease}".

Provide a concise, actionable response suitable for a home gardener growing plants in pots or small gardens.
Use this exact format:

**Cause:** (1-2 sentences)
**Symptoms:** (bullet list, 3-4 items)
**Treatment:** (numbered steps, 3-5 items, using easily available home remedies and products)
**Prevention:** (bullet list, 3-4 items)

Keep the response under 200 words. Be practical, beginner-friendly, and specific to home growing conditions."""

    try:
        response = await gemini_text_model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Gemini error: {e}")
        return f"Could not generate treatment advice: {str(e)}"


async def read_upload_image(file: UploadFile) -> Image.Image:
    """Read an uploaded file into a PIL Image."""
    contents = await file.read()
    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")
    return image


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models": {
            "vit_loaded": vit_model is not None,
            "gemini_vision_enabled": gemini_vision_model is not None,
            "gemini_text_enabled": gemini_text_model is not None,
        },
        "num_vit_classes": len(plant_classes),
        "confidence_threshold": VIT_CONFIDENCE_THRESHOLD,
    }


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    """Smart classification: ViT + Gemini Vision fallback."""
    img = await read_upload_image(image)
    result = await smart_classify(img)
    return result


@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    """Smart classification + LLM treatment advice."""
    img = await read_upload_image(image)
    result = await smart_classify(img)

    # Skip treatment advice for healthy plants
    if "healthy" in result["disease"].lower():
        result["treatment"] = "Your plant looks healthy! Keep up the good care. 🌱"
    else:
        result["treatment"] = await get_treatment_advice(result["disease"])

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
