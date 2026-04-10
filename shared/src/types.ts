export type AccessLevel = 'customer' | 'staff' | 'admin'

export interface Admin {
  id: string
  email: string
  password_hash: string
  name: string
  created_at: string
  updated_at: string
}

export interface InviteCode {
  id: string
  code: string
  used_by: string | null
  used_at: string | null
  created_at: string
}

export interface Store {
  id: string
  admin_id: string
  name: string
  address: string | null
  phone: string | null
  timezone: string
  staff_pin_hash: string
  admin_pin_hash: string
  created_at: string
  updated_at: string
}

export interface StoreSession {
  id: string
  store_id: string
  opened_at: string
  closed_at: string | null
}

export interface Customer {
  id: string
  phone: string
  first_name: string
  last_name: string
  email: string | null
  address: string | null
  date_of_birth: string | null
  gender: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  staff_notes: string
  created_at: string
  updated_at: string
}

export interface IntakeFormData {
  // Health checkboxes
  hasSpinalProblems: boolean
  hasAllergies: boolean
  hasHighBloodPressure: boolean
  hasBruiseEasily: boolean
  hasVaricoseVeins: boolean
  hasMigraines: boolean
  hasHeartConditions: boolean
  hasInjuries: boolean

  // Pregnancy
  isPregnant: boolean
  pregnancyDueDate: string | null

  // Medical notes
  medicalNotes: string

  // Massage preferences
  preferredMassageType:
    | 'swedish_relaxation'
    | 'deep_tissue'
    | 'trigger_point'
    | 'pregnancy'
    | 'hot_stone'
    | 'other'
  areasOfPainTension: string
  areasToAvoid: string

  // Minor
  isMinor: boolean
  guardianName: string | null
  guardianSignatureDataUrl: string | null

  // Consent
  consentAcknowledged: boolean
  clientSignatureDataUrl: string
}

export type IntakeFormStatus = 'client_signed' | 'completed'

export interface IntakeForm {
  id: string
  customer_id: string
  form_version: number
  form_data: IntakeFormData
  status: IntakeFormStatus
  client_signed_at: string | null
  last_reviewed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  customer_id: string
  store_id: string
  visit_date: string
  service_type: string | null
  therapist_name: string | null
  notes: string | null
  therapist_service_technique: string | null
  therapist_body_parts_notes: string | null
  therapist_signature_data_url: string | null
  therapist_signed_at: string | null
  cancelled_at: string | null
  created_at: string
}
