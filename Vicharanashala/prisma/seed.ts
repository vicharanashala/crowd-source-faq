import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const faqs = [
  {
    id: "FAQ-001",
    category: "About Internship",
    question: "What is the Vicharanashala Internship Program at IIT Ropar?",
    answer: "The Vicharanashala Internship by Vicharanashala Lab at IIT Ropar is a prestigious hands-on research and system engineering internship program. Interns work on cutting-edge systems, cloud infrastructure, AI models, and real-world software products. It emphasizes peer-to-peer learning, modular software design, and rigorous engineering practices, preparing students for tier-1 tech companies and top-tier research institutes.",
    upvotes: 142,
    downvotes: 3,
    popularity: 980,
    lastUpdated: "2026-05-15",
    related: ["FAQ-002", "FAQ-006", "FAQ-007"],
    tags: ["Overview", "Vicharanashala", "IIT Ropar", "Research"]
  },
  {
    id: "FAQ-002",
    category: "About Internship",
    question: "Is the Vicharanashala internship paid (Do we get a stipend)?",
    answer: "Yes. The internship offers a monthly stipend for selected full-time on-campus or remote-aligned interns, subject to satisfactory performance and completion of weekly Rosetta Journal logs and milestone reviews. Stipends are released post-verification of team submissions around the first week of the subsequent month.",
    upvotes: 98,
    downvotes: 1,
    popularity: 840,
    lastUpdated: "2026-05-18",
    related: ["FAQ-001", "FAQ-005"],
    tags: ["Stipend", "Payment", "Policy"]
  },
  {
    id: "FAQ-003",
    category: "Timing & Dates",
    question: "What are the start and end dates of the 2026 cycle?",
    answer: "The Vicharanashala Summer 2026 Cycle officially begins on June 1, 2026, and spans 10 weeks, ending on August 10, 2026. However, students with differing university schedules can coordinate a modified track (minimum 8-week duration) via their assigned mentors through the ViBe portal.",
    upvotes: 75,
    downvotes: 2,
    popularity: 610,
    lastUpdated: "2026-05-12",
    related: ["FAQ-004"],
    tags: ["Schedule", "Dates", "Timeline"]
  },
  {
    id: "FAQ-004",
    category: "Timing & Dates",
    question: "Can I change my internship dates or request leaves?",
    answer: "Yes, date adjustments (shifting start/end by up to 2 weeks) can be requested under the 'Academic Exceptions' tab in the User Dashboard. Planned leaves must be reported at least 72 hours in advance via public channels. Any leave exceeding 4 consecutive days requires mentor approval and might deduct proportional stipend amounts.",
    upvotes: 56,
    downvotes: 0,
    popularity: 450,
    lastUpdated: "2026-05-20",
    related: ["FAQ-003"],
    tags: ["Leaves", "Timeline", "Assistance"]
  },
  {
    id: "FAQ-005",
    category: "NOC",
    question: "How do I upload my NOC (No Objection Certificate) and what is the deadline?",
    answer: "No Objection Certificates (NOC) signed by your college Dean or Training and Placement Officer (TPO) must be uploaded via the User Dashboard under the 'NOC & Documents' block. The deadline for submission is June 10, 2026. Failure to upload a valid NOC will withhold stipend processing and certificate generation.",
    upvotes: 120,
    downvotes: 1,
    popularity: 910,
    lastUpdated: "2026-05-22",
    related: ["FAQ-006", "FAQ-008"],
    tags: ["NOC", "Documents", "Compliance"]
  },
  {
    id: "FAQ-006",
    category: "Offer Letter",
    question: "When will I receive my official internship Offer Letter?",
    answer: "Offer Letters are automatically compiled and issued to candidates in batches. Once your academic credentials and NOC are provisionally approved, you can download your official letter from the Dashboard. If you find typographical errors on your letter, click 'Request Correction' within the document block.",
    upvotes: 89,
    downvotes: 0,
    popularity: 750,
    lastUpdated: "2026-05-14",
    related: ["FAQ-005", "FAQ-011"],
    tags: ["Offer Letter", "Onboarding", "Verification"]
  },
  {
    id: "FAQ-007",
    category: "Certificates",
    question: "How and when will the final Internship Certificates be issued?",
    answer: "Upon successful completion of the internship, including final project evaluation, team repository mergers, and Rosetta Journal sign-offs, official digital certificates under IIT Ropar, signed by the lab director, will be issued. These are typically available for download within 14 days of the program close (by August 24, 2026). Check progress under your User Dashboard.",
    upvotes: 104,
    downvotes: 1,
    popularity: 680,
    lastUpdated: "2026-05-28",
    related: ["FAQ-001", "FAQ-010"],
    tags: ["Certificate", "Graduation", "Validation"]
  },
  {
    id: "FAQ-008",
    category: "Mentorship",
    question: "Who will be my mentor and what if my mentor is not assigned yet?",
    answer: "Mentors comprise IIT Ropar PhD scholars, lead researchers, and senior engineers. Mentors are matched based on the domain preferences you specified during selection (e.g., Cloud, AI, Frontend, Systems). If no mentor is visible on your dashboard by May 30, use Yaksha Chat to post an alert, or ping in the '#mentorship-matching' channel on Slack.",
    upvotes: 62,
    downvotes: 4,
    popularity: 580,
    lastUpdated: "2026-05-25",
    related: ["FAQ-009", "FAQ-013"],
    tags: ["Mentorship", "Support", "Slack"]
  },
  {
    id: "FAQ-009",
    category: "Projects",
    question: "How are internship projects selected or assigned?",
    answer: "Projects at Vicharanashala Lab are structured open-source contributions or client-centric cloud/system challenges. Teams can pitch an custom research proposal during Week 1, or choose from the 'Active Project Catalog' prepared by the lab directors. Project declarations must be finalized on the ViBe platform by June 5, 2026.",
    upvotes: 81,
    downvotes: 1,
    popularity: 700,
    lastUpdated: "2026-05-19",
    related: ["FAQ-011", "FAQ-012"],
    tags: ["Projects", "Engineering", "Syllabus"]
  },
  {
    id: "FAQ-010",
    category: "Yaksha Chat",
    question: "What is Yaksha AI and how should I use it for help?",
    answer: "Yaksha AI is a customized LLM agent trained on Vicharanashala Lab docs. Available as Yaksha-mini (floating assistant) and Yaksha Chat Max, it supports query resolution, NOC verification advice, code debugging, and Rosetta Journal summarization. It runs directly on top-tier server architectures.",
    upvotes: 115,
    downvotes: 2,
    popularity: 890,
    lastUpdated: "2026-05-29",
    related: ["FAQ-001", "FAQ-010"],
    tags: ["Yaksha AI", "Support", "Chatbot"]
  },
  {
    id: "FAQ-011",
    category: "ViBe Platform",
    question: "What is the ViBe platform and how do I gain developer access?",
    answer: "The Vicharanashala Board & Ecosystem (ViBe) is the proprietary workspace where teams track their sprint boards, submit weekly logs, review API specifications, and log milestones. Access credentials are emailed to you 48 hours before the program launch. If your account is locked, submit a reactivation request inside the Admin/User panel.",
    upvotes: 94,
    downvotes: 2,
    popularity: 810,
    lastUpdated: "2026-05-24",
    related: ["FAQ-012", "FAQ-001"],
    tags: ["ViBe Platform", "Software", "Credentials"]
  },
  {
    id: "FAQ-012",
    category: "Rosetta Journal",
    question: "What is the Rosetta Journal requirement?",
    answer: "The Rosetta Journal is your personalized engineering diary. Every intern is required to write a weekly log summarizing code pushed, papers read, problems debugged, and milestone projections. Every Saturday by 11:59 PM, your Rosetta entry must be submitted on ViBe. These logs are directly evaluated by mentors and dictate stipend validation.",
    upvotes: 130,
    downvotes: 0,
    popularity: 950,
    lastUpdated: "2026-05-27",
    related: ["FAQ-011", "FAQ-002"],
    tags: ["Rosetta Journal", "Logs", "Grading"]
  },
  {
    id: "FAQ-013",
    category: "Team Formation",
    question: "Can I form my own team, and what is the team size limit?",
    answer: "Yes. Vicharanashala promotes collaborative system building. You can find partners on the '#team-formation' channel or via the dashboard registry. Teams must consist of 3 to 5 interns. Every team needs a designated Scrum Master who serves as the primary contact with core mentors. Single-member project exemptions must be approved by the Lab Director.",
    upvotes: 112,
    downvotes: 3,
    popularity: 880,
    lastUpdated: "2026-05-17",
    related: ["FAQ-009", "FAQ-011"],
    tags: ["Teams", "Group", "Collaboration"]
  },
  {
    id: "FAQ-014",
    category: "Interviews",
    question: "Are there periodic progress evaluations or mid-term interviews?",
    answer: "Yes, there are two milestone evaluations: a Mid-Term Review (Week 5) and a Final Defense (Week 10). Evaluations include a codebase walkthrough, slides deck defense, and technical Q&A with an external committee of academic and industry specialists. Performance grade metrics directly reflect on your final IIT Ropar recommendation letter.",
    upvotes: 68,
    downvotes: 0,
    popularity: 520,
    lastUpdated: "2026-05-21",
    related: ["FAQ-007", "FAQ-009"],
    tags: ["Evaluations", "Interviews", "Grading"]
  },
  {
    id: "FAQ-015",
    category: "Communication Channels",
    question: "What communication channels are used for the internship?",
    answer: "We use a dedicated Slack workspace and the ViBe messaging module. The Slack workspace has channels for daily standups (#daily-updates), system announcements (#announcements), domain groups (#domain-systems, #domain-ai), and relaxation (#watercooler). Mentors hold sync calls on Google Meet three times a week.",
    upvotes: 93,
    downvotes: 1,
    popularity: 790,
    lastUpdated: "2026-05-16",
    related: ["FAQ-008", "FAQ-011"],
    tags: ["Communication", "Slack", "Meetings"]
  },
  {
    id: "FAQ-016",
    category: "About Internship",
    question: "What are Spurti Points (SP) and do they affect my internship evaluation or outcome?",
    answer: "Spurti Points (SP) are currently in beta and may not accurately reflect effort. Higher SP may occasionally provide recognition or small perks, but they do NOT determine internship outcomes. Importantly, SP may be zero or negative, and this is completely fine and is not a problem.",
    upvotes: 122,
    downvotes: 0,
    popularity: 910,
    lastUpdated: "2026-06-01",
    related: ["FAQ-001", "FAQ-012"],
    tags: ["Spurti Points", "SP", "Grading", "Outcome"]
  },
  {
    id: "FAQ-017",
    category: "About Internship",
    question: "What are the strict participation requirements monitored on a rolling basis?",
    answer: "The Vicharanashala Internship Program strictly evaluates participation on a rolling basis covering the most recent 5 working days (each new day continuously replaces the oldest day in the evaluation window). Every intern must satisfy three conditions simultaneously:\n- Attend at least 85% of total Zoom session time.\n- Respond to at least 85% of polls and quizzes.\n- Attempt every quiz and score at least 50%.\n\nAll three conditions must be satisfied simultaneously. If any requirement falls below these thresholds, the intern may be moved to a subsequent or later batch.",
    upvotes: 145,
    downvotes: 0,
    popularity: 990,
    lastUpdated: "2026-06-01",
    related: ["FAQ-001", "FAQ-012", "FAQ-014"],
    tags: ["Participation", "Zoom", "Quizzes", "Rolling Basis", "Rules"]
  },
  {
    id: "FAQ-018",
    category: "ViBe Platform",
    question: "What are the rules and supported devices for the ViBe Platform?",
    answer: "The ViBe Platform supports Desktop and Laptop computers only. Mobile phones and tablets are not supported. Furthermore, courses follow a strict linear progression. All videos and quizzes must be completed sequentially, and skipping ahead is not allowed. If you see 'Access Restricted' on a course item, it means a previous required item has not yet been completed.",
    upvotes: 110,
    downvotes: 1,
    popularity: 880,
    lastUpdated: "2026-06-01",
    related: ["FAQ-011", "FAQ-019"],
    tags: ["ViBe Platform", "Devices", "Linear Progression", "Restricted"]
  },
  {
    id: "FAQ-019",
    category: "ViBe Platform",
    question: "I cannot see my courses or log in on the ViBe Platform. How do I fix this?",
    answer: "First, make sure you are logging in using your registered email ID and checking your Notifications panel to accept course invitations. If the courses still do not appear, please perform these troubleshooting steps:\n1. Verify your registered email ID.\n2. Clear your browser cache.\n3. Allow browser cookies.\n4. Update your local computer's primary DNS settings.\n5. Flush your DNS cache (e.g., run ipconfig /flushdns) and re-login.",
    upvotes: 135,
    downvotes: 2,
    popularity: 920,
    lastUpdated: "2026-06-01",
    related: ["FAQ-011", "FAQ-018"],
    tags: ["Login", "Course Access", "DNS Cache", "Troubleshooting"]
  },
  {
    id: "FAQ-020",
    category: "ViBe Platform",
    question: "What are the video playback rules and how is progress tracked on ViBe?",
    answer: "Videos must be watched completely and in sequence on the active ViBe tab. Camera and microphone permissions may be required depending on course proctoring set-ups. Player interruptions can be triggered by switching tabs, going idle, poor lighting, or excessive background noise. Progress is stored on the server side and securely linked to your registered email ID, meaning that clearing cache or reinstalling your browser will never remove or delete your progress.",
    upvotes: 125,
    downvotes: 0,
    popularity: 890,
    lastUpdated: "2026-06-01",
    related: ["FAQ-011", "FAQ-018", "FAQ-021"],
    tags: ["Video Playback", "Progress", "Permissions", "Cache"]
  },
  {
    id: "FAQ-021",
    category: "ViBe Platform",
    question: "What are Penalty Scores, proctoring rules, and recommended setup on ViBe?",
    answer: "Penalty scores are generated by anomalous learning behaviors and may ask you to rewatch videos or retake quizzes, but they currently do not affect your HP or final evaluation.\n\nProctoring requires that your face is clearly visible in the camera frame with adequate lighting, typically only one face is visible, excessive background voices are avoided, and long periods of looking away from the screen are not flagged. Please note that ViBe does not continuously record video; camera and mic are used primarily for real-time compliance checks in accordance with consent terms.\n\nRecommended Learning Setup:\n- Ensure the main light source faces you directly.\n- Check that only one person is in the camera frame.\n- Work in a quiet environment.\n- Always stay active on the official ViBe browser tab while learning.",
    upvotes: 119,
    downvotes: 0,
    popularity: 875,
    lastUpdated: "2026-06-01",
    related: ["FAQ-011", "FAQ-020"],
    tags: ["Proctoring", "Penalty", "Privacy", "Learning Setup"]
  },
  {
    id: "FAQ-022",
    category: "ViBe Platform",
    question: "What is the expected daily learning rhythm on ViBe?",
    answer: "Consistency is key. Consistent daily learning is highly preferred, and achieving approximately 3.33% progress per day is a highly useful baseline guideline for most tracks, unless program-specific milestones differ.",
    upvotes: 94,
    downvotes: 0,
    popularity: 760,
    lastUpdated: "2026-06-01",
    related: ["FAQ-011", "FAQ-020"],
    tags: ["Learning Rhythm", "Progress", "Milestones"]
  },
  {
    id: "FAQ-023",
    category: "Team Formation",
    question: "What are the rules regarding team formation, coordination support, and inactive members?",
    answer: "Team participation is strictly mandatory during project phases. Teams must consist of 4 members, assigned or formed according to program rules, and team changes are generally not allowed. Forming teams from the same college is discouraged unless specifically permitted.\n\nOfficial communication occurs through Samagama announcements and Yaksha. Team coordination should take place via LinkedIn or Email; WhatsApp groups for internship team coordination are strictly prohibited.\n\nTeam deliverables contribute directly to evaluation. Any inactive members should be immediately reported to your assigned mentors/scholars.",
    upvotes: 130,
    downvotes: 1,
    popularity: 940,
    lastUpdated: "2026-06-01",
    related: ["FAQ-013"],
    tags: ["Teams", "WhatsApp", "LinkedIn", "Communication", "Inactive"]
  },
  {
    id: "FAQ-024",
    category: "Yaksha Chat",
    question: "How do I escalate platform issues or bugs, and what is the general principles governing support?",
    answer: "For content-related issues in a course, please use the ViBe 'Flag' option. For technical or platform-related issues, contact Yaksha bot directly. Persistent platform issues can be escalated via the Slack channel using '#escalate-ViBe'.\n\nGeneral Principle:\nThese instructions and rules are considered the authoritative source of guidance. We prefer official FAQ guidelines over external assumptions. If a situation is not explicitly covered in these official guidelines, the official FAQ does not specify it.",
    upvotes: 140,
    downvotes: 0,
    popularity: 995,
    lastUpdated: "2026-06-01",
    related: ["FAQ-010", "FAQ-015"],
    tags: ["Escalation", "Support", "Flag option", "vibe-escalate"]
  }
];

