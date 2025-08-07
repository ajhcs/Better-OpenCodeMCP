#!/bin/bash
# Script to automatically deploy wiki content from docs/ directory to GitHub

set -e

echo "🚀 Deploying Wiki to GitHub..."

# Check if gh is installed
if ! command -v gh &>/dev/null; then
    echo "❌ GitHub CLI (gh) is required but not installed."
    echo "Install with: brew install gh"
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "docs" ]; then
    echo "❌ docs/ directory not found. Are you in the right directory?"
    exit 1
fi

# Function to convert filename to wiki page name
convert_filename() {
    local filepath="$1"
    name=$(echo "$filepath" | sed 's|^\.\./docs/||')

    # Handle special cases
    case "$name" in
    "index.md") echo "Home.md" ;;
    "getting-started.md") echo "Getting-Started.md" ;;
    "api.md") echo "API.md" ;;
    *)
        # Convert directory/file to Directory-File format
        echo "$name" | sed 's|/|-|g' | sed 's/\b\w/\u&/g'
        ;;
    esac
}

# Clone the wiki repository
echo "📥 Cloning wiki repository..."
rm -rf .wiki-temp
git clone https://github.com/frap129/opencode-mcp-tool.wiki.git .wiki-temp 2>/dev/null || {
    echo "⚠️  Wiki doesn't exist yet. Creating it through GitHub..."
    # Create initial wiki page through API
    gh api repos/frap129/opencode-mcp-tool/wiki/pages \
        --method POST \
        -f title="Home" \
        -f body="Initializing wiki..." || true

    # Try cloning again
    git clone https://github.com/frap129/opencode-mcp-tool.wiki.git .wiki-temp
}

cd .wiki-temp

echo "📄 Creating wiki pages from docs/ directory..."

# Discover and copy all markdown files
find ../docs -name "*.md" -type f | while read -r filepath; do
    wiki_file=$(convert_filename "$filepath")
    echo "  Converting $filepath → $wiki_file"
    cp "$filepath" "$wiki_file"
done

# Generate dynamic sidebar based on discovered files
echo "📋 Generating navigation sidebar..."
cat >_Sidebar.md <<'EOF'
## 🏠 Navigation

**Getting Started**
* [[Home]]
* [[Getting Started|Getting-Started]]
* [[Installation]]
* [[First Steps|First-Steps]]

**Core Concepts**
* [[How It Works|Concepts-How-It-Works]]
* [[File Analysis|Concepts-File-Analysis]]
* [[Models|Concepts-Models]]
* [[Plan Mode|Concepts-Plan-Mode]]

**Usage Guide**
* [[Commands|Usage-Commands]]
* [[Natural Language|Usage-Natural-Language]]
* [[Examples|Usage-Examples]]
* [[Best Practices|Usage-Best-Practices]]

**Reference**
* [[API]]
* [[Troubleshooting|Resources-Troubleshooting]]

---

**Quick Links**
* [📦 NPM Package](https://www.npmjs.com/package/opencode-mcp-tool)
* [🐙 GitHub Repo](https://github.com/frap129/opencode-mcp-tool)
* [📋 Report Issue](https://github.com/frap129/opencode-mcp-tool/issues/new)
EOF

# Create footer
cat >_Footer.md <<'EOF'
---
📄 [MIT License](https://github.com/frap129/opencode-mcp-tool/blob/main/LICENSE) | 
🔧 [Contribute](https://github.com/frap129/opencode-mcp-tool/blob/main/CONTRIBUTING.md) | 
📦 [NPM](https://www.npmjs.com/package/opencode-mcp-tool) |
⭐ [Star on GitHub](https://github.com/frap129/opencode-mcp-tool)
EOF

# Commit and push
echo "💾 Committing changes..."
git add -A
git commit -m "📚 Deploy documentation from docs/ directory

- Converted all markdown files from docs/ folder
- Generated dynamic navigation based on file structure
- Clean markdown files ready for GitHub Wiki" || echo "No changes to commit"

echo "📤 Pushing to GitHub..."
git push origin master || git push origin main

cd ..
rm -rf .wiki-temp

echo "✅ Wiki deployed successfully!"
echo "🔗 View at: https://github.com/frap129/opencode-mcp-tool/wiki"
echo ""
echo "📝 Note: It may take a few seconds for changes to appear on GitHub."
