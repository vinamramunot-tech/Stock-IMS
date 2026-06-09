#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Read the current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo "========================================="
echo "   Jewellery Stock Release Automation    "
echo "========================================="
echo "Current version in package.json: $CURRENT_VERSION"
echo ""

# Suggest some bump options
PATCH_SUGGESTION=$(node -p "const semver = '$CURRENT_VERSION'.split('.'); semver[2] = parseInt(semver[2]) + 1; semver.join('.')")
MINOR_SUGGESTION=$(node -p "const semver = '$CURRENT_VERSION'.split('.'); semver[1] = parseInt(semver[1]) + 1; semver[2] = 0; semver.join('.')")
MAJOR_SUGGESTION=$(node -p "const semver = '$CURRENT_VERSION'.split('.'); semver[0] = parseInt(semver[0]) + 1; semver[1] = 0; semver[2] = 0; semver.join('.')")

echo "Suggestions:"
echo "1) Patch: $PATCH_SUGGESTION"
echo "2) Minor: $MINOR_SUGGESTION"
echo "3) Major: $MAJOR_SUGGESTION"
echo "4) Enter custom version manually"
echo ""

read -p "Select option (1-4) or press Enter for Patch ($PATCH_SUGGESTION): " OPTION

NEW_VERSION=""
case $OPTION in
  1|"")
    NEW_VERSION=$PATCH_SUGGESTION
    ;;
  2)
    NEW_VERSION=$MINOR_SUGGESTION
    ;;
  3)
    NEW_VERSION=$MAJOR_SUGGESTION
    ;;
  4)
    read -p "Enter custom version (e.g. 4.2.0): " NEW_VERSION
    if [ -z "$NEW_VERSION" ]; then
      echo "Error: Version cannot be empty."
      exit 1
    fi
    ;;
  *)
    echo "Invalid option. Exiting."
    exit 1
    ;;
esac

echo ""
echo "Upgrading version to: $NEW_VERSION"
echo "Running: npm version $NEW_VERSION"
npm version "$NEW_VERSION"

# Get current branch name
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)

echo ""
echo "Pushing changes and tags to remote ($CURRENT_BRANCH)..."
git push origin "$CURRENT_BRANCH" --follow-tags

echo ""
echo "Success! GitHub Actions will now build version v$NEW_VERSION."
echo "========================================="
