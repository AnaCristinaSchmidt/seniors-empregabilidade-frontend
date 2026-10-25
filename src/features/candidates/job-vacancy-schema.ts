import { z } from "zod";

export const jobApplicationSchema = z.object({
  id: z.uuid(),
});

export type JobApplication = z.infer<typeof jobApplicationSchema>;
