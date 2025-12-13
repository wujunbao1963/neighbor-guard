#!/bin/bash

# NeighborGuard MVP - Complete GitHub Setup Script
# This script will initialize git, commit, and push to GitHub

echo "🚀 NeighborGuard MVP - Complete GitHub Setup"
echo "=============================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install git first."
    exit 1
fi

# Initialize git if needed
if [ ! -d .git ]; then
    echo "📦 Initializing Git repository..."
    git init
    
    echo "👤 Configuring Git user..."
    git config user.name "wujunbao1963"
    git config user.email "wujunbao1963@users.noreply.github.com"
    
    echo "📝 Creating initial commit..."
    git add -A
    git commit -m "Initial commit: NeighborGuard MVP with Railway deployment configuration"
else
    echo "✓ Git repository already initialized"
fi

# GitHub repository details
GITHUB_USER="wujunbao1963"
REPO_NAME="neighborguard-mvp"
GITHUB_REPO="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo ""
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
    echo "🎉 Your code is now on GitHub at:"
    echo "   ${GITHUB_REPO}"
    echo ""
    echo "Next Steps:"
    echo "1. Go to Railway Dashboard: https://railway.app"
    echo "2. Create backend service from GitHub repo"
    echo "3. Create frontend service from GitHub repo"
    echo "4. Configure environment variables (see RAILWAY_QUICK_CONFIG.md)"
    echo ""
    echo "📖 Full deployment guide: DEPLOY_GUIDE.md"
else
    echo ""
    echo "❌ Push failed. Please check your GitHub credentials."
    echo ""
    echo "Common solutions:"
    echo "1. Make sure the repository exists on GitHub: https://github.com/new"
    echo "2. Use Personal Access Token instead of password"
    echo "3. Or set up SSH key: https://docs.github.com/en/authentication"
    echo ""
    echo "To create Personal Access Token:"
    echo "- Go to: https://github.com/settings/tokens"
    echo "- Click 'Generate new token (classic)'"
    echo "- Select scopes: 'repo' (all)"
    echo "- Use the token as your password when prompted"
    echo ""
fi
