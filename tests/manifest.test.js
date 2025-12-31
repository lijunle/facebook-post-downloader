import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("manifest.json should have required fields for Edge compatibility", () => {
  const manifestPath = join(__dirname, "..", "manifest.json");
  const manifestContent = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestContent);

  // Check manifest_version
  assert.strictEqual(
    manifest.manifest_version,
    3,
    "manifest_version should be 3",
  );

  // Check host_permissions is present (required for Edge)
  assert.ok(
    Array.isArray(manifest.host_permissions),
    "host_permissions should be an array",
  );
  assert.ok(
    manifest.host_permissions.length > 0,
    "host_permissions should not be empty",
  );

  // Check that host_permissions includes Facebook domains
  const expectedDomains = [
    "https://www.facebook.com/*",
    "https://facebook.com/*",
    "https://web.facebook.com/*",
    "https://m.facebook.com/*",
  ];

  for (const domain of expectedDomains) {
    assert.ok(
      manifest.host_permissions.includes(domain),
      `host_permissions should include ${domain}`,
    );
  }

  // Check content_scripts matches align with host_permissions
  assert.ok(
    Array.isArray(manifest.content_scripts),
    "content_scripts should be an array",
  );
  assert.ok(
    manifest.content_scripts.length > 0,
    "content_scripts should not be empty",
  );

  const contentScriptMatches = manifest.content_scripts[0].matches;
  assert.deepStrictEqual(
    contentScriptMatches.sort(),
    expectedDomains.sort(),
    "content_scripts matches should align with host_permissions",
  );

  // Check web_accessible_resources matches align with host_permissions
  assert.ok(
    Array.isArray(manifest.web_accessible_resources),
    "web_accessible_resources should be an array",
  );
  const webResourceMatches = manifest.web_accessible_resources[0].matches;
  assert.deepStrictEqual(
    webResourceMatches.sort(),
    expectedDomains.sort(),
    "web_accessible_resources matches should align with host_permissions",
  );

  // Check required permissions
  assert.ok(
    Array.isArray(manifest.permissions),
    "permissions should be an array",
  );
  assert.ok(
    manifest.permissions.includes("downloads"),
    "permissions should include 'downloads'",
  );

  // Check action is defined (required for chrome.action.onClicked)
  assert.ok(manifest.action, "action should be defined");
  assert.ok(manifest.action.default_title, "action should have default_title");

  // Check background service worker
  assert.ok(manifest.background, "background should be defined");
  assert.ok(
    manifest.background.service_worker,
    "background should have service_worker",
  );
});
