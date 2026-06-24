import fs from 'fs';
import path from 'path';

const filesToUpdate = [
  "src/components/UserDashboard.tsx",
  "src/components/AdminPanel.tsx",
  "src/components/FAQSystem.tsx",
  "src/components/YakshaMini.tsx",
  "src/components/ExploreDashboard.tsx"
];

for (const file of filesToUpdate) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) continue;

  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (!content.includes('fetchWithAuth')) {
    content = 'import { fetchWithAuth } from "../utils/api.js";\n' + content;
  }
  
  content = content.replace(/fetch\("\/api\//g, 'fetchWithAuth("/api/');
  content = content.replace(/fetch\(\`\/api\//g, 'fetchWithAuth(`/api/');
  
  // also handle translating the translate-faq route correctly
  content = content.replace(/\/api\/translate-faq/g, '/api/faqs/translate');

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated ${file}`);
}
