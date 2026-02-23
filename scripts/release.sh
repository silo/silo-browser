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

# Get commits since last tag for reference
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log "$LAST_TAG"..HEAD --pretty=format:"- %s" --)
  COMMIT_HEADER="# Commits since $LAST_TAG:"
else
  COMMITS=$(git log --pretty=format:"- %s" --)
  COMMIT_HEADER="# All commits:"
fi

TMPFILE=$(mktemp)
cat > "$TMPFILE" <<EOF
# Write release notes below. Save and close the editor to continue.
# Lines starting with # will be ignored.
#
$COMMIT_HEADER
$(echo "$COMMITS" | sed 's/^/# /')
#
# Edit the lines below:

$COMMITS
EOF
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

# Bump version
pnpm pkg set version="$VERSION"

# Commit and tag with release notes
git add package.json
git commit -m "v$VERSION"
git tag -a "v$VERSION" -m "$NOTES"
git push && git push --tags

echo ""
echo "Released v$VERSION — GitHub Actions will now build and publish the release."
exit 0
