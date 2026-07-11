const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "data", "faq.txt");
const trainingPath = path.join(__dirname, "..", "data", "training.json");
const outputPath = path.join(__dirname, "..", "src", "faq-data.js");

if (!fs.existsSync(sourcePath)) {
  console.error("Missing data/faq.txt. Add your FAQ text there, then run npm run build:data");
  process.exit(1);
}

const raw = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
const questionPattern = /^(\d+\.\d+)\s+(.+?)\s*(?:§)?$/;
const sectionPattern = /^\d+\.\s+.+/;
const titleIndex = lines.findIndex((line) => line.includes("Vicharanashala Internship"));
const startIndex = titleIndex >= 0
  ? titleIndex
  : lines.findIndex((line) => line.includes("1. About the internship"));
const contentLines = startIndex >= 0 ? lines.slice(startIndex) : lines;
const training = fs.existsSync(trainingPath)
  ? JSON.parse(fs.readFileSync(trainingPath, "utf8"))
  : {};
const faqs = [];
let currentSection = "General";

for (let index = 0; index < contentLines.length; index += 1) {
  if (sectionPattern.test(contentLines[index])) {
    currentSection = contentLines[index].replace(/\s*§$/, "");
    continue;
  }

  const match = contentLines[index].match(questionPattern);
  if (!match) continue;

  const [, id, question] = match;
  const answer = [];

  for (let next = index + 1; next < contentLines.length; next += 1) {
    const line = contentLines[next];
    if (questionPattern.test(line) || sectionPattern.test(line)) break;
    answer.push(line.replace(/\s*§$/, ""));
  }

  if (answer.length) {
    const trained = training[id] || {};
    faqs.push({
      id,
      question: question.replace(/\s*§$/, ""),
      section: currentSection,
      answer: answer.join(" "),
      aliases: Array.isArray(trained.aliases) ? trained.aliases : [],
      voiceAnswer: trained.voiceAnswer || ""
    });
  }
}

const output = `window.FAQ_DATA = ${JSON.stringify(faqs, null, 2)};\n`;
fs.writeFileSync(outputPath, output);
console.log(`Built ${faqs.length} FAQ answers at ${outputPath}`);
