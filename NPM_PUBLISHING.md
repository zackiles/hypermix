# NPM Publishing Guide for Hypermix

This guide explains how Hypermix is automatically published to npm when you create a release.

## Overview

The npm package is a lightweight wrapper (5KB) that downloads platform-specific binaries during installation. Everything is automated via GitHub Actions.

## Automated Workflow

### 1. Push a Tag

```bash
# Update version in package.json first
npm version patch  # or minor/major

# Push the tag
git push origin main --tags
```

### 2. GitHub Actions Takes Over

When you push a tag like `v0.0.1`, GitHub Actions automatically:

1. **Builds binaries** for all platforms (release.yml)
2. **Creates a GitHub release** with the binaries attached
3. **Publishes to npm** (publish-npm.yml) after the release is created

### 3. Users Can Install

```bash
npx hypermix       # One-time use
npm install -g hypermix  # Global install
```

## Setup Requirements

### NPM Token

Add your npm token to GitHub Secrets:

1. Get token from npm: `npm token create`
2. Add to GitHub: Settings → Secrets → Actions → New repository secret
3. Name: `NPM_TOKEN`

## Local Development

If you want to test building locally:

```bash
# Build binaries locally for testing
deno task build

# Test the npm package structure
npm test
```

## How It Works

1. **User runs** `npx hypermix`
2. **npm downloads** the 5KB wrapper package
3. **postinstall.js** downloads the correct binary from GitHub releases
4. **launcher.js** executes the binary

## Troubleshooting

### Binary not found

Check that:

- GitHub release exists with tag matching package.json version
- All platform binaries are uploaded to the release
- Binary names match: `hypermix-{platform}{.exe}`

### npm publish fails

Ensure:

- NPM_TOKEN secret is set in GitHub
- package.json version matches the git tag
- You have publish permissions on npm

## Platform Support

Currently supported platforms:

- Linux x64 (`x86_64-unknown-linux-gnu`)
- Linux ARM64 (`aarch64-unknown-linux-gnu`)
- macOS x64 (`x86_64-apple-darwin`)
- macOS ARM64 (`aarch64-apple-darwin`)
- Windows x64 (`x86_64-pc-windows-msvc`)
