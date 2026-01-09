#!/bin/bash
set -e

echo "🚀 Starting Deployment to Google Cloud Platform..."

# Ensure we are in the root directory
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)
YARN="node .yarn/releases/yarn-4.9.2.cjs"

echo "📦 Installing dependencies..."
$YARN install

echo "🏗️  Building packages..."
# Build Server
echo "   - Building twenty-server..."
$YARN nx build twenty-server

# Build Frontend
echo "   - Building twenty-front..."
export REACT_APP_SERVER_BASE_URL="https://splitmcp.appspot.com"
$YARN nx build twenty-front

# Build Website
# Build Website
# echo "   - Building twenty-website..."
# $YARN nx build twenty-website

# Build Docs
echo "   - Building twenty-docs..."
$YARN nx build twenty-docs

echo "📋 Preparing Metadata for Deployment..."
# Copy metadata to twenty-server so it's uploaded with the service
echo "   - Copying root metadata to packages/twenty-server/metadata..."
cp -R "${PROJECT_ROOT}/metadata" "${PROJECT_ROOT}/packages/twenty-server/metadata"

echo "☁️  Deploying to App Engine..."

# Deploy Server (Default Service)
echo "   - Deploying Server (default service)..."
cd packages/twenty-server
gcloud app deploy app.yaml --quiet
cd ../..

# Deploy Worker
echo "   - Deploying Worker..."
cd packages/twenty-server
gcloud app deploy worker.yaml --quiet
cd ../..

# Deploy Frontend
echo "   - Deploying Frontend..."
cd packages/twenty-front
gcloud app deploy app.yaml --quiet
cd ../..

# Deploy Website
# Deploy Website
# echo "   - Deploying Website..."
# cd packages/twenty-website
# gcloud app deploy app.yaml --quiet
# cd ../..

# Deploy Docs
echo "   - Deploying Docs..."
cd packages/twenty-docs
gcloud app deploy app.yaml --quiet
cd ../..

echo "✅ Deployment Complete!"
echo "   Check your specific URLs in the GCP Console."
