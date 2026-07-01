/**
 * ProgramSettings — v1.69
 *
 * One per Batch. Drives the program page's entire visual + content
 * composition: theme colors, hero copy, which sections render, and
 * branding strings. A program WITHOUT a ProgramSettings doc
 * (legacy / pre-feature data) gets the same `defaultSettings()`
 * factory output, so the public page never renders blank.
 *
 * Admin edits at /admin/programs/:id/settings. The page rebuilds
 * dynamically from the values here.
 */
import mongoose, { Schema as MongooseSchema } from 'mongoose';
/**
 * Default settings — used as the seed value for new programs and
 * as the fallback for programs that don't have a settings doc yet.
 * Matches the sage / cream / serif look used by the home portal.
 */
export function defaultSettings(batchId, batchName, batchDescription) {
    return {
        batchId,
        theme: {
            primaryColor: '#5a7a5a',
            accentColor: '#5a7a5a',
            background: 'cream',
            fontFamily: 'serif',
        },
        hero: {
            title: batchName,
            subtitle: batchDescription || 'Welcome to the program. Explore the resources below.',
            imageUrl: null,
            ctaText: 'Read the FAQs',
            ctaLink: '#faqs',
        },
        sections: {
            showStats: true,
            showFAQs: true,
            showCommunity: true,
            showZoom: true,
            showKB: true,
            sectionOrder: ['stats', 'faqs', 'community', 'zoom', 'kb'],
        },
        branding: {
            logoText: 'Yaksha FAQ',
            footerText: 'Vicharanashala Lab, IIT Ropar',
        },
    };
}
const programSettingsSchema = new MongooseSchema({
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        required: true,
        unique: true, // 1:1 with Batch
        index: true,
    },
    theme: {
        primaryColor: { type: String, default: '#5a7a5a', match: /^#[0-9a-fA-F]{6}$/ },
        accentColor: { type: String, default: '#5a7a5a', match: /^#[0-9a-fA-F]{6}$/ },
        background: { type: String, enum: ['cream', 'mist', 'ink'], default: 'cream' },
        fontFamily: { type: String, enum: ['serif', 'sans'], default: 'serif' },
    },
    hero: {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        subtitle: { type: String, default: '', maxlength: 600 },
        imageUrl: { type: String, default: null, maxlength: 2000 },
        ctaText: { type: String, default: null, maxlength: 60 },
        ctaLink: { type: String, default: null, maxlength: 2000 },
    },
    sections: {
        showStats: { type: Boolean, default: true },
        showFAQs: { type: Boolean, default: true },
        showCommunity: { type: Boolean, default: true },
        showZoom: { type: Boolean, default: true },
        showKB: { type: Boolean, default: true },
        // v1.69 — sectionOrder is the rendering sequence. Admins can
        // hide a section by setting its `show*` flag to false; they
        // can reorder by editing this array.
        sectionOrder: {
            type: [String],
            enum: ['stats', 'faqs', 'community', 'zoom', 'kb'],
            default: ['stats', 'faqs', 'community', 'zoom', 'kb'],
        },
    },
    branding: {
        logoText: { type: String, default: 'Yaksha FAQ', maxlength: 60 },
        footerText: { type: String, default: 'Vicharanashala Lab, IIT Ropar', maxlength: 200 },
    },
}, { timestamps: true });
export default mongoose.model('ProgramSettings', programSettingsSchema, 'yaksha_program_settings');
