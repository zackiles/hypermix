#!/usr/bin/env node

/**
 * Test script for npm package functionality
 * Run with: node scripts/test-npm-package.js
 */

const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

console.log("Testing npm package locally...\n");

// Test 1: Check if package.json is valid
console.log("1. Validating package.json...");
try {
  const packageJson = require("../package.json");
  console.log(`   ✓ Package name: ${packageJson.name}`);
  console.log(`   ✓ Version: ${packageJson.version}`);
  console.log(`   ✓ Bin entry: ${Object.keys(packageJson.bin).join(", ")}`);
} catch (error) {
  console.error("   ✗ Failed to load package.json:", error.message);
  process.exit(1);
}

// Test 2: Check if launcher script exists
console.log("\n2. Checking launcher script...");
const launcherPath = path.join(__dirname, "launcher.js");
if (fs.existsSync(launcherPath)) {
  console.log(`   ✓ Launcher exists at: ${launcherPath}`);
} else {
  console.error("   ✗ Launcher script not found!");
  process.exit(1);
}

// Test 3: Check if postinstall script exists
console.log("\n3. Checking postinstall script...");
const postinstallPath = path.join(__dirname, "postinstall.js");
if (fs.existsSync(postinstallPath)) {
  console.log(`   ✓ Postinstall exists at: ${postinstallPath}`);
} else {
  console.error("   ✗ Postinstall script not found!");
  process.exit(1);
}

// Test 4: Test npm pack (dry run)
console.log("\n4. Testing npm pack...");
try {
  const packOutput = execSync("npm pack --dry-run", { encoding: "utf8" });
  const lines = packOutput.split("\n").filter((line) => line.trim());
  console.log(`   ✓ Package would include ${lines.length} files`);
  console.log("   Files preview:");
  // biome-ignore lint/complexity/noForEach: <explanation>
  lines.slice(0, 10).forEach((line) => console.log(`     - ${line}`));
  if (lines.length > 10) {
    console.log(`     ... and ${lines.length - 10} more files`);
  }
} catch (error) {
  console.error("   ✗ Failed to run npm pack:", error.message);
}

// Test 5: Check if binaries exist (if already built)
console.log("\n5. Checking for pre-built binaries...");
const binDir = path.join(__dirname, "..", "bin");
if (fs.existsSync(binDir)) {
  const files = fs.readdirSync(binDir).filter((f) => f !== ".gitkeep");
  if (files.length > 0) {
    console.log(`   ✓ Found ${files.length} binaries in bin/`);
    // biome-ignore lint/complexity/noForEach: <explanation>
    files.slice(0, 5).forEach((file) => console.log(`     - ${file}`));
    if (files.length > 5) {
      console.log(`     ... and ${files.length - 5} more files`);
    }
  } else {
    console.log("   ℹ No binaries found (will be downloaded on install)");
  }
} else {
  console.log("   ℹ Bin directory not found (will be created on install)");
}

console.log("\n✅ All checks passed! The npm package structure looks good.");
console.log("\nTo test the full installation flow:");
console.log("1. Build binaries: deno task build");
console.log("2. Create a GitHub release with the binaries");
console.log("3. Test local install: npm install -g .");
console.log("4. Or test with npx: npx .");
