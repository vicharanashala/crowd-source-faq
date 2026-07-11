// Converts src/faq-data.js (window.FAQ_DATA = [...]) into data/faq-seed.json,
// which is the file server.js actually reads at runtime.
//
// Run this after `npm run builddata` has refreshed src/faq-data.js from the
// live site, to pull those changes into the local seed the app serves.

const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "src", "faq-data.js");
const outputPath = path.join(__dirname, "..", "data", "faq-seed.json");

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing ${sourcePath}. Run "npm run builddata" first.`);
  process.exit(1);
}

const content = fs.readFileSync(sourcePath, "utf8");
const jsonStr = content
  .replace(/^window\.FAQ_DATA\s*=\s*/, "")
  .replace(/;\s*$/, "");

let data;
try {
  data = JSON.parse(jsonStr);
} catch (err) {
  console.error("Could not parse src/faq-data.js as JSON:", err.message);
  process.exit(1);
}

if (!Array.isArray(data) || !data.length) {
  console.error("src/faq-data.js parsed to an empty or invalid array.");
  process.exit(1);
}

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`Wrote ${data.length} FAQ entries to ${outputPath}`);
