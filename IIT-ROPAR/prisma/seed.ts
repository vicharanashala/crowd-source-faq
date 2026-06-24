import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { faqData } from "../src/data/faqs.js";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("password", 10);
  
  await prisma.user.upsert({
    where: { email: "student@iitr.ac.in" },
    update: {},
    create: {
      email: "student@iitr.ac.in",
      password: hashedPassword,
      name: "Antra Mishra",
      studentId: "2026CSB1012",
      college: "IIT Ropar",
      role: "Student",
      isVerified: true,
      contributionScore: 120,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@iitr.ac.in" },
    update: {},
    create: {
      email: "admin@iitr.ac.in",
      password: hashedPassword,
      name: "Prof. Rajat Sharma",
      studentId: "FACULTY-04",
      college: "IIT Ropar CSE Faculty",
      role: "Admin",
      isVerified: true,
      contributionScore: 999,
    },
  });

  for (const faq of faqData) {
    await prisma.fAQ.upsert({
      where: { id: faq.id },
      update: {},
      create: {
        id: faq.id,
        category: faq.category,
        question: faq.question,
        answer: faq.answer,
        upvotes: faq.upvotes || 0,
        downvotes: faq.downvotes || 0,
        popularity: faq.popularity || 0,
        tags: (faq.tags || []).join(","),
      }
    });
  }

  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
