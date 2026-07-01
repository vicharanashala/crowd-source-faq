/**
 * CategoryCluster — Dynamic Categories feature (v1.70)
 *
 * Per-program clustering of FAQ `category` strings. The clusterer runs
 * every 24h (see utils/ai/categoryClusterer.ts) and groups similar
 * categories together using dot-product similarity on FAQ embeddings,
 * then asks Anthropic to generate a clean canonical name for each
 * cluster. The public search overlay and the admin Dynamic
 * Categories tab both read from this collection.
 *
 * Lifecycle:
 *   - 24h cron: deletes all non-locked rows for a batch, recomputes,
 *     inserts new clusters.
 *   - Admin: can rename a cluster's `canonicalName`, merge two
 *     clusters, or set `locked: true` to pin it from refresh.
 *   - First run after deploy: see scripts/backfillCategoryClusters.ts
 *     (backfills every active batch in one pass).
 *
 * Why dot product (not cosine): the FAQ embeddings are unit-normalized
 * at write time (see utils/ai/embeddings.ts → `normalize: true`),
 * so dot product IS cosine similarity. We use the same metric the
 * Atlas Vector Search index uses, so cluster results match what
 * users actually see as "similar" in search.
 */
import mongoose, { Schema as MongooseSchema } from 'mongoose';
const categoryClusterSchema = new MongooseSchema({
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        required: true,
        index: true,
    },
    canonicalName: { type: String, required: true, trim: true, maxlength: 120 },
    aliases: {
        type: [String],
        required: true,
        validate: {
            // Every cluster must have at least one alias — otherwise
            // it's just an empty bucket and should be deleted.
            validator: (v) => Array.isArray(v) && v.length > 0,
            message: 'A cluster must have at least one alias.',
        },
    },
    faqCount: { type: Number, required: true, default: 0, min: 0 },
    centroid: { type: [Number], default: [] },
    locked: { type: Boolean, default: false, index: true },
    lastRefreshedAt: { type: Date, default: Date.now, index: true },
    editedByAdmin: { type: Boolean, default: false },
}, { timestamps: true });
// "Show me the top clusters for program X, most FAQs first" — the
// admin tab and the search-overlay pill list both hit this.
categoryClusterSchema.index({ batchId: 1, faqCount: -1 });
// "Reverse-map a FAQ's category string to its cluster for program X"
// — InteractiveSearchOverlay's pills call this on every search.
categoryClusterSchema.index({ batchId: 1, aliases: 1 });
export default mongoose.model('CategoryCluster', categoryClusterSchema, 'yaksha_category_clusters');
