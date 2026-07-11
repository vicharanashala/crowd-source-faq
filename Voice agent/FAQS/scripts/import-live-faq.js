const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const URL = "https://samagama.in/internship/faq";

const outputPath = path.join(__dirname, "..", "data", "faq.txt");

(async () => {
  try {
    console.log("Downloading FAQ...");

    const { data } = await axios.get(URL);

    const $ = cheerio.load(data);

    let lines = [];

    $("details").each((i, el) => {
      const question = $(el).find("summary").text().trim();

      const answer = $(el)
        .find("p")
        .map((_, p) => $(p).text().trim())
        .get()
        .join("\n");

      if (question && answer) {
        lines.push(question);
        lines.push(answer);
        lines.push("");
      }
    });

    fs.writeFileSync(outputPath, lines.join("\n"));

    console.log("Saved FAQ to faq.txt");
  } catch (err) {
    console.error(err);
  }
})();