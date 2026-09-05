import fs from 'fs';
import path from 'path';

const faqPath = path.join(process.cwd(), 'src', 'faqs.json');
const content = fs.readFileSync(faqPath, 'utf-8');
const parsed = JSON.parse(content);
const faqs = Array.isArray(parsed) ? parsed : (parsed.faqs || []);

console.log(`Loaded ${faqs.length} FAQs`);
console.log('Sample FAQ:', JSON.stringify(faqs[0], null, 2));

const sections = new Set(faqs.map((f: any) => f.section));
console.log('Unique Sections:', [...sections]);
const categories = new Set(faqs.map((f: any) => f.category));
console.log('Unique Categories:', [...categories]);
