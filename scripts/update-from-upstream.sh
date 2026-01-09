#!/bin/bash
# Update Twenty from upstream and rebuild custom image
# Usage: ./scripts/update-from-upstream.sh

set -e

echo "=== Updating Twenty from Upstream ==="

# Ensure we're on the customizations branch
git checkout split-customizations

# Fetch latest from upstream
echo "Fetching latest from upstream..."
git fetch upstream

# Update main from upstream
echo "Updating main branch..."
git checkout main
git pull upstream main

# Rebase our customizations on top
echo "Rebasing customizations..."
git checkout split-customizations
git rebase main

# Push updated branch
echo "Pushing updated branch..."
git push origin split-customizations --force-with-lease

echo ""
echo "=== Update Complete ==="
echo "To deploy the updated image, run:"
echo "  ./scripts/deploy-custom-image.sh"
