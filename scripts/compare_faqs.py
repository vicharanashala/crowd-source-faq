#!/usr/bin/env python3
"""Build faqs.json from the crawled endpoints.txt source."""
import json, re, sys, os

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)

SRC = os.path.join(_PROJECT_ROOT, 'endpoints.txt')
OUT = os.path.join(_PROJECT_ROOT, 'faqs.json')

with open(SRC) as f:
    content = f.read()

# ── Parse the crawled Q&A blocks ─────────────────────────────────────────────
BLOCK_RE = re.compile(r'^Q: (.+?)\nA: (.+?)$', re.MULTILINE | re.DOTALL)
matches = BLOCK_RE.findall(content)

faqs = []
for raw_q, raw_a in matches:
    q = raw_q.strip()
    a = raw_a.strip().split('\n')[0]  # first line of answer

    # Extract "1.2 Title" => (1, 2, "Title")
    m = re.match(r'^(\d+)\.(\d+)\s+(.+)', q)
    if not m:
        continue

    section_num = int(m[1])
    q_num = m[2]
    title = m[3].strip()

    # Derive category from section number (hard-coded mapping from live page)
    SECTION_NAMES = {
        1: 'About the internship',
        2: 'Timing and dates',
        3: 'NOC (No Objection Certificate)',
        4: 'Selection, offer letter, and certificate',
        5: 'Work, mentorship, and projects',
        6: 'Code of conduct — communication channels',
        7: 'Interviews Related',
        8: 'Yaksha Chat Related',
        9: 'Phase 1 — coursework, Vibe LMS, and live sessions',
        10: 'ViBe Platform',
        11: 'Rosetta — your internship journal',
        12: 'Certificate',
        13: 'Team Formation',
    }
    category = SECTION_NAMES.get(section_num, f'Section {section_num}')

    faqs.append({
        'id': f'{section_num}.{q_num}',
        'question': title,
        'answer': a,
        'category': category,
    })

# Sort by section then question number
faqs.sort(key=lambda f: (int(f['id'].split('.')[0]), int(f['id'].split('.')[1])))

print(f'Parsed {len(faqs)} FAQs from crawled source')

with open(OUT, 'w') as f:
    json.dump(faqs, f, indent=2, ensure_ascii=False)

print(f'Written to {OUT}')

# Spot-check
print('\nFirst 3:')
for faq in faqs[:3]:
    print(f'  [{faq["id"]}] {faq["question"][:60]}... | cat={faq["category"]}')
print('\nLast 3:')
for faq in faqs[-3:]:
    print(f'  [{faq["id"]}] {faq["question"][:60]}... | cat={faq["category"]}')

# Verify no duplicates
ids = [f['id'] for f in faqs]
dups = [i for i in ids if ids.count(i) > 1]
if dups:
    print(f'\n⚠️  Duplicate IDs: {set(dups)}')
else:
    print(f'\n✅ {len(faqs)} unique FAQs, no duplicates')