async function main() {
  console.log("Cleaning database...");
  await prisma.notification.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.bookmark.deleteMany({});
  await prisma.chatMessage.deleteMany({});
  await prisma.communityAnswer.deleteMany({});
  await prisma.fAQ.deleteMany({});
  await prisma.user.deleteMany({});

  console.log("Seeding FAQs...");
  for (const faq of faqs) {
    await prisma.fAQ.create({
      data: {
        id: faq.id,
        category: faq.category,
        question: faq.question,
        answer: faq.answer,
        upvotes: faq.upvotes,
        downvotes: faq.downvotes,
        popularity: faq.popularity,
        tags: JSON.stringify(faq.tags),
        related: JSON.stringify(faq.related),
        lastUpdated: faq.lastUpdated,
        isOfficial: true,
      },
    });
  }

  console.log("Creating default Admin User...");
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: {
      name: "Yaksha Admin",
      email: "admin@vicharanashala.in",
      password: adminPasswordHash,
      role: "ADMIN",
      isVerified: true,
      spurtiPoints: 1000,
      streak: 5,
      badges: JSON.stringify(["First Question", "Bookworm", "Yaksha's Favorite", "FAQ Hunter"]),
    },
  });

  console.log("Creating default Candidate User...");
  const candidatePasswordHash = await bcrypt.hash("scholar123", 10);
  await prisma.user.create({
    data: {
      name: "Scholar Intern",
      email: "scholar@vicharanashala.in",
      password: candidatePasswordHash,
      role: "USER",
      isVerified: true,
      spurtiPoints: 75,
      streak: 3,
      badges: JSON.stringify(["First Question"]),
    },
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
