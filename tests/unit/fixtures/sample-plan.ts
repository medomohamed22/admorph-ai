// A fixed, valid three-idea plan for planner tests (it used to ship as the app's local sample).
import { planSchema, type Campaign, type Plan } from '../../../src/lib/campaign/schema';

export function samplePlan(campaign: Campaign): Plan {
  const name = campaign.brandSnapshot.name;
  return planSchema.parse({ concepts: campaign.creativeLanguage === 'ar' ? [
    { angle: 'offer', title: 'دعوة للاكتشاف', audienceAngle: 'عملاء يكتشفون العلامة للمرة الأولى', headline: `اكتشف ${name} عن قرب`, caption: `تعرّف على ${name} واختر ما يناسب يومك. اكتشف التفاصيل قبل اتخاذ قرارك.`, visualDirection: 'صورة المنتج واضحة في المنتصف، مع مساحة لعنوان قصير وزر اكتشاف. دون خصم أو سعر غير مؤكّد.' },
    { angle: 'benefit', title: 'تفاصيل تصنع الفرق', audienceAngle: 'عملاء يبحثون عن ملاءمة المنتج لاحتياجاتهم', headline: 'اقترب من التفاصيل المهمة', caption: 'تأمل تفاصيل المنتج واختر ما يلائم احتياجاتك. اجعل المعلومات الواضحة بداية قرارك.', visualDirection: 'لقطة أقرب للمنتج مع ثلاث مساحات لمزايا موثّقة يضيفها صاحب العلامة، وألوان هادئة.' },
    { angle: 'lifestyle', title: 'مكان في روتينك', audienceAngle: 'أشخاص يهتمون بروتين يومي يناسب أسلوب حياتهم', headline: 'لحظة تخص يومك', caption: `تخيّل مكان ${name} في روتينك. بداية بسيطة لقصة أقرب إلى أسلوبك.`, visualDirection: 'مشهد يومي بسيط بخلفية دافئة والمنتج في المقدمة، مع الحفاظ على الشعار والنص كعناصر قابلة للتعديل لاحقًا.' },
  ] : [
    { angle: 'offer', title: 'An invitation to discover', audienceAngle: 'First-time visitors exploring the brand', headline: `Meet ${name} up close`, caption: `Get to know ${name} and explore the details before choosing what fits your day.`, visualDirection: 'A clear central product photo, a concise discovery headline and one invitation to learn more. Do not invent a discount or price.' },
    { angle: 'benefit', title: 'Details that matter', audienceAngle: 'Considered buyers looking for product fit', headline: 'A closer look at the details', caption: 'Explore the product details and decide what matches your needs. Start with clear information, then make it yours.', visualDirection: 'A closer crop of the product, calm brand colors and three placeholders for owner-verified benefits.' },
    { angle: 'lifestyle', title: 'A place in your routine', audienceAngle: 'People imagining how the product fits everyday life', headline: 'Make room for your moment', caption: `Imagine ${name} in a routine that feels like you. A simple starting point for an everyday story.`, visualDirection: 'A quiet everyday setting with the product in the foreground, warm negative space and editable typography to be added later.' },
  ] });
}

/** A minimal valid two-layer creative for a concept, for storage and backup tests. */
export function sampleCreative(campaign: Campaign, conceptId: string, productAssetId: string) {
  const now = new Date().toISOString();
  const base = { fontFamily: 'Inter' as const, fontSize: 40, visible: true, color: '#111111', fill: 'transparent' as const };
  return {
    id: crypto.randomUUID(), campaignId: campaign.id, conceptId, caption: 'Sample caption', source: 'composition' as const, model: null, inputRevision: 0, createdAt: now, updatedAt: now,
    layers: [
      { ...base, id: crypto.randomUUID(), kind: 'product' as const, x: 220, y: 510, width: 640, height: 590, text: '', assetId: productAssetId },
      { ...base, id: crypto.randomUUID(), kind: 'headline' as const, x: 75, y: 205, width: 930, height: 265, text: 'Sample headline', assetId: null },
    ],
  };
}
