import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { connectDB } from "../config/db";
import Faq from "../models/Faq";

dotenv.config();

// Path to your Voice Agent FAQ file
const faqPath = path.resolve(
  __dirname,
  "../../../Voice agent/FAQS/data/faq-seed.json"
);

const rawFaqs = JSON.parse(fs.readFileSync(faqPath, "utf8"));

function getCategory(id: string) {
  const chapter = id.split(".")[0];

  switch (chapter) {
    case "1":
      return "About the Internship";

    case "2":
      return "Application";

    case "3":
      return "Selection";

    case "4":
      return "Team Formation";

    case "5":
      return "Timeline";

    case "6":
      return "Projects";

    case "7":
      return "Communication";

    case "8":
      return "NOC";

    case "9":
      return "Offer Letter";

    case "10":
      return "Stipend";

    case "11":
      return "Certificates";

    case "12":
      return "Technical";

    default:
      return "General";
  }
}

const faqs = rawFaqs.map((faq: any) => ({
  question: faq.question,
  answer: faq.answer,
  category: getCategory(faq.id),
  tags: faq.aliases || [],
}));



const seedFAQs = async () => {
  try {
    await connectDB();

    await Faq.deleteMany({});
    await Faq.insertMany(faqs);

    console.log(`✅ Seeded ${faqs.length} FAQs`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedFAQs();