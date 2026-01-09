#!/bin/bash
# Build and deploy custom Twenty image with Azure + Vertex AI support
# Usage: ./scripts/deploy-custom-image.sh

set -e

PROJECT_ID="split-12-08-25"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/twenty-custom"

echo "=== Building Custom Twenty Image ==="
echo "This includes Azure OpenAI and Vertex AI Anthropic support"
echo ""

# Ensure we're on the customizations branch
git checkout split-customizations

# Build using Cloud Build (faster than local)
echo "Submitting build to Cloud Build..."
gcloud builds submit \
  --project=$PROJECT_ID \
  --config=cloudbuild.yaml \
  --timeout=1800s

echo ""
echo "=== Deploying to Cloud Run ==="

# Update the service with the new image
gcloud run services update twenty-server \
  --region=$REGION \
  --image="${IMAGE_NAME}:latest"

echo ""
echo "=== Deployment Complete ==="
echo "Custom Twenty with Azure + Vertex AI is now running!"
echo ""
echo "Service URL: https://crm.split-llc.com"
