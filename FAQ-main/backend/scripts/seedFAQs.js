/**
 * seedFAQs.js
 * Run: node backend/scripts/seedFAQs.js
 *
 * Reads backend/data/faqs.csv → parses every row → inserts into MongoDB FAQ collection.
 * Safe to run multiple times (skips already-existing questions).
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// ─── Category map by section number ──────────────────────────────────────────
// Section 1 = Programme Overview, 2 = Timeline, 3 = NOC, 4 = Selection,
// 5 = Work, 6 = Communication, 7 = Technical, 8 = Certificate,
// 9 = Rosetta Journal, 10 = Rules & Conduct
const SECTION_CATEGORY = {
  "1": "Programme",
  "2": "Timeline",
  "3": "NOC & Documents",
  "4": "Selection",
  "5": "Work & Mentorship",
  "6": "Communication",
  "7": "Technical",
  "8": "Certificate",
  "9": "Rosetta",
  "10": "Rules",
};

// ─── Tags derived from section ────────────────────────────────────────────────
const SECTION_TAGS = {
  "1":  ["VINS", "internship", "overview"],
  "2":  ["timeline", "dates", "schedule"],
  "3":  ["NOC", "documents", "college"],
  "4":  ["selection", "offer letter", "dashboard"],
  "5":  ["work", "mentor", "project"],
  "6":  ["communication", "channels", "samagama"],
  "7":  ["technical", "interview", "platform"],
  "8":  ["certificate", "completion"],
  "9":  ["rosetta", "journal"],
  "10": ["rules", "attendance", "conduct"],
};

function getCategoryAndTags(question) {
  // Extract section number from question prefix e.g. "3.10 ..." → "3"
  const match = question.match(/^(\d+)\./);
  if (match) {
    const section = match[1];
    return {
      category: SECTION_CATEGORY[section] || "General",
      tags: SECTION_TAGS[section] || ["general"],
    };
  }
  return { category: "General", tags: ["general"] };
}

// ─── Simple CSV parser (handles quoted fields with commas/newlines) ────────────
function parseCSV(content) {
  const rows = [];
  let i = 0;
  const n = content.length;

  // Skip header line
  while (i < n && content[i] !== "\n") i++;
  i++; // skip newline

  while (i < n) {
    const fields = [];
    while (i < n) {
      if (content[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = "";
        while (i < n) {
          if (content[i] === '"' && content[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (content[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            field += content[i++];
          }
        }
        fields.push(field.trim());
      } else {
        // Unquoted field — read until comma or newline
        let field = "";
        while (i < n && content[i] !== "," && content[i] !== "\n" && content[i] !== "\r") {
          field += content[i++];
        }
        fields.push(field.trim());
      }

      if (i < n && content[i] === ",") {
        i++; // skip comma, read next field
      } else {
        break; // end of row
      }
    }
    // Skip \r\n or \n
    while (i < n && (content[i] === "\n" || content[i] === "\r")) i++;

    if (fields.length >= 2 && fields[0]) {
      rows.push({ question: fields[0], answer: fields[1] });
    }
  }

  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected.");

  // Load FAQ model
  const FAQ = require("../models/FAQ");

  // Read CSV
  const csvPath = path.join(__dirname, "../data/faqs.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  console.log(`📄 Parsed ${rows.length} FAQs from CSV.`);

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const { question, answer } = row;
    if (!question || !answer) { skipped++; continue; }

    // Check if already exists (idempotent)
    const existing = await FAQ.findOne({ question: { $regex: `^${question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" } });
    if (existing) { skipped++; continue; }

    const { category, tags } = getCategoryAndTags(question);

    await FAQ.create({
      question,
      answer,
      category,
      tags,
      source: "Vicharanashala FAQ",
    });
    inserted++;
    process.stdout.write(`\r  ✍  Inserted ${inserted}…`);
  }

  console.log(`\n\n✅ Done! Inserted: ${inserted} | Skipped (already existed): ${skipped}`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
