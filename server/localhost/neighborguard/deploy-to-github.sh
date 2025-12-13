#!/bin/bash

# NeighborGuard MVP - GitHub Push Script
# This script will push your code to GitHub

echo "🚀 NeighborGuard MVP - GitHub Deployment"
echo "========================================"
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "❌ Git repository not initialized!"
    exit 1
fi

# GitHub repository details
GITHUB_USER="wujunbao1963"
REPO_NAME="neighborguard-mvp"
GITHUB_REPO="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo "📦 Repository: ${GITHUB_REPO}"
echo ""

# Check if remote already exists
if git remote get-url origin > /dev/null 2>&1; then
    echo "✓ Remote 'origin' already configured"
else
    echo "➕ Adding remote 'origin'..."
    git remote add origin "${GITHUB_REPO}"
fi

echo ""
echo "🔄 Pushing to GitHub..."
git push -u origin master

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "Next Steps:"
    echo "1. Go to Railway Dashboard: https://railway.app"
    echo "2. Create backend service from GitHub repo"
    echo "3. Create frontend service from GitHub repo"
    echo "4. Configure environment variables (see RAILWAY_QUICK_CONFIG.md)"
    echo ""
    echo "📖 Full deployment guide: RAILWAY_DEPLOYMENT.md"
else
    echo ""
    echo "❌ Push failed. Please check your GitHub credentials and try again."
    echo ""
    echo "You may need to:"
    echo "1. Create the repository on GitHub first: https://github.com/new"
    echo "2. Set up authentication (SSH key or Personal Access Token)"
    echo ""
fi
