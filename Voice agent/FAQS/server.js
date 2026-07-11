const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3100;
const PUBLIC_DIR = path.join(__dirname, "src");
// The voice agent now reads FAQ content from the local seed file that ships
// with this repo, instead of scraping an external, already-deployed site.
// This keeps the feature demo-able offline and lets mentors run it without
// any database or live network access.
const SEED_PATH = path.join(__dirname, "data", "faq-seed.json");
const FAQ_SOURCE = "local-seed:data/faq-seed.json";

let faqCache = {
  data: null,
  fetchedAt: 0
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const loadFaqs = async () => {
  if (faqCache.data) {
    return faqCache.data;
  }

  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`Seed file not found at ${SEED_PATH}. Run "npm run builddata" or restore data/faq-seed.json.`);
  }

  const raw = fs.readFileSync(SEED_PATH, "utf8");
  const faqs = JSON.parse(raw);
  if (!Array.isArray(faqs) || !faqs.length) {
    throw new Error("data/faq-seed.json is empty or malformed");
  }

  faqCache = {
    data: faqs,
    fetchedAt: Date.now()
  };
  return faqs;
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
};

const server = http.createServer(async (req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];

  if (urlPath === "/api/faqs") {
    try {
      const faqs = await loadFaqs();
      return sendJson(res, 200, {
        source: FAQ_SOURCE,
        fetchedAt: new Date(faqCache.fetchedAt).toISOString(),
        faqs
      });
    } catch (error) {
      return sendJson(res, 502, {
        error: "Could not load the local FAQ seed",
        message: error.message
      });
    }
  }

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "127.0.0.1" ? "localhost" : HOST;
  console.log(`Voice agent running at http://${displayHost}:${PORT}`);
});
