const { z } = require('zod');
const str = (max, min = 0) => z.string().trim().min(min).max(max);
const optStr = (max) => z.string().trim().max(max).optional().default('');
const enquiry = z.object({
  type: z.enum(['general', 'training', 'vehicle', 'parts', 'custom']).default('general'),
  name: str(120, 1), email: z.string().trim().email().max(200), phone: optStr(40),
  subject: optStr(200), message: str(5000, 1), website: z.string().max(0).optional(), // honeypot: must be empty
});
const career = z.object({
  name: str(120, 1), email: z.string().trim().email().max(200), phone: optStr(40),
  qualification: optStr(200), area: optStr(120), message: optStr(5000), website: z.string().max(0).optional(),
});
const login = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });
const enquiryUpdate = z.object({ status: z.enum(['new', 'pending', 'contacted', 'resolved']).optional(), notes: z.string().max(5000).optional() }).strict();
const applicationUpdate = z.object({ status: z.enum(['new', 'reviewing', 'shortlisted', 'rejected', 'hired']).optional(), notes: z.string().max(5000).optional() }).strict();
const CONTENT_KEYS = ['contact', 'ticker', 'facts', 'motto', 'services', 'research', 'why', 'values', 'careers', 'customFor', 'careerWhy', 'careerAreas', 'programmes', 'events', 'trainingBenefits', 'social', 'gallery', 'team', 'journey', 'vehicles', 'cats', 'parts'];
const okType = (v) => typeof v === 'string' || (v !== null && typeof v === 'object');
const contentBody = z.object({
  value: z.any().refine(okType, 'value must be an array, object or string').refine((v) => JSON.stringify(v).length < 1000000, 'value too large'),
  published: z.boolean().optional(),
}).strict();
module.exports = { enquiry, career, login, enquiryUpdate, applicationUpdate, contentBody, CONTENT_KEYS };
