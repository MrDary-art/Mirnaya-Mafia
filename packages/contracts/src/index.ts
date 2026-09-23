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
export const sessionSchema = z.object({ scenarioId: z.string().min(1).max(100), retryOf: z.string().uuid().optional() });
export type SessionInput = z.infer<typeof sessionSchema>;
