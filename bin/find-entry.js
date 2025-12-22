#!/usr/bin/env node

/**
 * Find NDJSON entry containing a story with a specific keyword in a HAR file.
 * 
 * Usage: node bin/find-entry.js <har-file> <keyword>
 * 
 * Output: temp/{post_id}.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Decode HAR response content (handles base64 encoding)
 * @param {{ text?: string, encoding?: string } | undefined} content
 * @returns {string}
 */
function decodeContent(content) {
    if (!content || !content.text) return '';
    if (content.encoding === 'base64') {
        try {
            return Buffer.from(content.text, 'base64').toString('utf8');
        } catch {
            return '';
        }
    }
    return content.text;
}

/**
 * Convert a string to Facebook's JSON unicode escape format.
 * Facebook encodes non-ASCII characters as \uXXXX in their JSON responses.
 * This function converts a search string to match that format.
 * 
 * For example: "這不是王吧" becomes "\\u9019\\u4e0d\\u662f\\u738b\\u5427"
 * 
 * @param {string} str - The string to convert
 * @returns {string} - The escaped string for searching in Facebook JSON
 */
function toFacebookJsonEscape(str) {
    let result = '';
    for (const char of str) {
        const code = char.charCodeAt(0);
        // Only escape non-ASCII characters (code > 127)
        if (code > 127) {
            // Handle surrogate pairs for characters outside BMP
            if (code >= 0xD800 && code <= 0xDBFF) {
                // High surrogate - just add it as escape
                result += '\\u' + code.toString(16).padStart(4, '0');
            } else if (code >= 0xDC00 && code <= 0xDFFF) {
                // Low surrogate - just add it as escape
                result += '\\u' + code.toString(16).padStart(4, '0');
            } else {
                result += '\\u' + code.toString(16).padStart(4, '0');
            }
        } else {
            result += char;
        }
    }
    return result;
}

/**
 * Recursively find post_id in an object
 * @param {unknown} obj
 * @returns {string | undefined}
 */
function findPostId(obj) {
    if (!obj || typeof obj !== 'object') return undefined;

    const o = /** @type {Record<string, unknown>} */ (obj);

    // Check if this object has post_id
    if (typeof o.post_id === 'string' && o.post_id) {
        return o.post_id;
    }

    // Recurse into arrays and objects
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findPostId(item);
            if (result) return result;
        }
    } else {
        for (const key of Object.keys(o)) {
            const result = findPostId(o[key]);
            if (result) return result;
        }
    }

    return undefined;
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node bin/find-entry.js <har-file> <keyword>');
    console.error('');
    console.error('Example: node bin/find-entry.js temp/www.facebook.com.har "hajimetechallenge"');
    process.exit(1);
}

const harPath = args[0];
const keyword = args[1];

// Create escaped version for CJK/non-ASCII character search
const escapedKeyword = toFacebookJsonEscape(keyword);
const hasNonAscii = keyword !== escapedKeyword;

console.log(`Searching for "${keyword}" in ${harPath}...`);
if (hasNonAscii) {
    console.log(`Also searching for escaped form: ${escapedKeyword}`);
}

// Read and parse HAR file
const har = JSON.parse(readFileSync(harPath, 'utf8'));

// Search through all entries
for (const entry of har.log.entries) {
    const req = entry.request;

    // Only look at GraphQL POST requests
    if (!req || req.method !== 'POST') continue;
    if (!req.url || !req.url.includes('/api/graphql')) continue;

    // Extract API name from request
    const postDataText = req.postData?.text || '';
    const params = new URLSearchParams(postDataText);
    const apiName = params.get('fb_api_req_friendly_name') || 'unknown';

    const responseText = decodeContent(entry.response?.content);
    if (!responseText) continue;

    // Check if the response contains the keyword (original or escaped)
    const containsKeyword = responseText.includes(keyword) ||
        (hasNonAscii && responseText.includes(escapedKeyword));
    if (!containsKeyword) continue;

    // Parse NDJSON lines
    const lines = responseText.split('\n').filter(l => l.trim().startsWith('{'));

    for (const line of lines) {
        // Check for keyword in line (original or escaped)
        const lineContainsKeyword = line.includes(keyword) ||
            (hasNonAscii && line.includes(escapedKeyword));
        if (!lineContainsKeyword) continue;

        try {
            const parsed = JSON.parse(line);

            // Find the post_id in this entry
            const postId = findPostId(parsed);
            if (!postId) {
                console.log('Found entry with keyword but no post_id');
                continue;
            }

            // Ensure temp directory exists
            const tempDir = join(__dirname, '..', 'temp');
            mkdirSync(tempDir, { recursive: true });

            // Write output
            const outputPath = join(tempDir, `${postId}.json`);
            writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
            console.log(`API: ${apiName}`);
            console.log(`Written to ${outputPath}`);
            process.exit(0);
        } catch {
            // Skip lines that fail to parse
        }
    }
}

console.error(`No entry found containing "${keyword}"`);
process.exit(1);
