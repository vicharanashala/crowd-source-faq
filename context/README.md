# Context Folder Index

Audit of the Yaksha FAQ Portal (Shamagama) codebase using CodeGraphContext MCP.

## Files

### codebase-audit.md
Full codebase audit with:
- Directory structure (backend + frontend)
- All 21 controllers with complexity ratings
- 12 route files catalogued
- 17 models described
- 3 services with complexity scores
- 26 utilities catalogued
- Frontend pages by complexity (PostDetailDialog CC=164 highest)
- Key system features: escalation, time-trial, freshness, AI duplicate detection, SpillTheTea, Zoom, promotion, search
- High-complexity function list (>15 cyclomatic complexity)
- Dead code list (potentially unused functions)
- Environment variables reference
- Admin user info

### routes-reference.md
Complete API routes reference for all 12 route files:
- All endpoints with HTTP methods
- Controller function mapping
- Middleware stack (auth, admin)
- Public vs protected routes

### database-schema.md
MongoDB schema reference for all collections:
- Full field listing with types and defaults for all 17 collections
- Index definitions including compound and unique indexes
- TTL policy on search_logs (90-day)
- All enum values documented

## Key Stats
- **Files indexed**: 117
- **Functions**: 354
- **Classes**: 3
- **Modules**: 83
- **Backend**: Express.js on port 6767, MongoDB on cluster0.z3cgb58
- **Frontend**: React + Vite + TailwindCSS on port 5173

## High-Complexity Warning
The following components should be refactored when possible:
- `PostDetailDialog.tsx` (CC 164) - 600+ lines
- `CommunityPage.tsx` (CC 121)
- `ThreadDetail.tsx` (CC 91 for both CommentNode and ThreadDetail)
- `getAllPosts` in postController.ts (CC 49)