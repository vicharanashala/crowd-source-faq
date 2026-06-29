export interface FAQItem {
  q: string;
  a: string;
}

export interface FAQCategory {
  category: string;
  description?: string;
  questions: FAQItem[];
}

export const faqData: FAQCategory[] = [
  {
    "category": "1. About the internship",
    "description": "Learn the basics of the Vicharanashala Internship (VINS), its phases, and who is eligible to apply.",
    "questions": [
      {
        "q": "1.1 What is the Vicharanashala internship?",
        "a": "A two-month, full-time engagement at the Vicharanashala Lab, a research lab at IIT Ropar. You will work on a real open-source project under a mentor, after a short training phase tailored to where you already are. The internship is free — we do not charge, and the work is real."
      },
      {
        "q": "1.2 What is VINS?",
        "a": "VINS is the Vicharanashala Internship — an online programme open to anyone who clears our interview. The work is real open-source contribution under a mentor, the certificate is from the Vicharanashala Lab for Education Design at IIT Ropar, and the programme itself is free (we charge nothing). There is no stipend. If you are seeing a yellow VINS panel on your result page, you are selected."
      },
      {
        "q": "1.3 What are the phases of VINS, and what do the badges mean?",
        "a": "VINS is structured as four phases. Each one is marked by a badge — a small token of where you are in the journey. Bronze (Phase 1) — a short training period at the start, planned around what you already know. If you arrive already comfortable with the basics, your mentor may skip Bronze and put you straight on to the project. Silver (Phase 2) — the main work. You contribute to a real open-source project under a Vicharanashala mentor. Finishing Bronze and Silver completes your internship and earns the certificate. Gold (Phase 3) — a recognition awarded during Silver if your contribution stands on its own as a meaningful feature, not just a small fix. Platinum (Phase 4) — a standing invitation to come back and visit the lab — a short trip — any time during the year after your internship ends. We help with travel through a small visit stipend. Most interns finish at Bronze + Silver, and that is exactly what the certificate is for. Gold and Platinum are extras you can pick up if your work makes the case for them. Either way, you walk away with a real open-source contribution to your name and a mentor who knows you well."
      },
      {
        "q": "1.4 Who is the internship for? Are alumni eligible?",
        "a": "The internship is for currently-enrolled students at any college or university — undergraduate, postgraduate, or doctoral. The NOC requirement is the practical reflection of this: we ask for institutional consent that you can commit your time to this internship. Candidates who have already graduated and are not currently enrolled in any programme are not eligible for this cycle. If you re-enrol later (higher studies, etc.), you are very welcome to apply again in a future cycle."
      },
      {
        "q": "1.5 Is this the same as IIT Ropar's official Summer Research Internship?",
        "a": "No. Summership 2026 is a VLED Lab initiative. The certificate is issued by the Vicharanashala Lab for Education Design, not centrally by the institute. IIT Ropar runs a separate institutional summer research internship through its own office. Do not represent Summership 2026 as equivalent to that programme."
      },
      {
        "q": "1.6 I have to attend my class tomorrow/today/some day — can I take leave?",
        "a": "Leave is not permitted. If you are also attending classes or exams, you will be relieved from the internship immediately and will need to join the next batch when it starts."
      }
    ]
  },
  {
    "category": "2. Timing and dates",
    "description": "Understand the internship schedule, start dates, and time commitments required.",
    "questions": [
      {
        "q": "2.1 When can I start?",
        "a": "You can start any time in 2026 — VINS is flexible on the start date — but there are two things you must hold in mind together, and one strong recommendation. The hard rule. Your internship must finish by 31 December 2026. That date is non-negotiable. Whatever start you pick, your end date (your start + 2 months, with up to 1 month grace) must land on or before 31 December 2026. So while there is no last date to opt in, there is absolutely a last date to finish. The strong recommendation: start as soon as possible. The earlier you join, the more of the May–July main cohort you catch — and three things make starting earlier materially better than starting later: Cohort networking. The batch goes through Bronze together — peer discussions, parallel problem-solving, and lasting connections happen during this window. Later in the year the cohort disperses and late starters are largely solo. TA support is concentrated in May–July. TAs are full-time during this window. After this they return to their own college work and bandwidth is materially thinner. Training rolls out with the cohort, not piecemeal — you get the material with the discussion around it, not as a static document. If starting now is genuinely impossible for you (exams, other unavoidable commitments), you can begin later and still complete and earn the certificate — but be honest with yourself: the cohort effect and support will be lighter, and the December cap means a late start leaves no room for slippage."
      },
      {
        "q": "2.2 How long is the internship?",
        "a": "Two months from your chosen start date, with an optional one-month grace period if you need it. End must land on or before 31 December 2026."
      },
      {
        "q": "2.3 Can I start in July, August or later if I have exams now?",
        "a": "Yes — but only if your exams genuinely make an earlier start impossible. Wait until your exams are done, then opt in and start. Do not attempt to juggle this internship with ongoing exams. Make sure your chosen start date plus 2 months (or 3 with grace) lands on or before 31 December 2026."
      },
      {
        "q": "2.4 Can I start with the cohort and take a relaxation during my exam window?",
        "a": "No. This is not an arrangement we offer. VINS is a full-attention internship — six to ten hours a day, sometimes more. Splitting that with college exams damages both sides: the project loses momentum, the exams suffer, and the mentor invests in someone who can only half-engage. We have seen this fail enough times to be firm. If your exams fall inside the cohort duration, defer your start to after your exams end, opt in then, and run the internship at full attention. The certificate and project pathway are the same. A note on consequences. If we later learn that a candidate was sitting college exams during their internship period, we reserve the right to terminate the internship or withhold the certificate at any time — including after the internship has otherwise been completed."
      },
      {
        "q": "2.5 Can I take leave or get an exemption during the internship for an exam scheduled in June?",
        "a": "The attendance rule is firm — the 55-day continuous window is a non-negotiable part of the internship, and we cannot offer an exemption for an exam during this period. The policy exists because split attention genuinely damages both your exam preparation and your internship work."
      },
      {
        "q": "2.6 Are orientation session recordings shared with interns, and can project or group assignments be changed after watching them?",
        "a": "Recordings of the sessions will not be provided. However, we may provide access to an abridged version of a talk or session if we consider it important. We do not guarantee this for every session."
      }
    ]
  },
  {
    "category": "3. NOC (No Objection Certificate)",
    "description": "Detailed instructions on how to obtain, format, and submit your NOC.",
    "questions": [
      {
        "q": "3.1 What dates do I put on the NOC?",
        "a": "Default: your chosen start date -> your start + 2 months (with up to 1 month grace), ensuring the end date is on or before 31 December 2026. Pick the earliest start date you can realistically make — the May–July summer window is the main cohort. If the NOC will be signed on a specific later date, pick a start date after the signature date."
      },
      {
        "q": "3.2 Who can sign the NOC?",
        "a": "Any authorised signatory at your college: HOD, Acting HOD (during holidays), Principal, Dean, Director, or Training & Placement Officer. For dual-degree students, either institution can sign — pick whichever is easier. For IITM BS Online Degree (standalone) students, any officer from the BS office can sign."
      },
      {
        "q": "3.3 When do I submit the NOC? Is the deadline hard?",
        "a": "There is no specific calendar cut-off date by which the NOC must be uploaded — but your internship cannot formally begin until your official institutional NOC has been uploaded and validated by us. So submit your signed NOC as early as possible and join the current summer cohort. If you are on VINS you can technically upload your NOC and start later in the year, but we strongly do not recommend it — by then your mentor may already be busy with other work, you will not get to network properly with the rest of the cohort, and the cohort + TA support that make this internship genuinely good are concentrated during the summer window. Submit early, start as soon as possible, and you will get the full version of the experience."
      },
      {
        "q": "3.4 What format should I use? Do I need to design it myself?",
        "a": "No — we provide a printable NOC format. Once your result is out and you log in to samagama.in, you will see a Download blank NOC button on your dashboard. Take a printout, get it physically signed and stamped by your authorised signatory, scan it, and upload the signed PDF using the Upload signed NOC button (also on the dashboard). You do not need to draft anything yourself, and you do not need college letterhead — the format we provide is the canonical layout."
      },
      {
        "q": "3.5 What if my college / Program Chair gives me an NOC in their own format?",
        "a": "A college's own NOC format is acceptable, as long as all of the required entries are present on it: The signing authority's (HOD / Dean / Program Chair / Principal) handwritten signature — this is the most important item. The signing authority's name, designation, official email address, and phone number (we cross-check with that person to verify the signature is genuine). Your full name and the internship period (start and end dates). Your signature. If your college's format does not include a place for your signature, sign clearly and prominently anywhere on the document before uploading. With those entries present, you do not need to switch to our printable format. An NOC missing any of them is incomplete and will be returned for correction."
      },
      {
        "q": "3.6 Does it need to be signed by hand?",
        "a": "Yes. Three things are required, all on the NOC format we provide: The authorised signatory's handwritten signature. The institutional rubber stamp / seal applied in the designated area. The signatory's email address filled in the designated field — we automatically cross-check with that person to verify the signature is genuine. Digital signatures are not accepted. The only path is a physically-signed printout uploaded by you from the dashboard (see §3.8)."
      },
      {
        "q": "3.7 Can my HOD email the NOC instead of uploading it?",
        "a": "No. Your NOC must be uploaded by you, the student, from your dashboard — we no longer accept NOCs sent by email. We previously offered an email-forward path where your HOD emailed the NOC to us. That option has been retired. NOCs emailed to us — whether by you or by your HOD — will not be processed. The only accepted way to submit your NOC is to download the format, get it signed by the appropriate authority at your institution, and upload the signed PDF yourself from your dashboard (see §3.8). If your college gives you a signed NOC in their own format, that is fine (see §3.5) — you still upload it yourself as a PDF."
      },
      {
        "q": "3.8 How do I download and upload the NOC?",
        "a": "Both happen on your dashboard at samagama.in once your result is out. You will see a NOC section with two buttons in three places (all backed by the same endpoints — use whichever is convenient): 1. A compact pill in the dark header bar at the top of every screen. 2. A standalone NOC card on the dashboard, between the Results card and the Talk-to-Yaksha button. 3. A NOC section at the bottom of your full Result message itself. The two buttons: Download blank NOC — saves the printable NOC format PDF. Upload signed NOC (PDF) — opens a file picker; the file must be a PDF of at most 1 MB. Confirmation appears on the same card once the upload is received. The chat surface no longer carries any NOC affordance — please use the dashboard buttons. If you can't see the buttons, make sure you are logged in as the email that received the result, and that your result has been released."
      },
      {
        "q": "3.9 What if my NOC is not formally verified?",
        "a": "NOC verification takes time — typically anywhere between an hour and one full working day from the moment you upload. Your offer letter is issued automatically once your signed institutional NOC is uploaded and validated — there is no faster route. (The earlier self-declaration / provisional-offer option was retired on 2026-05-27 and is no longer accepted.) Please upload your signed NOC as early as you can so your start is not delayed."
      },
      {
        "q": "3.10 My online course (Masai, NPTEL, Coursera, etc.) won't issue an NOC. What do I do?",
        "a": "The internship is open only to candidates currently enrolled in a full-time degree programme at a recognised college or university. Online-only courses — Masai Institute, NPTEL / MOOC enrolments, Coursera, Udacity, bootcamps, and similar — do not by themselves make a candidate eligible. If you are concurrently enrolled in a full-time degree programme alongside the online course, please obtain a No Due / No Objection certificate from that college (department, Dean's office, or Principal) and upload it via the NOC upload flow on your dashboard. If your only current academic engagement is the online course and you are not concurrently enrolled in a full-time degree programme, the internship is not open to you in this cycle. We would warmly welcome you to apply again in a future cycle once you are enrolled in a full-time programme."
      },
      {
        "q": "3.11 My HOD/college official wants written confirmation before signing my NOC. What do I show them?",
        "a": "Your selection is already confirmed the moment your yellow VINS (or green VISE) result panel appears on your samagama.in dashboard — that is the official confirmation of your selection, and it is what your HOD should sign your NOC on the basis of. There is no separate written confirmation letter or other proof-of-selection document issued before the NOC step — and none can be sent on request. (The selection-confirmation letter and the self-declaration / provisional-offer route have both been discontinued.) Your offer letter is issued only after your signed NOC is uploaded and validated, so it is not available beforehand. If your college will not sign without something in hand, show them your VINS result panel on the dashboard as evidence of selection — that is the confirmation we provide."
      },
      {
        "q": "3.12 Can Prof. Sudarshan Iyengar or a faculty member from IIT Ropar sign my NOC for the internship?",
        "a": "Your NOC must be signed by an authorised signatory at the institution where you are enrolled as a student — such as your HOD, Dean, Principal, or Training & Placement Officer. Sudarshan Iyengar is a faculty member at IIT Ropar and is not the authorised signatory for the IIT Ropar/Masai online AIML programme. He cannot sign your NOC in a personal capacity. Regarding eligibility: the internship is open to candidates currently enrolled in a UG/PG/Diploma programme at a recognised college or university. An online-only certification course (even if offered jointly with an IIT) does not meet that requirement on its own. If you are concurrently enrolled in a full-time degree programme elsewhere, please obtain the NOC from the authorised signatory at that institution. If your only current academic enrolment is the IIT Ropar/Masai online programme, you are not eligible for this internship cycle. Please clarify your current enrolment status and we will guide you accordingly."
      }
    ]
  },
  {
    "category": "4. Selection, offer letter, and certificate",
    "description": "Information regarding your selection confirmation, offer letter issuance, and final certificate.",
    "questions": [
      {
        "q": "4.1 How do I know I am selected?",
        "a": "If you can see your yellow VINS result panel on samagama.in, you are selected. There is no separate selection step or confirmation email."
      },
      {
        "q": "4.2 How do I opt into VINS?",
        "a": "Tell Yaksha in the chat: \"I want to take up the online internship without stipend.\" Yaksha will confirm. Opting in is the selection — no separate confirmation email is sent at that stage."
      },
      {
        "q": "4.3 When do I get the offer letter?",
        "a": "Your offer letter is issued automatically once you upload your signed institutional NOC (and have confirmed your start and end dates on the dashboard, see §4.5) and we validate it — typically within an hour to one full working day of upload. There is a single offer letter on Vicharanashala letterhead; once your NOC is validated it is the operative offer for your college / employer records. (The earlier self-declaration / provisional-offer \"fast path\" was retired on 2026-05-27 and is no longer available — a signed institutional NOC is now the only way the offer letter is issued.) The offer letter lives on your dashboard at samagama.in, not in your email. When it is issued, a notification will appear in the Announcements section of samagama.in. Log in and click Download Offer Letter from the Offer Letter card on your dashboard. If you do not see it, do a hard refresh and log back in — or raise #escalate in Yaksha chat."
      },
      {
        "q": "4.4 Will I get a certificate?",
        "a": "Yes — every intern who completes the internship gets a certificate from Vicharanashala, IIT Ropar. The internship is genuinely demanding; candidates who drop out mid-way do not get a certificate. Finishing means something, because the bar is high."
      },
      {
        "q": "4.5 How do I confirm my internship dates?",
        "a": "Once you have opted into VINS in the chat with Yaksha (see §4.2), log in to samagama.in. On the dashboard, you will see a yellow card titled \"Confirm your internship dates\". The two date pickers pre-fill with sensible defaults for the current cohort. If those work for you, hit \"Save dates\". Otherwise edit them to your earliest realistic start — your end must be on or before 31 December 2026. A green confirmation appears once saved. You can edit any time from the same card. Order doesn't matter. You can save your dates before or after uploading your NOC — both paths work. The dates you enter must match the internship period your HOD signs off on in your NOC. If you need to change the period later, edit the dates on the same card and upload a fresh NOC matching the new period."
      },
      {
        "q": "4.6 I am a minor/major in AI student, can I join the programme? I don't need a NOC as I am from IIT Ropar",
        "a": "Minor/Major in AI course from IIT Ropar is a certification course and there will be a different track of internship equivalent to them. Kindly write to us separately for this. For you to be part of this internship programme you should be a registered student in a UG/PG programme with some university. This internship is exclusively meant for the students only and not for working professionals."
      },
      {
        "q": "4.7 How do I accept the offer letter?",
        "a": "Acceptance happens entirely on your dashboard at samagama.in — there is no email reply, and nothing to paste or post. The Offer Letter card guides you through three steps, and your offer is recorded as accepted only once all three are complete. Please finish them within 5 days of your offer being issued: 1. Offer letter — download your offer letter, sign the *Acceptance of Offer* block at the bottom of it, and upload the signed PDF on the card. 2. Terms & Conditions (Participation Agreement) — read each section and tick the box to confirm you have understood it. 3. Honor Code — download the Honor Code, sign the last page, and upload the signed PDF. Each PDF upload is capped at 1 MB; to correct a file, just upload a new copy — the latest replaces the previous one. The card updates as you complete each step and shows your offer as accepted once all three are done. There is no acceptance email to send and no statement to type. If you have completed all three steps and the card has not updated after a refresh, log in to samagama.in and type #escalate in the Yaksha chat and we will check."
      },
      {
        "q": "4.8 Can I change my internship dates?",
        "a": "Before the offer letter is issued: yes — open the Confirm Internship Dates card on your dashboard and edit the dates at any time. Your end date must be on or before 31 December 2026. After the offer letter is issued: no. Dates are final and will not be changed. If the confirmed dates do not work for you, please follow our LinkedIn page for announcements about future cohorts: linkedin.com/company/vicharanashala. If you updated your NOC to reflect new dates before the offer letter was issued, upload the revised NOC via the dashboard."
      },
      {
        "q": "4.9 My NOC is not ready but my start date is approaching. What do I do?",
        "a": "Get your signed institutional NOC uploaded as soon as you can. Your start date cannot be honoured until your official NOC is uploaded and validated by us — the internship formally begins only after the NOC is validated. If your NOC is not in by your chosen start date, your start simply shifts to whenever it is validated. (The earlier self-declaration / provisional-offer option was retired on 2026-05-27 and is no longer accepted, so a signed institutional NOC is the only way forward.)"
      },
      {
        "q": "4.10 When does my internship actually begin? Will I receive a notification on the day?",
        "a": "Your internship begins on the start date you confirmed on the dashboard — the same date printed on your offer letter — provided your official institutional NOC has been uploaded and validated by us by then. If your validated NOC is not yet in on your start date, your start shifts to the day it is validated. There is no separate \"your internship has begun\" email, chat message, or dashboard notification on the day itself; the start date is the start date. On the morning of your start date, log in to samagama.in. Yaksha will guide you through the Day-1 steps of the Bronze phase. If your dashboard appears unchanged on that morning, do a hard refresh and re-login. If it still looks the same, type #escalate in the chat and we will look at your specific case. You can review or change your confirmed dates via the Confirm Internship Dates card on your dashboard (see §4.5 to set, §4.8 for date-change rules)."
      },
      {
        "q": "4.11 Can I switch from VINS (online) to VISE (offline) after being selected?",
        "a": "The two tracks are finalised at the interview stage, and we do not move candidates between them. VISE has a fixed on-campus capacity planned around mentor bandwidth, hostel availability, and stipend allocation — once the shortlist is set, it stays set. VINS is not a consolation track. The project, the mentor, and the certificate are the same as VISE — what differs is the mode (online) and the absence of a fellowship. Many interns find the online format more effective. Your best path forward is to confirm your VINS start dates and get your NOC uploaded — you're already in a strong position."
      },
      {
        "q": "4.12 Can I change my internship dates after the offer letter?",
        "a": "No. Once your offer letter has been issued, the dates you confirmed are final. They will not be changed at this stage. If the confirmed dates do not work for you, please follow our LinkedIn page for announcements about future cohorts: linkedin.com/company/vicharanashala"
      }
    ]
  },
  {
    "category": "5. Work, mentorship, and projects",
    "description": "Details about the open-source projects, daily hours, mentorship structure, and hardware requirements.",
    "questions": [
      {
        "q": "5.1 What will I work on?",
        "a": "A real open-source project from Vicharanashala's portfolio — assigned based on your background and the lab's current needs. Areas range across AI/ML, web development, NLP, computer vision, agriculture-tech (Annam.AI), education-tech (ViBe), and open-source infrastructure. We do not pre-publish the exact problem; you choose to join knowing the lab will assign the project."
      },
      {
        "q": "5.2 How many hours per day?",
        "a": "Plan for 6 to 10 hours a day, sometimes more during the build phase. This is a full-time internship for the two-month window. Most candidates who drop out are juggling something else — VINS expects your full attention."
      },
      {
        "q": "5.3 Who is my mentor?",
        "a": "You will work with the lab's research and engineering team. The exact mentor depends on the project. The model is fluid — you will get help from a senior researcher one day, a peer the next, and someone else for a different question. That is how real open-source work happens."
      },
      {
        "q": "5.4 Is there a stipend?",
        "a": "No. The internship is unpaid. Stellar performers may be recognised with a discretionary stipend at the lab's option, but this is not promised or expected."
      },
      {
        "q": "5.5 Do I need my own laptop? Should I preload any software?",
        "a": "Yes — a personal laptop is required. We prefer that you bring a laptop running Linux or macOS. If you use Windows, please install a terminal that can SSH and run Unix-style commands — for example, Windows Subsystem for Linux (WSL) is a clean choice; a tool such as PuTTY also works. You will be SSH-ing into machines and using the command line as part of the work. We do not maintain a fixed software-preload list — your mentor will guide you on the specific tools needed once your project is assigned."
      },
      {
        "q": "5.6 I am using a different email on GitHub / Zoom / the learning platform. Is that okay?",
        "a": "No. Your registered email is your sole identifier across all programme platforms. Progress tracking, mentor assignment, and certificate issuance are all tied to it. Mismatches between platforms cannot be retroactively corrected — ensure you use your registered email everywhere from day one."
      },
      {
        "q": "5.7 Why has my mentor not been assigned yet, or contacted me on day 1?",
        "a": "Mentors are not assigned on day 1 of the internship. You will be assigned a mentor when you move on to the project phase of VINS, which comes later in the timeline. Before that, you must complete the mandatory coursework of the Bronze phase (see §1.3). Once coursework is complete and you are placed on a project, your mentor will reach out. If you are looking for a Discord server, please note: we do not run a Discord server. See §6.1 for the official communication channels."
      }
    ]
  },
  {
    "category": "6. Code of conduct — communication channels",
    "description": "Guidelines on official communication, expected behavior, and where to get support.",
    "questions": [
      {
        "q": "6.1 What are the official communication channels?",
        "a": "Official channels only. The Announcements section on samagama.in is how we notify you — all programme notifications are posted there (we no longer send notifications by email). Log in and check it regularly during working hours; sessions are announced at least 1 hour before they begin. To get help with a question or problem, follow this order: 1. Yaksha chat on samagama.in. This is the first place to bring any question or problem — start here and let Yaksha help. 2. Discussion forum. If Yaksha cannot resolve your matter, take it to the discussion forum. The link was sent to you in your sign-up (registration) email when you first created your account on samagama.in, and is also posted in the Announcements section. This is where you troubleshoot and discuss with your peers and the team. 3. Raise an issue. Only if the discussion forum does not resolve your issue — go to samagama.in/escalation and click Raise an issue. Describe what you tried at each prior step. A peer intern will answer and a senior will review before the reply reaches you. WhatsApp support is cancelled. There is no WhatsApp troubleshooting group. Not being on WhatsApp does not put you at any disadvantage — all information goes through the channels above. Unofficial groups are strictly prohibited. Creating, joining, or operating any WhatsApp group, Telegram channel, Discord server, or any other peer-coordinated space involving interns or a subset of interns — or contacting another intern through their personal phone number — is against the code of conduct. Any complaint or report of this will lead to the immediate termination of your internship. You may connect with fellow interns over LinkedIn and email."
      }
    ]
  },
  {
    "category": "7. Interviews Related",
    "description": "Help with interview status updates and data-sync issues on the dashboard.",
    "questions": [
      {
        "q": "7.1 My interview is not marked as complete on the dashboard — what do I do?",
        "a": "A data-sync issue sometimes occurs where the chat session closes but the interview record doesn't update to \"completed.\" The team will check your record and manually mark it as complete if needed. You will be unblocked within 1–2 hours. Apologies for the inconvenience. If you dont hear from us and if your interview continues to be marked incomplete please write to us on internship@vicharanashala.ai"
      }
    ]
  },
  {
    "category": "8. Certificate",
    "description": "Information about university grade reports, e-certificates, and the physical mode.",
    "questions": [
      {
        "q": "8.1 Does Vicharanashala send a grade report or evaluation to my university for internship credit?",
        "a": "Vicharanashala does not send formal evaluation or grade reports to universities — that process is between you and your college. The certificate issued upon completion is the document you can submit to your college or placement office for credit. Whether your college accepts it and how they translate it into a grade is their decision. If your college specifically requires a structured evaluation form or a report on your performance, raise that with them directly — we can provide the certificate and, if earned, a letter of recommendation, but we don't have a process for sending grade reports to universities."
      },
      {
        "q": "8.2 Does the Vicharanashala internship certificate specify whether it was completed online or offline ?",
        "a": "The certificate you receive on completing the internship is the same for both tracks. It is issued by Vicharanashala, IIT Ropar, and does not specify whether you completed it online or on campus. The certificate records only that you completed the internship; the mode is not called out separately on the document."
      },
      {
        "q": "8.3 Will the completion certificate be a physical hardcopy or an e-certificate?",
        "a": "The completion certificate is issued as an e-certificate — you download it from your dashboard on samagama.in after completing both Bronze and Silver. We do not print and mail physical copies. The certificate is digitally signed and authentic, so it cannot be duplicated. It can also be verified from our database using the number on the certificate."
      },
      {
        "q": "8.4 Is there a WhatsApp group for candidates during the internship?",
        "a": "No. See §6.1 for the official communication channels."
      }
    ]
  },
  {
    "category": "9. Rosetta — your internship journal",
    "description": "Everything you need to know about Rosetta, the daily reflection journal, and submission rules.",
    "questions": [
      {
        "q": "9.1 What is Rosetta?",
        "a": "Rosetta is your internship journal — a 65-day document, one entry per day, every day, for the full duration of Summership 2026. You write in it daily, keep it privately, and submit it at the end of the internship as one of your completion requirements. The name comes from the Rosetta Stone — discovered in 1799, it carried the same text in three scripts and became the key to decoding an ancient language that had been silent for centuries. Not because it was grand, but because it was honest and consistent. That is what this journal is meant to be for you. Sixty-five days of honest writing will become the key to understanding your own experience — what you learned, where you struggled, what shifted in you."
      },
      {
        "q": "9.2 Why does this exist? Is it just busywork?",
        "a": "No. It exists for two reasons. For you: Most people go through an intense experience and carry it without processing it. They finish and cannot articulate what they actually learned, what changed in them, or what they would do differently. The journal builds that articulation, one day at a time. Students who reflect regularly during a programme consistently get more out of it than those who do not — not because they work harder, but because they understand what they are doing and why. For us: When you submit Rosetta at the end, it gives us qualitative insight into your experience that no survey or evaluation can capture. We use it to understand what worked, what did not, and how to make the programme better for the next cohort. Your honest voice matters to that process."
      },
      {
        "q": "9.3 What is a \"thinking routine\"?",
        "a": "Each day in Rosetta has a thinking routine — a short framework that gives your reflection a specific shape. Instead of staring at a blank page and writing \"today was good,\" the routine gives you a specific lens. Examples: 3-2-1 — 3 things you engaged with, 2 questions on your mind, 1 surprise. Muddy / Clear — what is sharp, and what is still foggy. What? So What? Now What? — separate facts from meaning from action. The routines rotate across the 65 days so the journal does not feel repetitive or mechanical. Some will feel easy. Some will make you stop and actually think. That is the point. You do not need to research the routine or prepare for it. Just read the description at the top of each day's entry and write."
      },
      {
        "q": "9.4 How do I get my Rosetta journal?",
        "a": "The Rosetta template is here: Rosetta Journal — Summership 2026. Open the link, go to File -> Make a copy, save it to your own Google Drive, and rename it Rosetta — [Your Name] — Summership 2026. That copy is yours for the full duration of your internship. Do not write in the shared template. Always work in your own copy."
      },
      {
        "q": "9.5 How do I use it day to day?",
        "a": "Simple: 1. Open your Rosetta Google Doc. 2. Scroll to the entry for today's day number. 3. Fill in the date at the top of the entry. 4. Read the thinking routine name and its one-line description. 5. Answer the three prompts in the writing boxes below. 6. Close it and get on with your day. That is it. It should take between 10 and 20 minutes. It is not an essay. It is not a report. It is a journal."
      },
      {
        "q": "9.6 How long should each entry be?",
        "a": "There is no minimum or maximum word count. A good entry is one that is honest and specific. Three to five sentences per prompt is usually enough. If you find yourself writing more because something genuinely needs unpacking, write more. If a day was quiet and you genuinely only have two sentences, that is fine too. What is not acceptable: one-word answers, copy-pasted text, vague non-answers like \"today was productive,\" or anything that reads like it was generated by an AI."
      },
      {
        "q": "9.7 What is the one rule?",
        "a": "Write what is true. Not what sounds impressive. Not what you think we want to read. Not a polished summary of the day. If you hated today, write that. If you are confused and frustrated, write that. If something clicked and you are genuinely excited, write that. We will know immediately if an entry reads like an LLM wrote it. Do not do that. The journal only counts as a completion requirement if it is genuinely yours — in your voice, from your actual experience."
      },
      {
        "q": "9.8 Can I use ChatGPT or any AI tool to write my entries?",
        "a": "No. This is the one firm rule of Rosetta. The journal is a record of your thinking, not a demonstration of what an AI can produce on your behalf. Entries that read as AI-generated will not be counted toward your completion requirement. If your entire journal reads this way, the journal will not be accepted. Use AI tools for your technical work if that is permitted in the programme. Do not use them here."
      },
      {
        "q": "9.9 What if I miss a day?",
        "a": "Fill it in as soon as you can. Write the actual date you are filling it in, not the date of the missed entry. Be honest in the entry about the fact that you are writing it late and why. Do not leave entries blank. A late honest entry is always better than no entry. If you find yourself consistently missing entries, that is worth paying attention to. It usually means something else is going wrong. Use Yaksha in chat, or reach out to your scholar."
      },
      {
        "q": "9.10 Will anyone read my journal during the internship?",
        "a": "No. We will not access your journal during the 65 days. You write it, you keep it, it is yours. The only time we read it is after you submit it at the end of the internship. This is intentional — we want you to write freely, without feeling observed. The journal is only useful if it is honest, and it is only honest if you are not performing for an audience."
      },
      {
        "q": "9.11 Can the prompts change mid-internship?",
        "a": "Occasionally we may update a prompt for a specific day based on what is happening in the cohort — a major milestone, a collective challenge, or something the team wants to address directly. When this happens, we will announce it in the Announcements section on samagama.in before that day begins. Check the Announcements section before filling any entry where a change has been announced. If no announcement has been made, use the prompt as written in your document."
      },
      {
        "q": "9.12 How do I submit Rosetta at the end?",
        "a": "On or before Day 65, share your Rosetta Google Doc with the programme coordinator's email address (shared during wrap-up week). Set the sharing permission to Viewer. Make sure: Your name is in the document title — Rosetta — [Your Name] — Summership 2026. All 65 entries have been filled in. Your cover page has your name, product, and team filled in. Rosetta submission is one of the required criteria for receiving your internship certificate. An incomplete or AI-generated journal will not be accepted."
      },
      {
        "q": "9.13 I have a question about Rosetta that is not answered here. What do I do?",
        "a": "Ask Yaksha first. If Yaksha cannot answer it, escalate to your programme coordinator. Do not sit on a question — the journal works best when you start it right."
      },
      {
        "q": "9.14 My college requires a written confirmation that the internship is self-paced and will not clash with college classes — what document can I share with them?",
        "a": "This is not a self paced internship, but a very rigorous one which is time demanding. It is not permitted for one to be part of any other activity during this period."
      }
    ]
  },
  {
    "category": "10. Phase 1 — coursework, Vibe LMS, and live sessions",
    "description": "Instructions for completing AI fundamentals, ViBe platform registration, and mandatory live Zoom standups.",
    "questions": [
      {
        "q": "10.1 I've already completed a course (Vinternship, Pinternship, MERN, or AI) with you in an earlier cohort — am I exempt from repeating it?",
        "a": "Yes. If you completed the Vinternship, Pinternship, MERN, or AI course with us in an earlier cohort, you don't have to repeat it. Submit the exemption form and we'll exempt you from that course. What counts as \"completed\"? A course is treated as complete when your ViBe progress is above 95%. We've set the bar just below 100% so you're not chasing the last percentage point. We verify against your ViBe record before confirming. My progress is below 95% — can I still be exempted? No. Below 95% you'll need to finish the remaining portion on ViBe. Once you cross 95%, you're covered. I completed it somewhere else, not on ViBe with VLED — does that count? No. This exemption is only for courses you completed with us. If you're a first-timer confident in your fundamentals, the viva route is a separate option — check the coursework email for details. How will I know my exemption is approved? We verify submissions against ViBe and confirm on your dashboard. No action is needed from you after submitting. Exemption form: https://forms.gle/RWt1v22yVePyZXD79 > Note: Even if you're exempted from a course, live sessions and stand-ups remain mandatory for everyone, regardless of exemption status. No exceptions."
      },
      {
        "q": "10.2 How do I register for the AI Fundamentals course on Vibe?",
        "a": "Follow these steps: 1. Click the AI Fundamentals registration link posted in the Announcements section on samagama.in at Phase 1 launch. 2. You'll be redirected to the Vibe sign-in page. If you don't have a Vibe account yet, create one using the same Gmail you used to register on Samagama. 3. Log in with your credentials. 4. After logging in, open the course registration link again in your browser — the second click after login is what enrols you. 5. Complete the brief registration form and submit. 6. The course will appear instantly on your Vibe dashboard, ready to watch."
      },
      {
        "q": "10.3 I registered on Vibe with a different email than my Samagama email — is that OK?",
        "a": "Please use the same email on both platforms so we can match your Phase 1 progress to your internship record. The one exception: Vibe requires a Gmail address for signup. If the email you used on Samagama is not Gmail (e.g. a college email like @xyz.ac.in, @ds.study.iitm.ac.in), you may use any Gmail of yours to register on Vibe. In that case, tell Yaksha in your Samagama chat using the tag: `` #vibe-email your-gmail@gmail.com `` so we can link the records."
      },
      {
        "q": "10.4 Are live sessions mandatory if I'm on the viva route?",
        "a": "Yes — live sessions are mandatory for every intern, regardless of path. Whether you're on the coursework track, MERN-exempt (returning intern), or have cleared the viva and moved to Phase 2, you're expected to attend every live session. The exchange of knowledge across our cohort — diverse streams, varying levels of experience — is something self-paced study cannot replicate."
      },
      {
        "q": "10.5 When and how do I get the Zoom link for the kickoff meeting?",
        "a": "The kickoff orientation is held for the main summer cohort only — i.e., candidates starting at the opening of the May–July window. The Zoom link is delivered through two channels: Email to your registered samagama.in address. Your Yaksha chat portal — log in to samagama.in, open the chat, and the link is shown there. If your start date is later (mid-summer or beyond), there is no separate kickoff event for you. See §2.1 for the trade-offs that come with a later start. If you cannot register with the Zoom link or have not received it, log in to samagama.in and type #escalate in the chat with Yaksha — we will look at your specific case."
      },
      {
        "q": "10.6 How do I get the link for the daily Zoom standups? Are they mandatory?",
        "a": "Daily Zoom standup links are posted in the Announcements section on your samagama.in dashboard — look for the announcement bell at the top of the page. You are expected to check it daily before the session. Session links are posted at least 1 hour before they begin. We do not send separate emails for daily standups. The announcement on your dashboard is the only delivery channel for the daily link. Attending the daily standups is mandatory for all interns. This is a full-time summer internship programme, and the daily standup is the primary touchpoint where progress, blockers, and the day's plan are communicated. Missing standups is treated as missing work. Attendance and participation are tracked against strict thresholds — see §10.10. About the kickoff orientation. The kickoff orientation was held for the recommended 15 May cohort (see §10.5). Session recordings are not shared with interns who join late — see §2.6. If you joined late, you are expected to complete the orientation through a special proctored catch-up path on ViBe. The catch-up is entirely proctored and includes quizzes that check whether you have understood the content of the orientation session. Completing this catch-up is mandatory for late starters before participating in the regular standups."
      },
      {
        "q": "10.7 How do I provide my Zoom ID, and why does it matter?",
        "a": "On your dashboard, just before \"Start the internship,\" you'll see a step called \"Provide your Zoom ID.\" Enter the exact email address linked to your Zoom account — the one you use (or will use) to join the daily live sessions — and save it. This matters because we match your live-session attendance and participation using this email. If the Zoom ID you provide doesn't match the email you actually join Zoom with, your attendance won't be credited to you. So enter it carefully and be sure it is genuinely your Zoom account's email."
      },
      {
        "q": "10.8 I saved the wrong Zoom ID — can I change it?",
        "a": "Once saved, your Zoom ID is final and cannot be changed by you — please double-check before you submit. If you are certain you entered the wrong email, log in and tell us in the chat (type #escalate) with your correct Zoom email, and our team will review and correct it for you."
      },
      {
        "q": "10.9 Can we register and start the vibe courses before our internship date formally starts?",
        "a": "You will receive the viBE course link only after your internship starts. You can register and start the viBE courses related to the internship only after your internship formally starts."
      },
      {
        "q": "10.10 What are the attendance and participation rules?",
        "a": "Attendance and participation are tracked strictly, and all of the following are measured continuously over a rolling window of the last 5 working days: Live-session attendance — at least 85%. You must be present for at least 85% of the total Zoom meeting time. Live participation — at least 85%. You must respond to the in-session polls and quizzes at least 85% of the times they are run. Quizzes — attempted, and passed. Every quiz must be attempted, and your pass percentage must be at least 50%. Because this is a rolling 5-working-day measure, it reflects your recent engagement, not a one-time average. If any one of these three falls below its threshold, you will be excused from the current batch and moved to the next batch. This is not a penalty — it simply means you rejoin in a later batch where you can give the programme the full attention it needs."
      },
      {
        "q": "10.11 What are Spurti Points (SP)? Do they affect my internship?",
        "a": "Spurti Points are a platform feature that tracks your engagement with the programme. They are currently in an early beta phase — not used for any decisions about your standing. See Section 11 for the full SP FAQ."
      },
      {
        "q": "10.12 What are the live-session (Zoom) participation and conduct rules?",
        "a": "Treat every live session as a professional classroom. The following rules apply, and repeated non-compliance may result in removal from a session. Video & visibility. Keep your video on at all times unless explicitly permitted otherwise — participants with video off will be removed. Your face must be clearly visible — well-lit, centred in frame, and not rotated or partially cut off. A forehead-only view, poor lighting, or a sideways angle are not acceptable. Do not join from a mobile phone. Use a laptop or desktop. Audio & environment. Test your microphone and video using the platform's audio-test feature before the session begins — especially if you plan to speak. Be in a reasonably quiet, well-lit space so you can be seen clearly and participate when called upon. Conduct & attire. Dress code: business casuals or neat Indian casuals. Clothing inappropriate for a professional or classroom setting is not allowed. No multitasking. Talking on the phone or with people nearby, and any form of distraction or disengagement, may result in removal. Display name & profile picture. Display your full name — first and last. Nicknames or partial names are not acceptable. A professional, clearly identifiable profile picture is strongly recommended. This rule is enforced starting the next session (you have until then to update your display name and picture). Use your professional email account to join wherever applicable. Breaks & reconnection. For a short break (e.g. a restroom break), indicate \"BRB\" (Be Right Back) and return promptly. Prolonged absence may result in a permanent ban. Breaks are provided periodically — manage personal needs during them and avoid leaving during instructional segments. If your internet drops and you are moved to the waiting room, you will not be re-admitted. Ensure you have a stable connection — and ideally a backup — before joining. Waiting room. Do not call or message the Core Team for re-admission from the waiting room — doing so will result in an SP deduction. Speaking effectively. Keep responses concise — aim for two to three sentences. Rehearse before unmuting, and always test your mic and video beforehand if you plan to speak. Grounds for removal or a permanent ban: video off, joining from mobile, poor visibility, unprofessional attire, disengagement, extended unexplained absence, non-compliance with display-name/picture rules, or repeated violations of session guidelines."
      },
      {
        "q": "10.13 I got \"Failed to submit poll. Error: 100035000\" during a session — what does it mean, and will I lose poll credit?",
        "a": "This error appears when the poll closed before your response was submitted — either the timer ran out or there was a brief lag between your client and the host. What to do during the session: 1. Do not panic or leave the meeting. 2. If the poll window is still visible on your screen, wait a few seconds and try submitting again. 3. If the error persists and the poll has already closed, note the time and session date — you will need this when you report it. To reduce the chance of this happening: Submit your response as soon as the poll appears — do not wait until the last moment. Stay attentive throughout the session so you do not miss a poll opening. Keep a backup internet connection ready (e.g., mobile hotspot) in case your primary connection drops. Keep your Zoom app updated to the latest version before each session. Use the Zoom desktop or mobile app, not the browser — browser-based Zoom is significantly less reliable for polls."
      }
    ]
  },
  {
    "category": "11. Spurti Points",
    "description": "Learn about Spurti Points (SP), the beta engagement tracking system, and how participation is measured.",
    "questions": [
      {
        "q": "11.1 What are Spurti Points?",
        "a": "Spurti Points, or SP, are a points layer on the platform that reflects your overall engagement with the programme. Think of SP as an indicator of your engagement — nothing more. It is not a score that defines you as a student or determines your future in the programme."
      },
      {
        "q": "11.2 Is SP a finished system?",
        "a": "No. Spurti Points are still being actively built and refined. SP is best understood as a work in progress rather than a finalised grading or evaluation system. The rules and calculations may evolve as the programme develops."
      },
      {
        "q": "11.3 How much importance should I give to my SP number?",
        "a": "Please do not read too much into the number. SP is an early beta feature. It is meant to give you a broad sense of your engagement, not to measure your performance or determine outcomes."
      },
      {
        "q": "11.4 Can I be terminated or excused because of low SP?",
        "a": "No. The programme team will not terminate, excuse, or take any decision about any intern on the basis of Spurti Points alone. SP is not used as a basis for such decisions."
      },
      {
        "q": "11.5 What if my SP shows as zero or even negative?",
        "a": "There is genuinely no cause for concern. A zero or negative SP balance does not mean you are in trouble with the programme. Because SP is in an early beta phase, the number may not always reflect your actual effort or attendance accurately."
      },
      {
        "q": "11.6 Does a higher SP bring any benefits?",
        "a": "Yes, in a positive way. Interns who build up higher Spurti Points may, from time to time, become eligible for small perks or recognition from the programme team. Think of a higher SP as a pleasant upside to aim for. SP is not used to punish you for a low number or to decide your standing — the one exception is that a mentor may deduct SP for clearly non-compliant behaviour (for example, disrupting a live session or ignoring session conduct rules). That is a deliberate response to conduct, not the same as the beta number simply being low."
      },
      {
        "q": "11.7 If SP does not determine outcomes, what does?",
        "a": "Your attendance and live participation are what the programme watches closely and tracks strictly. A low SP number is not a cue to ease off. The programme has clear participation requirements that are monitored independently of SP (see §10.10 for the exact thresholds)."
      },
      {
        "q": "11.8 What are the participation requirements tracked strictly?",
        "a": "Looking at your most recent five working days on a rolling basis, every intern is expected to meet all three of the following: Stay present for at least 85% of the total live Zoom session time. Respond to at least 85% of the polls and quizzes run during the sessions. Attempt every quiz and clear each with a score of at least 50%. All three requirements apply simultaneously. Falling short on even one of them counts."
      },
      {
        "q": "11.9 What does \"rolling basis\" mean?",
        "a": "The programme does not look at a single average across the entire duration. Instead, it looks at your most recent five working days at any given point in time. As each new working day passes, the oldest day drops out and the newest day is added. This means your recent, consistent engagement is what counts — not a strong performance in one week followed by long absences. The window keeps moving forward."
      },
      {
        "q": "11.10 What happens if I fall below the required participation level?",
        "a": "If any one of the three participation requirements slips below the mark across your most recent five working days, you will be moved from the current batch into a later batch. This is not a termination or an excusal from the programme. It is a practical step so you can rejoin when you are able to give the programme your full attention. To rejoin, you must upload revised documents reflecting your new internship dates: 1. Update your internship dates on the dashboard to match your new batch window. 2. Upload a fresh NOC from your HOD covering the revised period — the dates on the NOC must match the dates on your dashboard exactly. Your previous NOC and confirmed dates are tied to the batch you were excused from and cannot be carried forward. A new offer letter will be issued once your revised documents are verified."
      },
      {
        "q": "11.11 How are Spurti Points calculated?",
        "a": "Every intern starts with a base of 100 SP credited on their official internship start date. SP is then earned through two live-session activities — attendance and poll participation — scored independently for every mandatory morning session: A. Attendance Time present (% of session window) SP earned 90% or more +10 SP 75% – 89% +5 SP 50% – 74% +3 SP Below 50% 0 SP B. Poll participation Polls answered (% of polls launched) SP earned 90% or more +10 SP 75% – 89% +5 SP 50% – 74% +3 SP Below 50% 0 SP A few things to note: Both A and B are scored per session and summed across all mandatory sessions attended since your start date. There is no penalty for absence — missing a session earns 0 for that day, not a deduction. Only mandatory morning standup / orientation sessions count. Breakouts, weekend specials, and evening sessions do not contribute to A or B. SP is updated daily. You can see your current balance and a full transaction history on the portal at samagama.in. Important: SP is a reward and recognition feature — it is not used by the programme team to judge your engagement, and it plays no role in excusal decisions. Excusal is determined from raw Zoom attendance logs, independently of SP. A low or zero SP number has no bearing on your standing in the programme."
      },
      {
        "q": "11.12 Can the programme team award or deduct SP directly?",
        "a": "Yes. In addition to the automatic daily rubric, programme team members can manually award or deduct Spurti Points at their discretion. This is used to: Recognise good behaviour — helping peers, exceptional contributions during sessions, or going above and beyond programme expectations. Acknowledge cohort-protocol adherence — following session etiquette, forum norms, or other community guidelines exceptionally well. Apply conduct deductions — as a deliberate response to disruptive or non-compliant behaviour (for example, repeatedly violating session conduct rules or pestering the core team unnecessarily). Every manual award or deduction is permanently logged in the SP ledger with the awarding team member's identity and a justification note. You can see all entries — including manual ones — in your SP transaction history on the portal. This does not change the excusal threshold. Excusal is determined solely from raw Zoom attendance logs. A manual SP deduction cannot lead to excusal; it is a recognition/conduct signal, not a standing decision."
      }
    ]
  },
  {
    "category": "12. Yaksha Chat Related",
    "description": "Troubleshooting the Yaksha chat interface on your dashboard.",
    "questions": [
      {
        "q": "12.1 I'm unable to type in the chat after clicking 'Interact with Yaksha' — what should I do?",
        "a": "The chat input is only active after you have clicked the \"Interact with Yaksha\" button. If you are still unable to type, scroll up to the top of the page — the button may be above the visible area. Click it once, and the chat field will become active."
      }
    ]
  },
  {
    "category": "13. ViBe Platform",
    "description": "Deep dive into using the ViBe platform, linear progression, proctoring rules, and technical troubleshooting.",
    "questions": [
      {
        "q": "13.1 How do I log in to ViBe?",
        "a": "Link for the website: https://vibe.vicharanashala.ai/auth. Sign up as a student with the registered mail ID into the ViBe platform. To log in to the ViBe platform, follow the steps below carefully: 1. Log in to the ViBe platform as a student from registered email ID 2. Check the \"Notifications\" tab in the Top right side of the Dashboard. 3. Accept the course invite sent for your respective MERN Course. Logging in with a different email ID may result in access issues or missing course visibility."
      },
      {
        "q": "13.2 Invite accepted but shows \"No course enrolled\"?",
        "a": "If you see \"No course enrolled\": Make sure you are logged in with the correct registered email ID. Check if your college email has multiple aliases and try the correct one. Log out and log in again once. Use personal wifi instead of college wifi as there might be some network restrictions of access. If the issue continues, please follow these steps: Step 1: Allow Third-Party Cookies. Enable Cookies in Chrome: Open chrome://settings/cookies. Turn OFF \"Block third-party cookies\" and turn ON \"Allow all cookies.\" Add Site Exception: Scroll to \"Sites that can always use cookies\" and click \"Add.\" Paste .vicharanashala.ai and ensure \"Including third-party cookies\"* is enabled. Restart browser. Step 2: Fix DNS (Most Important). Change your laptop DNS to Google DNS. Go to: Control Panel -> Network -> Active Network -> Properties -> IPv4. Shortcut: Win + R -> ncpa.cpl -> right-click properties. Set Preferred DNS to 8.8.8.8 and Alternate DNS to 8.8.4.4. Save. Step 3: Flush Old DNS Cache (it's safe). Open Command Prompt as Admin. Run the following commands: ipconfig /flushdns, ipconfig /release, ipconfig /renew, Restart WiFi."
      },
      {
        "q": "13.3 Why are videos stuck or repeating?",
        "a": "This may happen due to ViBe's monitored learning system. Common reasons include: Videos must be watched fully and in sequence (no skipping). Camera and microphone permissions must be enabled. Poor lighting or high background noise can affect playback. Switching tabs or staying idle may restart the video. For smooth playback, stay on the ViBe tab, keep your camera on, and watch videos in a quiet, well-lit environment."
      },
      {
        "q": "13.4 Can I use a mobile or tablet?",
        "a": "No, only desktop/laptop is supported."
      },
      {
        "q": "13.5 I'm experiencing video issues (stuck, looping, skipping) on ViBe. How do I troubleshoot?",
        "a": "Try these troubleshooting steps in order: 1. Refresh the page and check multiple times 2. Inspect browser console: Right-click -> Inspect -> Go to Network or Console tab -> Try watching the video and check for any visible errors 3. Log out and log in again 4. Use a different browser 5. Clear browsing data and cache, then try to re-login. If the issue persists after trying all steps, record the issue and contact Yaksha for any queries by mentioning #escalate-ViBe."
      },
      {
        "q": "13.6 I have completed all videos and quizzes in the ViBe course, but my progress is still showing less than 100%. What should I do?",
        "a": "Please do not worry. This might be a skip made in the quiz/video item due to penalty score as the quiz/video item might not have been successfully completed/marked. Please verify that you've completed all the course items (1006/1006). If not, please retry the missed contents again. In the meantime, you may try the following steps once: 1. Refresh your browser 2. Log out, clear your browser cache, and log in again"
      },
      {
        "q": "13.7 I feel the ViBe content or platform is not good or I am unhappy with the way progress is evaluated. Can I request an exception or bypass the system?",
        "a": "ViBe is built and continuously improved by interns and students themselves. It is a free and open-source learning platform, and our goal is to keep it that way by encouraging the community to actively contribute, improve, and strengthen it rather than bypass it. If a learner strongly feels that the regular ViBe flow does not fairly reflect their understanding, there is a formal alternative evaluation path. However, this path is intentionally rigorous to ensure fairness for everyone. In such cases, you will be asked to: Watch the specified YouTube video content completely (links will be provided). Appear for a three-hour proctored examination based only on that content. Write the exam under strict supervision with: Two cameras (front and side view), and One online human proctor monitoring you live. This examination becomes the sole basis for evaluation in place of the regular internship track. The scoring rules are strict: Score below 60%: You are considered not qualified and must join the next cohort and continue only through the normal ViBe mode. Score between 60% and 80%: You get one more chance in the next scheduled exam. Score above 80%: You are considered to have passed. This special exam is conducted once every fortnight, so choosing this route may significantly delay your progress compared to continuing normally on ViBe. Because this path is far more demanding and time-consuming than simply completing the regular videos, quizzes, and activities, most students find that continuing with the standard ViBe workflow is the faster and better option."
      },
      {
        "q": "13.8 Is the ViBe consent form compulsory? What if I don't want to grant camera access?",
        "a": "Yes — the consent form is compulsory. We would like to clearly inform you that providing consent is a mandatory requirement for any candidate enrolling in and continuing a course on the ViBe Learning Platform. The platform is designed with proctoring enabled throughout the learning process, which requires access to your webcam and microphone. This is essential to ensure: Fairness across all participants. Academic integrity. Active and genuine participation. If you choose not to grant camera and microphone access, you will not be able to proceed with the course, as proctoring is an integral part of the learning and evaluation workflow. Privacy & Monitoring Clarification. As outlined in the consent form: ViBe does not continuously record videos. Proctoring operates via real-time monitoring mechanisms during learning and assessments. All data is handled strictly in accordance with the stated consent terms and applicable data-protection guidelines. In short, consent is not optional — it is a core requirement for participation on the platform."
      },
      {
        "q": "13.9 What are penalty scores on the ViBe platform, and how do they affect our performance or HP?",
        "a": "Penalty scores are generated when anomalies are detected during your activity on the ViBe platform (for example, irregular behavior while watching video lessons or attempting quizzes). If the penalty score becomes high, you may be required to: Rewatch the video lesson, and Retake the associated quiz. At present, these penalty scores do not impact your HP (Health Points) or overall performance evaluation, as they are not being considered for scoring. Their primary purpose is to ensure proper engagement with the learning content."
      },
      {
        "q": "13.10 When should I use the Flag option on ViBe, and when should I contact support?",
        "a": "Use the Flag feature on ViBe only for course content-related issues, such as problems with video content or quiz questions. For technical issues, platform errors, login problems, or logistics-related queries, do not use the flag option. Instead, contact Yaksha so the team can assist you faster. Using the correct method helps resolve issues quickly and keeps the learning process smooth for everyone."
      },
      {
        "q": "13.11 What is Linear Progression on ViBe?",
        "a": "Linear progression is enabled for every course on ViBe. This means each learner must watch the videos and attempt the quizzes in the exact order they appear on the left panel of the course page. In practice: You cannot click on a video or quiz that lies far ahead of your current position. You must complete each item before the next one unlocks. Skipping videos or quizzes is not allowed by design. Progress is sequential — finish the item in front of you, and the next one opens up automatically."
      },
      {
        "q": "13.12 Can I use the left navigation panel to jump ahead to a later video or quiz?",
        "a": "No. Although the left navigation panel displays the full list of items in your course, it is meant only as a progress map — not as a jump-to-anywhere menu. Instead of clicking through the left panel: Click Next Quiz or Next Lesson as it appears on the right panel. Let the platform unlock items for you in sequence as you complete each one. Trying to skip ahead through the left panel will simply trigger the Access Restricted alert (see 13.13)."
      },
      {
        "q": "13.13 I am seeing a red \"Access Restricted\" banner. Is this a bug?",
        "a": "No, this is not a bug. The red Access Restricted banner is an intentional alert from the platform. The banner looks like this: a red toast notification with an exclamation icon, the title \"Access Restricted\", and the message \"Returning to previous valid content.\" below it. It appears when you try to open an item (video or quiz) before completing all the items that come before it. If you are on the nth item but haven't completed every video and quiz from item 1 through item n−1, the platform will show this alert. When the banner appears, ViBe automatically returns you to the previous valid content — that is, the last item you had legitimately reached in the sequence. You will not lose any progress; you'll simply be sent back to where you actually are in the course. It is the system gently telling you: \"Please check — there is something earlier in the course that you haven't finished yet.\""
      },
      {
        "q": "13.14 How do I resolve the \"Access Restricted\" error?",
        "a": "Follow these steps in order: 1. Go back to the left panel and scroll through your course items from the beginning. 2. Look for any item without a completion tick — that is your missed video or quiz. 3. Complete that item (watch the full video, or attempt and submit the quiz). 4. Refresh the page once you've completed all earlier items. 5. If the Access Restricted banner still appears after refreshing and you are sure all earlier items are completed, report the issue to Yaksha by mentioning #escalate-ViBe. In the large majority of cases, simply finding and completing the missed item clears the alert."
      },
      {
        "q": "13.15 Why does ViBe sometimes make me re-watch a clip after a quiz?",
        "a": "If your answer to the check-in quiz didn't go through correctly, ViBe will take you back to the same clip and let you try again. This is called a re-watch, and it is part of the design — not a penalty. A few things to keep in mind: Re-watches are not recorded against you. They do not affect your HP or evaluation. The clips are short, so a re-watch usually costs less time than guessing through multiple retries. Think of the re-watch as the platform helping the idea actually stick before you move on, rather than scolding you for getting it wrong."
      },
      {
        "q": "13.16 What kinds of quiz questions will I see on ViBe?",
        "a": "ViBe quizzes come in four formats: Pick one (MCQ) - One right answer out of four or so options. Pick one or more (MSQ) - \"Select all that apply\" — could be one correct option or several. Type a number (NAT) - A text box asking for a numeric value. True or False - A statement with only two options — True or False."
      },
      {
        "q": "13.17 Are the same proctoring rules applied to every course on ViBe?",
        "a": "No — and this is one of the most important things to understand before reading the rest of this section. ViBe's proctoring system is modular. Each individual check — face visibility, single-face-in-frame, lighting, background voices, gaze on screen, camera/microphone access — can be independently switched on or off by the instructor for a given course or cohort. This means: The instructor decides which proctoring elements are active for their course. Some courses may run with all checks active. Other courses may run with only a subset active. Certain pilot or open courses may have most proctoring relaxed."
      },
      {
        "q": "13.18 What does the \"quiet helper\" on ViBe actually do?",
        "a": "While a lesson plays, a small helper runs gently on your device using your camera and microphone. It checks, in real time, that the basic conditions for learning are present. Specifically, it looks at five things: 1. A face is visible. 2. Only one face is in frame. 3. There is enough light on your face. 4. The room isn't full of voices. 5. You are looking at the screen. The helper is not a judge. Brief, normal movements are absolutely fine. It only pays attention to sustained patterns, not split-second things."
      },
      {
        "q": "13.19 Does ViBe record long videos of me while I'm learning?",
        "a": "No. ViBe does not continuously record videos of you. The camera and microphone are used for real-time presence checks only. Long recordings of your face or voice are not stored. When the lesson ends, the helper goes quiet too. All data is handled strictly in accordance with the consent terms shown when you signed up."
      },
      {
        "q": "13.20 What is the single most common avoidable mistake learners make?",
        "a": "Sitting with a window directly behind you during the day. The room may feel bright to you, but your camera only sees a dark silhouette where your face should be. The helper then struggles to confirm your presence, and your lesson may pause or rewind. The fix is simple: move so the window is to your side or in front of the laptop, not behind you. A lamp placed in front of you works just as well in the evening."
      },
      {
        "q": "13.21 Why does the lesson keep pausing or restarting even when I'm paying attention?",
        "a": "If a clip keeps stopping or going back to the start, the cause is almost always something small in your environment, not the platform itself. Run through this checklist: Your face is too dark -> add a lamp in front of you. Your face is partly out of frame -> raise the laptop or sit a bit closer to the camera. There are voices in the background -> close the door, or move to a quieter room. You switched tabs or went idle -> stay on the ViBe tab; take breaks between clips, not during them. Camera or mic permission dropped -> check the lock icon in your browser's address bar and confirm both are set to \"Allow\"."
      },
      {
        "q": "13.22 Can I read the quiz questions aloud or mutter to myself while watching?",
        "a": "It's best not to. The microphone listens for sustained voices in the room, and reading aloud, muttering, or asking a roommate \"wait, what was that?\" can all be picked up as anomalies. The simple habit is: watch in silence, answer in silence, and chat freely during your breaks between clips."
      },
      {
        "q": "13.23 Can I study with a friend on camera since we're learning together?",
        "a": "In most courses, no. Only you — the registered Learner — should be in the camera frame during a lesson. The helper checks that exactly one face is visible at a time. Group study is genuinely a wonderful habit, just not inside a ViBe session itself. A good way to do it: Hop on a separate call with your friend on your phone or a second device. Discuss concepts before or after a ViBe lesson, not during it. Return to ViBe alone when you're ready to watch the clip and attempt the quiz."
      },
      {
        "q": "13.24 Will I lose my progress if I clear my browser or reinstall it?",
        "a": "No. Your progress is saved on the server, tied to your registered email — not on your browser or your computer. So: Refreshing the page, clearing cache, switching browsers, or even reinstalling your browser will not wipe your progress. The moment you log back in with the same registered email, all your completed clips and quizzes will be exactly where you left them."
      },
      {
        "q": "13.25 Is there a recommended daily learning rhythm on ViBe?",
        "a": "Yes — small, regular sessions work far better than long marathon sessions. A practical rhythm: Show up daily, even if only for thirty minutes. Take breaks between clips, not during them. Treat each quiz as a gentle check-in. For programmes with deadlines, aim for the daily progress target announced by your programme team."
      },
      {
        "q": "13.26 What should my \"study corner\" look like before I start a ViBe session?",
        "a": "A ViBe-friendly study spot needs only three things: 1. Light in front of your face — a lamp or window facing you, never behind. 2. Just you in the camera frame — ask family, friends, or pets not to wander through. 3. A reasonably quiet room — no TV, no music with words, no one else on a call nearby. Two minutes of setup before you start saves a lot of small frustrations during the lesson."
      },
      {
        "q": "13.27 I'm facing a technical issue on ViBe that I can't resolve. Is there live support available?",
        "a": "Yes. A Live Support Breakout Session is held every day at 2:00 PM. If you are facing any platform issue on ViBe — videos not loading, progress not updating, access errors, login problems, or anything else you cannot resolve on your own — join the breakout session and the support team will assist you in real time."
      }
    ]
  },
  {
    "category": "14. Team Formation",
    "description": "Rules and processes for forming teams during Phase 2, handling inactive members, and cross-college collaboration.",
    "questions": [
      {
        "q": "14.1 Is team formation compulsory?",
        "a": "Yes. All projects in Phase 2 and Phase 3 (some parts) must be completed in teams. Every participant is required to be part of a team."
      },
      {
        "q": "14.2 What is the size of a team?",
        "a": "The team size is fixed at four members. This is mandatory — you cannot have fewer or more members in a team at the time of final formation."
      },
      {
        "q": "14.3 How are teams formed?",
        "a": "For students who joined on May 15 and 16: Teams were formed through a structured activity. For students joining later: Teams will be randomly assigned by the administration."
      },
      {
        "q": "14.4 I started on May 15/16 but couldn't form a team during the activity. What happens now?",
        "a": "You will be randomly assigned to a team."
      },
      {
        "q": "14.5 There was a typo in our email addresses during team formation. Can we fix it?",
        "a": "No action is required from your side. The administration will verify and match email IDs with names before finalizing and locking teams."
      },
      {
        "q": "14.6 I formed a team with only two members. Will it be considered?",
        "a": "No. Teams with fewer than four members will be expanded by adding additional members to make a final team of four."
      },
      {
        "q": "14.7 What if a team member leaves or becomes ineligible during Phase 1?",
        "a": "The administration will attempt to assign a replacement member. If no replacement is found, you may continue as a team of three. You must inform the admin immediately, or the change will not be recognized."
      },
      {
        "q": "14.8 Can I form a team with someone from my own college?",
        "a": "No. Teams must consist of members from different institutions to encourage networking. Exception: Students from the same institution but different campuses/locations may be allowed."
      },
      {
        "q": "14.9 Can I form a team with students from my IIT MBS cohort?",
        "a": "No. You are encouraged to collaborate with participants outside your existing cohort."
      },
      {
        "q": "14.10 Can we change our team name after submission?",
        "a": "Yes, team names are tentative and can be changed. However, due to operational constraints, frequent changes are discouraged."
      },
      {
        "q": "14.11 What if multiple teams choose the same name?",
        "a": "Teams will be distinguished using suffixes (e.g., Team X-1, Team X-2, etc.)."
      },
      {
        "q": "14.12 What should I do if I face issues within my team?",
        "a": "Report any concerns immediately to your assigned scholar/mentor. Maintaining a safe and respectful environment is a priority."
      },
      {
        "q": "14.13 How will I know who my mentor is?",
        "a": "Your mentor will be the scholar assigned to the project your team is working on."
      },
      {
        "q": "14.14 When will I know my team details?",
        "a": "Team details are announced in the Announcements section on samagama.in. Log in and check regularly during working hours."
      },
      {
        "q": "14.15 I received a team list email but my name is not included. What should I do?",
        "a": "Team announcements are phased, so your name may appear in a later list. If your entire cohort has moved to team activities and you are still unassigned, raise the issue on Yaksha or contact a scholar."
      },
      {
        "q": "14.16 We selected Project X as our top priority but were assigned Project Y. Can we change it?",
        "a": "No. Project assignments are final and cannot be changed. Allocation is done to ensure balanced distribution across projects."
      },
      {
        "q": "14.17 I just started the internship. Can I form my own team now?",
        "a": "No. For later cohorts, teams will be randomly assigned. Please wait for the official communication."
      },
      {
        "q": "14.18 When do team activities begin?",
        "a": "Team-based work begins in Phase 2. During Phase 1 (online coursework), you do not need to worry about team activities."
      },
      {
        "q": "14.19 Can I request a specific teammate after teams are assigned?",
        "a": "No. Team assignments are final and requests for changes are not entertained."
      },
      {
        "q": "14.20 What happens if a team member is inactive or not contributing?",
        "a": "You should report the issue to your mentor/scholar early. Prolonged inactivity may lead to administrative intervention."
      },
      {
        "q": "14.21 Can I switch teams if there are conflicts?",
        "a": "Team switches are not allowed except in exceptional, admin-approved cases involving serious concerns."
      },
      {
        "q": "14.22 Will team performance affect individual evaluation?",
        "a": "Yes. While some components may be individual, team deliverables are a key part of evaluation."
      },
      {
        "q": "14.23 How will communication happen within teams?",
        "a": "Teams self-organise internal coordination over LinkedIn or email only, limited to their own team members. WhatsApp is not encouraged for team coordination — and it is not permitted to create a team WhatsApp group (a four-person project team is still a \"subset of interns\", which is prohibited under §6.1; a group of that form, if reported, will lead to immediate termination of the internship). Official programme updates continue to come through the Announcements section on samagama.in and Yaksha chat — see §6.1 for the full communication policy."
      },
      {
        "q": "14.24 What if I miss the team allocation announcement?",
        "a": "All programme updates are posted in the Announcements section on samagama.in. Log in and check regularly during working hours — this is the only channel for official notifications."
      },
      {
        "q": "14.25 Can a team be dissolved and reformed?",
        "a": "No. Once finalized, teams are locked and cannot be dissolved."
      },
      {
        "q": "14.26 What happens if I drop out of the internship?",
        "a": "Your team will be adjusted accordingly, and the remaining members may continue as a team of three or receive a replacement."
      },
      {
        "q": "14.27 Will we get time to get to know our teammates before Phase 2?",
        "a": "Yes. There is typically a buffer period before Phase 2 where teams can connect and prepare."
      }
    ]
  }
];
