import { z } from 'zod';
import { selectionSchema } from '../db/schema';
export const aiIssueSchema = z.object({
  category: z.enum(['typography', 'hierarchy', 'brand', 'clarity', 'composition']),
  severity: z.enum(['suggestion', 'warning']), layerId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(120), explanation: z.string().trim().min(1).max(1000),
  recommendation: z.string().trim().min(1).max(800),
}).strict();
export const aiReviewSchema = z.object({ summary: z.string().trim().min(1).max(1000), issues: z.array(aiIssueSchema).max(12) }).strict();
export type AiReview = z.infer<typeof aiReviewSchema>;
export const reviewRecordSchema = z.object({
  id: z.string().uuid(), creativeId: z.string().uuid(), fingerprint: z.string().max(20000),
  reviewedAt: z.string().datetime(), language: z.enum(['en', 'ar']), model: selectionSchema,
  source: z.enum(['gemini','meta']), review: aiReviewSchema,
}).strict();
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
export const ruleCodes = ['bounds', 'text_clipped', 'copy_missing', 'contrast', 'logo_overlap', 'asset_missing', 'dimensions', 'measurement_unavailable', 'contrast_unavailable','meta_ui_occlusion','logo_product_overlap','mixed_scripts','direction_mismatch','cta_off_brand'] as const;
export type RuleCode = typeof ruleCodes[number];
export type Finding = { id: string; code: RuleCode; severity: 'error' | 'warning' | 'info'; layerIds: string[]; evidence: Record<string, string | number> };
export type TextMetrics = Record<string, { neededHeight: number; unrenderable: boolean }>;
export type RuleResult = { issues: Finding[]; checks: { key: 'bounds' | 'text' | 'copy' | 'contrast' | 'overlap' | 'assets' | 'dimensions' | 'brand'; status: 'pass' | 'fail' | 'partial' }[] };
