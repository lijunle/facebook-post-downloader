import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("manifest.json", () => {
  const manifestPath = join(__dirname, "..", "manifest.json");
  const manifestContent = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestContent);

  const expectedDomains = [
    "https://www.facebook.com/*",
    "https://facebook.com/*",
    "https://web.facebook.com/*",
    "https://m.facebook.com/*",
  ];

  it("should have manifest_version 3", () => {
    assert.strictEqual(
      manifest.manifest_version,
      3,
      "manifest_version should be 3",
    );
  });

  it("should have host_permissions for Edge compatibility", () => {
    assert.ok(
      Array.isArray(manifest.host_permissions),
      "host_permissions should be an array",
    );
    assert.ok(
      manifest.host_permissions.length > 0,
      "host_permissions should not be empty",
    );

    for (const domain of expectedDomains) {
      assert.ok(
        manifest.host_permissions.includes(domain),
        `host_permissions should include ${domain}`,
      );
    }
  });

  it("should have content_scripts with matches aligned to host_permissions", () => {
    assert.ok(
      Array.isArray(manifest.content_scripts),
      "content_scripts should be an array",
    );
    assert.ok(
      manifest.content_scripts.length > 0,
      "content_scripts should not be empty",
    );

    const contentScriptMatches = manifest.content_scripts[0].matches;
    assert.ok(
      Array.isArray(contentScriptMatches),
      "content_scripts[0].matches should be an array",
    );
    assert.deepStrictEqual(
      [...contentScriptMatches].sort(),
      [...expectedDomains].sort(),
      "content_scripts matches should align with host_permissions",
    );
  });

  it("should have web_accessible_resources with matches aligned to host_permissions", () => {
    assert.ok(
      Array.isArray(manifest.web_accessible_resources),
      "web_accessible_resources should be an array",
    );
    assert.ok(
      manifest.web_accessible_resources.length > 0,
      "web_accessible_resources should not be empty",
    );

    const webResourceMatches = manifest.web_accessible_resources[0].matches;
    assert.ok(
      Array.isArray(webResourceMatches),
      "web_accessible_resources[0].matches should be an array",
    );
    assert.deepStrictEqual(
      [...webResourceMatches].sort(),
      [...expectedDomains].sort(),
      "web_accessible_resources matches should align with host_permissions",
    );
  });

  it("should have required permissions", () => {
    assert.ok(
      Array.isArray(manifest.permissions),
      "permissions should be an array",
    );
    assert.ok(
      manifest.permissions.includes("downloads"),
      "permissions should include 'downloads'",
    );
  });

  it("should have action defined for chrome.action.onClicked", () => {
    assert.ok(manifest.action, "action should be defined");
    assert.ok(
      manifest.action.default_title,
      "action should have default_title",
    );
  });

  it("should have background service worker", () => {
    assert.ok(manifest.background, "background should be defined");
    assert.ok(
      manifest.background.service_worker,
      "background should have service_worker",
    );
  });
});
