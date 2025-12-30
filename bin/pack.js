#!/usr/bin/env node

/**
 * Pack browser extension files into a zip archive
 *
 * Usage: node bin/pack.mjs
 *
 * Creates a zip file containing the browser extension files in the dist/ directory.
 */

import archiver from "archiver";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root directory of the project
const rootDir = path.resolve(__dirname, "..");

// Output directory for the zip file
const distDir = path.join(rootDir, "dist");

// File paths
const packageJsonPath = path.join(rootDir, "package.json");
const manifestJsonPath = path.join(rootDir, "manifest.json");

/**
 * Extract files to include from manifest.json
 * @returns {string[]} Array of file paths to include
 */
function getFilesToInclude() {
  const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8"));
  const files = new Set(["README.md", "manifest.json"]);

  // Add icons
  if (manifest.icons) {
    Object.values(manifest.icons).forEach((icon) => files.add(icon));
  }

  // Add action icons
  if (manifest.action?.default_icon) {
    Object.values(manifest.action.default_icon).forEach((icon) =>
      files.add(icon),
    );
  }

  // Add background service worker
  if (manifest.background?.service_worker) {
    files.add(manifest.background.service_worker);
  }

  // Add web accessible resources
  if (manifest.web_accessible_resources) {
    for (const entry of manifest.web_accessible_resources) {
      if (entry.resources) {
        entry.resources.forEach((/** @type {string} */ resource) =>
          files.add(resource),
        );
      }
    }
  }

  // Add content scripts
  if (manifest.content_scripts) {
    for (const entry of manifest.content_scripts) {
      if (entry.js) {
        entry.js.forEach((/** @type {string} */ script) => files.add(script));
      }
    }
  }

  return [...files];
}

/**
 * Determine the version to use for the extension.
 * Priority:
 * 1. If the current commit has a tag like "v1.2.3", use "1.2.3"
 * 2. If running in GitHub Actions without a version tag, use "0.0.<run_number>"
 * 3. Otherwise, use "0.0.0"
 * @returns {string} The version string
 */
function getVersion() {
  // Try to get version from git tag
  try {
    const tag = execSync("git describe --tags --exact-match HEAD 2>/dev/null", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Check if tag matches version pattern (v1.2.3)
    const versionMatch = tag.match(/^v(\d+\.\d+\.\d+)$/);
    if (versionMatch) {
      return versionMatch[1];
    }
  } catch {
    // No exact tag match, continue to next option
  }

  // Check if running in GitHub Actions
  if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_RUN_NUMBER) {
    return `0.0.${process.env.GITHUB_RUN_NUMBER}`;
  }

  // Default version
  return "0.0.0";
}

/**
 * Update version in package.json and manifest.json
 * @param {string} version The version to set
 */
function updateVersion(version) {
  console.log(`Setting version to: ${version}`);
  console.log("");

  // Update manifest.json
  const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8"));
  manifestJson.version = version;
  fs.writeFileSync(
    manifestJsonPath,
    JSON.stringify(manifestJson, null, 4) + "\n",
    "utf8",
  );
  console.log(`  ✓ Updated manifest.json`);
  console.log("");
}

/**
 * Main function to pack the extension
 */
async function pack() {
  console.log("Packing browser extension...");
  console.log("");

  // Determine and update version
  const version = getVersion();
  updateVersion(version);

  // Read package name for output file
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const outputFileName = `${packageJson.name}-${version}.zip`;
  const outputPath = path.join(distDir, outputFileName);

  // Create dist directory if it doesn't exist
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(`Created output directory: ${distDir}`);
  }

  // Remove existing zip file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing zip: ${outputFileName}`);
  }

  console.log("Creating zip file...");

  // Create a file stream for the output
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Maximum compression
  });

  // Create a promise to wait for the archive to finish
  const archivePromise = new Promise((resolve, reject) => {
    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add files to the archive
  const filesToInclude = getFilesToInclude();
  for (const file of filesToInclude) {
    console.log(`  Adding: ${file}`);
    archive.file(path.join(rootDir, file), { name: file });
  }

  // Finalize the archive
  await archive.finalize();

  // Wait for the archive to finish writing
  await archivePromise;

  // Verify the zip file was created
  if (!fs.existsSync(outputPath)) {
    console.error("Error: Zip file was not created");
    process.exit(1);
  }

  const stats = fs.statSync(outputPath);
  const sizeKB = (stats.size / 1024).toFixed(2);

  console.log("");
  console.log("Pack completed successfully!");
  console.log(`Output: ${outputPath}`);
  console.log(`Size: ${sizeKB} KB`);
}

// Run the pack function
pack().catch((error) => {
  console.error(`Error creating zip file: ${error.message}`);
  process.exit(1);
});
