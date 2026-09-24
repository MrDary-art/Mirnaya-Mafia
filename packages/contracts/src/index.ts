import { z } from "zod";

export const metricsSchema = z.object({
  trust: z.number().min(0).max(100), goal: z.number().min(0).max(100),
  control: z.number().min(0).max(100), eq: z.number().min(0).max(100),
});
export type Metrics = z.infer<typeof metricsSchema>;
export const actionSchema = z.object({
  requestId: z.uuid(),
  type: z.enum(["say", "ask", "provide", "calculate", "record_agreement"]),
  optionId: z.string().min(1).max(100).optional(),
  itemId: z.string().max(100).optional(),
});
export type TrainingAction = z.infer<typeof actionSchema>;
export const prepareSchema = z.object({
  goal: z.string().max(300).optional(),
  itemIds: z.array(z.string().max(100)).max(5).default([]),
});
export type PrepareInput = z.infer<typeof prepareSchema>;
export const sessionSchema = z.object({ scenarioId: z.string().min(1).max(100), retryOf: z.string().uuid().optional(),hiddenGoal:z.boolean().default(false),chaos:z.boolean().default(false),pressureSeconds:z.union([z.literal(30),z.literal(60)]).optional() }).strict();
export type SessionInput = z.infer<typeof sessionSchema>;
export const hiddenGuessSchema=z.object({optionIndex:z.number().int().min(0).max(10)}).strict();
export const chaosResponseSchema=z.object({requestId:z.uuid(),optionIndex:z.number().int().min(0).max(4)}).strict();
export const learningAttemptSchema = z.object({levelId:z.string().min(1).max(40)}).strict();
export const learningAnswerSchema = z.object({optionId:z.uuid()}).strict();
export const aiSessionSchema = z.object({
  mode:z.enum(["negotiation","interview"]),scenarioId:z.string().max(100).optional(),
  userName:z.string().trim().max(80).optional(),userRole:z.string().trim().max(100).optional(),opponentRole:z.string().trim().max(100).optional(),
  problem:z.string().trim().max(1000).optional(),goal:z.string().trim().max(500).optional(),
  character:z.enum(["neutral","supportive","skeptical","demanding","aggressive"]).default("neutral"),
  level:z.enum(["beginner","intermediate","advanced"]).default("intermediate"),
  difficulty:z.number().int().min(1).max(5).default(2),
  industry:z.string().trim().max(100).optional(),companySize:z.string().trim().max(100).optional(),culture:z.string().trim().max(200).optional(),
  company:z.string().trim().max(150).optional(),position:z.string().trim().max(150).optional(),
}).strict();
export const aiTurnSchema = z.object({text:z.string().trim().min(1).max(2000)}).strict();
export const aiPresetSchema=z.object({name:z.string().trim().min(1).max(80),setup:aiSessionSchema}).strict();
export const directMessageSchema = z.object({text:z.string().trim().min(1).max(2000)}).strict();
export const roomCreateSchema = z.object({mode:z.enum(["human","duel"]),problem:z.string().trim().min(3).max(1000),goal:z.string().trim().min(3).max(500),inviteeId:z.uuid().optional(),scheduledAt:z.iso.datetime().optional(),durationMinutes:z.union([z.literal(15),z.literal(30),z.literal(60)]).default(15)}).strict();
export const roomJoinSchema = z.object({code:z.string().trim().min(4).max(16)}).strict();
export const roomFinishSchema = z.object({outcome:z.enum(["agreement","no_agreement"]).optional()}).strict();
export const roomSignalSchema = z.object({kind:z.enum(["offer","answer","candidate"]),data:z.record(z.string(),z.unknown())}).strict();
export const theoryAnswerSchema = z.object({exerciseId:z.string().min(1).max(60),optionId:z.uuid()}).strict();
export const shopItemSchema = z.object({itemCode:z.string().min(1).max(60)}).strict();
export const skillAnswerSchema = z.object({optionId:z.uuid().optional(),answer:z.string().trim().min(1).max(1000).optional()}).strict();
export const activityQuerySchema=z.object({type:z.enum(["all","scenario","learning","ai","room"]).default("all"),state:z.enum(["all","active","finished"]).default("all")}).strict();
