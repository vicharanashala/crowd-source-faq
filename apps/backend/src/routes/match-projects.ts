import { Router } from 'express';
import MatchProject from '../modules/project/project.model.js';

const router = Router();

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/** 1 = identical, 0 = unrelated */
function similarity(a: string, b: string): number {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left.length || !right.length) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.max(0.82, 1 - Math.abs(left.length - right.length) / Math.max(left.length, right.length));
  }
  const distance = levenshteinDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function projectSkills(project: {
  roles?: { skillsRequired?: string[] }[];
  skills?: string[];
  techStack?: string[];
}): string[] {
  const fromRoles = (project.roles ?? []).flatMap((r) => r.skillsRequired ?? []);
  return [...fromRoles, ...(project.skills ?? []), ...(project.techStack ?? [])];
}

function bestSkillScore(userSkill: string, catalog: string[]): number {
  let best = 0;
  for (const skill of catalog) {
    const sim = similarity(userSkill, skill);
    if (sim > best) best = sim;
    if (best >= 0.999) return 1;
  }
  return best;
}

function serializeProject(project: Record<string, unknown>) {
  return {
    id: project._id,
    title: project.title,
    description: project.description,
    domain: project.domain,
    repoLink: project.repoLink,
    roles: project.roles ?? [],
  };
}

// GET /csfaq/api/projects
router.get('/', async (_req, res) => {
  try {
    const projects = await MatchProject.find({}).lean();
    res.status(200).json(projects.map((p) => serializeProject(p as Record<string, unknown>)));
  } catch (error) {
    console.error('List match projects failed:', error);
    res.status(500).json({ message: 'Unable to list projects right now.' });
  }
});

// POST /csfaq/api/projects/match
router.post('/match', async (req, res) => {
  try {
    const { selectedSkills, preferredDomain } = req.body as {
      selectedSkills?: unknown;
      preferredDomain?: unknown;
    };

    if (!Array.isArray(selectedSkills) || selectedSkills.some((s) => typeof s !== 'string')) {
      return res.status(400).json({ message: 'Invalid request format' });
    }

    const domain = typeof preferredDomain === 'string' ? preferredDomain : '';
    const projects = await MatchProject.find({}).lean();

    if (projects.length === 0) {
      return res.status(200).json({
        matches: [],
        domainDistribution: [],
        message: 'No projects in database.',
      });
    }

    const scored = projects.map((project) => {
      const skills = projectSkills(project);
      const blob = `${project.title} ${project.description} ${project.domain} ${skills.join(' ')}`.toLowerCase();

      const skillScope = selectedSkills.map((skill: string) => {
        const value = Math.round(bestSkillScore(skill, skills) * 100);
        return { skill, value };
      });

      const skillAvg =
        skillScope.length === 0
          ? 0
          : skillScope.reduce((sum, item) => sum + item.value, 0) / skillScope.length;

      let domainScore = 0;
      if (domain) {
        const domainSim = similarity(domain, String(project.domain ?? ''));
        const inText = blob.includes(domain.toLowerCase());
        if (inText || domainSim >= 0.92) domainScore = 100;
        else domainScore = Math.round(domainSim * 100);
      }

      // Skills dominate; domain is a meaningful but secondary signal.
      const score = Math.round(skillAvg * 0.7 + domainScore * 0.3);
      const matchedSkillsCount = skillScope.filter((s) => s.value >= 50).length;

      return {
        project,
        score,
        skillScope,
        matchedSkillsCount,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, 3);

    const domainCounts = new Map<string, number>();
    for (const project of projects) {
      const key = String(project.domain || 'Other');
      domainCounts.set(key, (domainCounts.get(key) ?? 0) + 1);
    }
    const domainDistribution = [...domainCounts.entries()].map(([name, count]) => ({
      name,
      count,
    }));

    res.status(200).json({
      matches: topMatches.map(({ project, score, skillScope, matchedSkillsCount }) => ({
        ...serializeProject(project as Record<string, unknown>),
        matchPercentage: Math.min(100, Math.max(0, score)),
        skillScope,
        matchedSkillsCount,
      })),
      domainDistribution,
    });
  } catch (error) {
    console.error('Match failed:', error);
    res.status(500).json({ message: 'Unable to fetch matches right now. Please try again later.' });
  }
});

export default router;
