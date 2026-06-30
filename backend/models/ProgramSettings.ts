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

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type BackgroundTone = 'cream' | 'mist' | 'ink';
export type FontFamily = 'serif' | 'sans';

export type SectionKey = 'stats' | 'faqs' | 'community' | 'zoom' | 'kb';

export interface IProgramTheme {
  primaryColor: string;
  accentColor: string;
  background: BackgroundTone;
  fontFamily: FontFamily;
}

export interface IProgramHero {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
}

export interface IProgramSections {
  showStats: boolean;
  showFAQs: boolean;
  showCommunity: boolean;
  showZoom: boolean;
  showKB: boolean;
  sectionOrder: SectionKey[];
}

export interface IProgramBranding {
  logoText: string;
  footerText: string;
}

export interface IProgramSettings extends Omit<Document, 'set' | 'get' | 'toObject' | 'toJSON' | '$assertPopulated' | '$clearModifiedPaths' | '$clone' | '$errors' | '$ignore' | '$isDefault' | '$isDeleted' | '$isEmpty' | '$isNew' | '$locals' | '$markValid' | '$model' | '$op' | '$parent' | '$populated' | '$raw' | '$session' | '$set' | '$where'> {
  batchId: Types.ObjectId;
  theme: IProgramTheme;
  hero: IProgramHero;
  sections: IProgramSections;
  branding: IProgramBranding;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Plain (POJO) type used for the API response and for the
 * `defaultSettings()` return value. Mongoose Documents are
 * technically assignable to this, but we keep the type separate so
 * the factory can return a plain object that matches the API
 * contract without dragging in mongoose Document methods.
 */
export type ProgramSettingsPlain = {
  batchId: Types.ObjectId;
  theme: IProgramTheme;
  hero: IProgramHero;
  sections: IProgramSections;
  branding: IProgramBranding;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Default settings — used as the seed value for new programs and
 * as the fallback for programs that don't have a settings doc yet.
 * Matches the sage / cream / serif look used by the home portal.
 */
export function defaultSettings(batchId: Types.ObjectId, batchName: string, batchDescription: string): ProgramSettingsPlain {
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

const programSettingsSchema = new MongooseSchema<IProgramSettings>(
  {
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      unique: true, // 1:1 with Batch
    },
    theme: {
      primaryColor: { type: String, default: '#5a7a5a', match: /^#[0-9a-fA-F]{6}$/ },
      accentColor:  { type: String, default: '#5a7a5a', match: /^#[0-9a-fA-F]{6}$/ },
      background:   { type: String, enum: ['cream', 'mist', 'ink'] as BackgroundTone[], default: 'cream' },
      fontFamily:   { type: String, enum: ['serif', 'sans'] as FontFamily[], default: 'serif' },
    },
    hero: {
      title:     { type: String, required: true, trim: true, maxlength: 200 },
      subtitle:  { type: String, default: '', maxlength: 600 },
      imageUrl:  { type: String, default: null, maxlength: 2000 },
      ctaText:   { type: String, default: null, maxlength: 60 },
      ctaLink:   { type: String, default: null, maxlength: 2000 },
    },
    sections: {
      showStats:     { type: Boolean, default: true },
      showFAQs:      { type: Boolean, default: true },
      showCommunity: { type: Boolean, default: true },
      showZoom:      { type: Boolean, default: true },
      showKB:        { type: Boolean, default: true },
      // v1.69 — sectionOrder is the rendering sequence. Admins can
      // hide a section by setting its `show*` flag to false; they
      // can reorder by editing this array.
      sectionOrder: {
        type: [String],
        enum: ['stats', 'faqs', 'community', 'zoom', 'kb'] as SectionKey[],
        default: ['stats', 'faqs', 'community', 'zoom', 'kb'],
      },
    },
    branding: {
      logoText:   { type: String, default: 'Yaksha FAQ', maxlength: 60 },
      footerText: { type: String, default: 'Vicharanashala Lab, IIT Ropar', maxlength: 200 },
    },
  },
  { timestamps: true }
);

export default mongoose.model<IProgramSettings>('ProgramSettings', programSettingsSchema, 'yaksha_program_settings');
