import { z } from "zod";

export const experienceSchema = z.object({
  id: z.string(),
  role: z.string(),
  company_name: z.string(),
  start_date: z.string(), // "YYYY-MM-DD"
  end_date: z.string().nullable(), // null = atual
  description: z.string().nullable(),
});

export const educationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
});

export const certificationDocumentSchema = z.object({
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int(),
  uploaded_at: z.string(),
});

export const certificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string().nullable(),
  issued_date: z.string().nullable(),
  expiration_date: z.string().nullable(),
  document: certificationDocumentSchema.nullable(),
});

export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["hard", "soft"]),
});

export const professionalProfileSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  age: z.number(),
  email: z.string(),
  phone: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  summary: z.string().nullable(),
  photo_url: z.string().nullish(),
  experiences: z.array(experienceSchema),
  education: z.array(educationSchema),
  // Defaults to empty while a backend without certifications is deployed.
  certifications: z.array(certificationSchema).default([]),
  skills: z.array(skillSchema),
  // Absent while a backend without the US-20-T05 opt-in is deployed; the
  // profile then hides the automatic application section.
  accepts_automatic_application: z.boolean().optional(),
});

export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type CertificationDocument = z.infer<typeof certificationDocumentSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
