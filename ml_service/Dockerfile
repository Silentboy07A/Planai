FROM python:3.11-slim

WORKDIR /app

# Install system deps for Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (torch CPU-only for smaller image)
COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

# Copy app code
COPY . .

# Pre-download the ViT model at build time (faster cold starts)
RUN python -c "from transformers import ViTForImageClassification, ViTImageProcessor; \
    ViTImageProcessor.from_pretrained('google/vit-base-patch16-224'); \
    ViTForImageClassification.from_pretrained('google/vit-base-patch16-224', num_labels=38, ignore_mismatched_sizes=True)"

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
