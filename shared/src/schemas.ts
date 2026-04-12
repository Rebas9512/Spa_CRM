import { z } from 'zod'
import { MASSAGE_TYPES, GENDER_OPTIONS } from './constants'

const massageTypeValues = MASSAGE_TYPES.map((t) => t.value) as [string, ...string[]]
const genderValues = GENDER_OPTIONS.map((g) => g.value) as [string, ...string[]]

// --- Phone ---
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().min(10).max(11))

// --- Auth ---
export const registerSchema = z.object({
  inviteCode: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// --- Intake Form Data ---
export const intakeFormDataSchema = z.object({
  // Health checkboxes
  hasSpinalProblems: z.boolean(),
  hasAllergies: z.boolean(),
  hasHighBloodPressure: z.boolean(),
  hasBruiseEasily: z.boolean(),
  hasVaricoseVeins: z.boolean(),
  hasMigraines: z.boolean(),
  hasHeartConditions: z.boolean(),
  hasInjuries: z.boolean(),

  // Pregnancy
  isPregnant: z.boolean(),
  pregnancyDueDate: z.string().nullable(),

  // Medical notes
  medicalNotes: z.string(),

  // Massage preferences
  preferredMassageType: z.enum(massageTypeValues),
  areasOfPainTension: z.string(),
  areasToAvoid: z.string(),

  // Minor
  isMinor: z.boolean(),
  guardianName: z.string().nullable(),
  guardianSignatureDataUrl: z.string().nullable(),

  // Consent
  consentAcknowledged: z.boolean(),
  clientSignatureDataUrl: z.string(),
})

// --- Create Customer (new client intake) ---
export const createCustomerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: phoneSchema,
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  dateOfBirth: z.string().min(1),
  gender: z.enum(genderValues),
  emergencyContactName: z.string().optional().or(z.literal('')),
  emergencyContactPhone: z.string().optional().or(z.literal('')),
  intakeFormData: intakeFormDataSchema,
  firstVisit: z.object({
    serviceType: z.enum(massageTypeValues),
  }),
})

// --- Store PIN ---
export const storePinSchema = z.object({
  storeId: z.string().min(1),
  pin: z.string().min(4).max(8),
})

// --- Create Store ---
export const createStoreSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  staffPin: z.string().min(4).max(8),
  adminPin: z.string().min(4).max(8),
})
