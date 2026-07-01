import fs from 'fs';
import path from 'path';

const dir = './src';
const exts = ['.jsx']; // Restrict modifications to React component files

// Dictionary mapping your old custom CSS classes to their new Tailwind utility expansions
const replacements = {
  'btn-primary': 'inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-sage-600 text-white text-sm font-medium hover:bg-sage-700 active:bg-sage-800 transition-colors duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed',
  'btn-ghost': 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-ink/70 hover:bg-mist hover:text-ink transition-colors duration-150 ease-in-out',
  'input-field': 'w-full px-4 py-2.5 rounded-lg border border-black/12 bg-white text-sm text-ink placeholder-ink/40 focus:outline-none focus:ring-2 focus:ring-sage-400/50 focus:border-sage-400 transition duration-150',
  'badge-answered': 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sage-100 text-sage-800',
  'badge-unanswered': 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-mist text-ink/70',
  'source-badge-faq': 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700',
  'source-badge-community': 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700'
};

// Recursive function to traverse directories and process files
function walkDir(d) {
  // Using Sync methods is perfectly fine here since this is a one-off build/utility script, not a live web server
  const files = fs.readdirSync(d);
  
  files.forEach(file => {
    const p = path.join(d, file);
    
    // If it's a folder, dive deeper
    if (fs.statSync(p).isDirectory()) {
      walkDir(p);
    } 
    // If it's a target file type (.jsx), open and modify it
    else if (exts.includes(path.extname(p))) {
      let content = fs.readFileSync(p, 'utf-8');
      let modified = false;

      // 1. Iterate through the dictionary and replace standard class names
      for (const [key, val] of Object.entries(replacements)) {
        // Lookbehind regex: ensures the class name is preceded by `className="` or `className={` somewhere on the same line
        const regex = new RegExp(`(?<=className=["'\\\`].*?)\\b${key}\\b`, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, val);
          modified = true;
        }
        
        // 2. Handle specific edge cases where the class is a standalone string in a ternary operator (e.g., condition ? 'badge-answered' : '')
        const regexTernary = new RegExp(`'${key}'`, 'g');
        if (regexTernary.test(content)) {
          content = content.replace(regexTernary, `'${val}'`);
          modified = true;
        }
      }

      // 3. Handle 'card' specifically because it conflicts with 'shadow-card'
      // Requires strict matching of surrounding quotes/spaces so we don't accidentally replace part of another word
      const cardRegex1 = /className="card /g;
      if (cardRegex1.test(content)) {
        content = content.replace(cardRegex1, 'className="bg-white rounded-xl border border-black/6 shadow-card ');
        modified = true;
      }
      
      const cardRegex2 = /className="card"/g;
      if (cardRegex2.test(content)) {
        content = content.replace(cardRegex2, 'className="bg-white rounded-xl border border-black/6 shadow-card"');
        modified = true;
      }

      // 4. Only write to the disk if changes were actually made to save I/O time
      if (modified) {
        fs.writeFileSync(p, content, 'utf-8');
        console.log(`Updated ${p}`);
      }
    }
  });
}

// Execute the traversal
walkDir(dir);
