"""
Plant Scope AI — ML Service
ViT-based plant disease classification + Gemini LLM treatment advice.
"""

import os
import json
import io
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
model = None
processor = None
plant_classes = {}
gemini_model = None

MODEL_NAME = "google/vit-base-patch16-224"
CLASSES_FILE = os.path.join(os.path.dirname(__file__), "plant_classes.json")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ViT model + class map on startup."""
    global model, processor, plant_classes, gemini_model

    # 1. Load class labels
    with open(CLASSES_FILE, "r") as f:
        plant_classes = json.load(f)
    logger.info(f"Loaded {len(plant_classes)} plant disease classes")

    # 2. Load ViT model
    logger.info(f"Loading ViT model: {MODEL_NAME} ...")
    processor = ViTImageProcessor.from_pretrained(MODEL_NAME)
    model = ViTForImageClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(plant_classes),
        ignore_mismatched_sizes=True,
    )
    model.eval()
    logger.info("ViT model loaded successfully")

    # 3. Init Gemini
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel("gemini-1.5-flash")
        logger.info("Gemini LLM configured")
    else:
        logger.warning("No GEMINI_API_KEY — LLM treatment advice disabled")

    yield  # App runs here

    # Cleanup
    logger.info("Shutting down ML service")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Plant Scope AI — ML Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def classify_image(image: Image.Image) -> dict:
    """Run ViT inference on a PIL image. Returns {disease, confidence}."""
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = torch.nn.functional.softmax(logits, dim=-1)

    predicted_idx = probs.argmax(-1).item()
    confidence = probs[0, predicted_idx].item()

    disease_name = plant_classes.get(str(predicted_idx), f"Unknown ({predicted_idx})")

    return {
        "disease": disease_name,
        "confidence": round(confidence * 100, 2),
        "class_index": predicted_idx,
    }


async def get_treatment_advice(disease: str) -> str:
    """Ask Gemini for plant disease treatment advice."""
    if not gemini_model:
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
        response = await gemini_model.generate_content_async(prompt)
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
        "model_loaded": model is not None,
        "gemini_enabled": gemini_model is not None,
        "num_classes": len(plant_classes),
    }


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    """Classify a plant leaf image. Returns disease + confidence."""
    img = await read_upload_image(image)
    result = classify_image(img)
    return result


@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    """Classify + get LLM treatment advice."""
    img = await read_upload_image(image)
    result = classify_image(img)

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
