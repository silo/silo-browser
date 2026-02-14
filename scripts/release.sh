#!/bin/bash
set -e

# Get current version from package.json
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

echo "Current version: $CURRENT"
echo ""
echo "Bump type:"
echo "  1) patch  → $MAJOR.$MINOR.$((PATCH + 1))"
echo "  2) minor  → $MAJOR.$((MINOR + 1)).0"
echo "  3) major  → $((MAJOR + 1)).0.0"
echo ""
read -rp "Choose [1/2/3]: " CHOICE

case $CHOICE in
  1) VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
  2) VERSION="$MAJOR.$((MINOR + 1)).0" ;;
  3) VERSION="$((MAJOR + 1)).0.0" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

echo ""
echo "New version: $VERSION"
echo ""
TMPFILE=$(mktemp)
echo "# Write release notes below. Save and close the editor to continue." > "$TMPFILE"
${EDITOR:-nano} "$TMPFILE"
NOTES=$(grep -v '^#' "$TMPFILE" | sed -e '/^$/d' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
rm -f "$TMPFILE"

if [ -z "$NOTES" ]; then
  echo "No release notes provided. Aborted."
  exit 1
fi

echo ""
echo "--- Release Summary ---"
echo "Version: v$VERSION"
echo "Notes:"
echo "$NOTES"
echo "-----------------------"
echo ""
read -rp "Confirm release? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Bump version first
pnpm pkg set version="$VERSION"

# Build with the new version
echo ""
echo "=== Building v$VERSION for all platforms ==="
echo ""

echo "Running typecheck and build..."
pnpm build
echo ""

echo "Packaging macOS..."
pnpm exec electron-builder --mac --publish never
echo ""

echo "Packaging Windows..."
pnpm exec electron-builder --win --publish never
echo ""

echo "Packaging Linux..."
pnpm exec electron-builder --linux --publish never
echo ""

echo "=== All builds succeeded ==="
echo ""

# Commit and tag with release notes
git add -A
git commit -m "v$VERSION"
git tag -a "v$VERSION" -m "$NOTES"
git push && git push --tags

echo ""
echo "Released v$VERSION — GitHub Actions will now build and publish the release."
exit 0
