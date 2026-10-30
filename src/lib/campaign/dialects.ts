import { z } from 'zod';

/**
 * The copy dialects the planner writes in. Arabic dialects keep the
 * creative language Arabic; English keeps it English. The example lines are
 * fixed samples of the tone (not model output), shown as a preview.
 */
export const PLAN_DIALECTS = ['ar_eg', 'ar_gulf', 'ar_lev', 'ar_sd', 'ar_msa', 'en'] as const;
export const planDialectSchema = z.enum(PLAN_DIALECTS);
export type PlanDialect = z.infer<typeof planDialectSchema>;

export const DIALECT_PROMPT: Record<PlanDialect, string> = {
  ar_eg: 'Egyptian Arabic (Masri), warm and everyday, as an Egyptian shop owner would talk',
  ar_gulf: 'Gulf Arabic (Khaleeji), as spoken in Saudi Arabia, the UAE and Kuwait',
  ar_lev: 'Levantine Arabic (Shami), as spoken in Syria, Lebanon, Jordan and Palestine',
  ar_sd: 'Sudanese Arabic, as spoken in Khartoum',
  ar_msa: 'Modern Standard Arabic (Fusha), clear and formal',
  en: 'plain, friendly English',
};

export const DIALECT_EXAMPLE: Record<PlanDialect, string> = {
  ar_eg: 'طعمه هيعجبك من أول بُق!',
  ar_gulf: 'طعمه يونّس من أول رشفة!',
  ar_lev: 'طعمته رح تعجبك من أول لقمة!',
  ar_sd: 'طعمو بيعجبك من أول مرة!',
  ar_msa: 'مذاق سيعجبك من أول تجربة!',
  en: 'You will love it from the first sip!',
};

export function dialectLanguage(dialect: PlanDialect): 'ar' | 'en' {
  return dialect === 'en' ? 'en' : 'ar';
}
