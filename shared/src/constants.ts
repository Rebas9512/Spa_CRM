export const MASSAGE_TYPES = [
  { value: 'swedish_relaxation', label: 'Swedish / Relaxation' },
  { value: 'deep_tissue', label: 'Deep Tissue' },
  { value: 'trigger_point', label: 'Trigger Point' },
  { value: 'pregnancy', label: 'Pregnancy' },
  { value: 'hot_stone', label: 'Hot Stone' },
  { value: 'other', label: 'Other' },
] as const

export const HEALTH_CONDITIONS = [
  { key: 'hasSpinalProblems', label: 'Spinal Problems' },
  { key: 'hasAllergies', label: 'Allergies' },
  { key: 'hasHighBloodPressure', label: 'High Blood Pressure' },
  { key: 'hasBruiseEasily', label: 'Bruise Easily' },
  { key: 'hasVaricoseVeins', label: 'Varicose Veins' },
  { key: 'hasMigraines', label: 'Migraines' },
  { key: 'hasHeartConditions', label: 'Heart Conditions' },
  { key: 'hasInjuries', label: 'Injuries' },
] as const

export const HIGH_RISK_CONDITIONS = [
  'hasHighBloodPressure',
  'isPregnant',
  'hasHeartConditions',
  'hasInjuries',
  'hasVaricoseVeins',
] as const

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
] as const

export const SERVICE_MENU_ITEMS = [
  { value: 'A1', label: 'A1 — Chair 15min $20', category: 'Chair' },
  { value: 'A2', label: 'A2 — Chair 20min $35', category: 'Chair' },
  { value: 'A3', label: 'A3 — Chair 30min $50', category: 'Chair' },
  { value: 'F1', label: 'F1 — Foot 30min $35', category: 'Foot' },
  { value: 'F3', label: 'F3 — Foot 60min $60', category: 'Foot' },
  { value: 'F4', label: 'F4 — Foot 60min $60', category: 'Foot' },
  { value: 'F5', label: 'F5 — Foot 90min $90', category: 'Foot' },
  { value: 'C1', label: 'C1 — Combo 70min $75', category: 'Combo' },
  { value: 'C2', label: 'C2 — Combo 90min $90', category: 'Combo' },
  { value: 'C3', label: 'C3 — Combo 90min $90', category: 'Combo' },
  { value: 'B1', label: 'B1 — Body 30min $55', category: 'Body' },
  { value: 'B2', label: 'B2 — Body 60min $75', category: 'Body' },
  { value: 'B3', label: 'B3 — Body 90min $105', category: 'Body' },
  { value: 'B4', label: 'B4 — Body 60min $125', category: 'Body' },
  { value: 'B5', label: 'B5 — Body 120min $135', category: 'Body' },
  { value: 'H1', label: 'H1 — Head 60min $60', category: 'Head' },
] as const

export const CONSENT_TEXT = [
  'Massage therapy is not a substitute for medical examination or diagnosis. It is recommended that I see a physician for any physical ailment that I may have. I understand that the massage therapist does not prescribe medical treatments or pharmaceuticals and does not perform any spinal adjustments. I am aware that if I have any serious medical diagnosis, I must provide a physician\'s written consent prior to services.',
  'The licensee shall drape the breasts of all female clients and not engage in breast massage of female clients unless the client gives written consent before each session involving breast massage.',
  'Draping of the genital area and gluteal cleavage will be used at all times during the session for all clients.',
  'The licensee must immediately end the massage session if a client initiates any verbal or physical contact that is sexual in nature. If the client is uncomfortable for any reason, the client may ask the licensee to end the massage, and the licensee will end the session. The licensee also has a right to end the session if uncomfortable for any reason.',
] as const
