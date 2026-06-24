import SearchLog from '../../models/SearchLog.js';
import GlobalAlert from '../../models/GlobalAlert.js';
import { chatWithProvider, resolveActiveAiConfig } from './aiProvider.js';
import { DBSCAN } from 'density-clustering';
import { cronLog } from '../http/logger.js';

/**
 * frictionClusterer.ts
 * Feature: Predictive Friction Clusters
 * Author: Mayank Garg (gargmayank1805@gmail.com)
 * Description: Background job to detect spikes in semantically similar search queries and generate zero-day incident alerts.
 */

const VELOCITY_THRESHOLD = 5; // Minimum queries in a cluster to trigger alert
const TIME_WINDOW_MINUTES = 30; // Look at last 30 minutes
const EPSILON = 0.65; // Euclidean distance for normalized vectors (approx 0.78 cosine sim)

/**
 * Runs DBSCAN clustering on recent search queries.
 * If a dense cluster is found that isn't already active, generates a GlobalAlert.
 */
export async function runFrictionClusterer() {
  try {
    cronLog.info('frictionClusterer', { action: 'start' });
    
    const cutoff = new Date(Date.now() - TIME_WINDOW_MINUTES * 60 * 1000);
    
    // Fetch recent searches that have embeddings
    const recentLogs = await SearchLog.find({
      createdAt: { $gte: cutoff },
      embedding: { $exists: true, $not: { $size: 0 } }
    }).select('query embedding').lean();

    if (recentLogs.length < VELOCITY_THRESHOLD) {
      cronLog.info('frictionClusterer', { action: 'skip_low_volume', count: recentLogs.length });
      return;
    }

    // Deduplicate exact matches to prevent 1 person spamming from triggering it alone,
    // or just rely on the pure number. We will use all of them, but we might want to group by query string
    // Actually, DBSCAN works better with raw points.
    const dataset = recentLogs.map(log => log.embedding as number[]);
    const queries = recentLogs.map(log => log.query);

    const dbscan = new DBSCAN();
    // EPSILON is the neighborhood radius. MINPTS is the minimum points to form a cluster.
    const clusters = dbscan.run(dataset, EPSILON, VELOCITY_THRESHOLD);

    if (clusters.length === 0) {
      cronLog.info('frictionClusterer', { action: 'no_clusters_found' });
      return;
    }

    cronLog.info('frictionClusterer', { action: 'clusters_found', count: clusters.length });

    // Process each cluster
    for (const clusterIndices of clusters) {
      try {
        const clusterQueries = Array.from(new Set(clusterIndices.map((idx: number) => queries[idx]))) as string[];
        
        // If the cluster has less than threshold unique queries, maybe skip? 
        // No, let's just trigger based on total volume.
        
        // Check if we already have an active alert with similar queries
        // A simple heuristic: if any active alert shares >30% of its clusterQueries with this one, skip it.
        const activeAlerts = await GlobalAlert.find({ isActive: true }).lean();
        let alreadyActive = false;
        for (const alert of activeAlerts) {
          const intersection = clusterQueries.filter(q => (alert.clusterQueries as string[]).includes(q));
          if (intersection.length > 0) {
            alreadyActive = true;
            break;
          }
        }

        if (alreadyActive) {
          cronLog.info('frictionClusterer', { action: 'cluster_already_active_alert' });
          continue;
        }

        // Generate Alert via LLM
        const prompt = `You are an incident response AI for an educational platform.
A sudden spike of similar search queries has occurred in the last ${TIME_WINDOW_MINUTES} minutes.
Your job is to identify the underlying issue and generate a public warning banner.

Recent Queries:
${clusterQueries.map(q => "- " + q).join('\n')}

Based on these queries, write a short, professional incident Title (max 6 words) and a 1-2 sentence Description to warn users that we are aware of the issue.

Return ONLY a JSON object in this format (no markdown formatting, just raw JSON):
{
  "title": "...",
  "description": "..."
}`;

        const cfg = await resolveActiveAiConfig().catch(() => null);
        const anthropicModel = cfg?.anthropic?.model?.trim() || 'claude-sonnet-4-20250514';

        const aiResponse = await chatWithProvider(
          'anthropic',
          [{ role: 'user', content: prompt }],
          anthropicModel
        );
        if (!aiResponse) continue;

        let parsed;
        try {
          const match = aiResponse.match(/\{[\s\S]*\}/);
          if (!match) throw new Error("No JSON object found in LLM response");
          parsed = JSON.parse(match[0]);
        } catch (e) {
          cronLog.error('frictionClusterer', { action: 'llm_parse_error', raw: aiResponse });
          continue;
        }

        const alert = new GlobalAlert({
          title: parsed.title || 'Service Degradation Detected',
          description: parsed.description || 'We are experiencing an unusually high volume of queries regarding a specific issue.',
          severity: 'warning',
          isActive: true,
          clusterQueries: clusterQueries,
        });

        await alert.save();
        
        cronLog.info('frictionClusterer', { action: 'alert_created', title: alert.title });
        
        // Removed spillTheTea as this is a different system
      } catch (innerError) {
        cronLog.error('frictionClusterer', { action: 'cluster_process_error', error: (innerError as Error).message });
        continue;
      }
    }

  } catch (error) {
    cronLog.error('frictionClusterer', { action: 'error', error: (error as Error).message });
  }
}
