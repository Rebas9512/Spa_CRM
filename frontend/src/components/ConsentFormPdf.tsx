import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer'
import { HEALTH_CONDITIONS, CONSENT_TEXT, MASSAGE_TYPES } from '@spa-crm/shared'
import { formatLocalTime } from '../lib/timezone'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ConsentPdfData {
  storeName: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  dateOfBirth: string | null
  address: string | null
  gender: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null

  // Health
  hasSpinalProblems: boolean
  hasAllergies: boolean
  hasHighBloodPressure: boolean
  hasBruiseEasily: boolean
  hasVaricoseVeins: boolean
  hasMigraines: boolean
  hasHeartConditions: boolean
  hasInjuries: boolean
  isPregnant: boolean
  medicalNotes: string

  // Preferences
  preferredMassageType: string
  areasOfPainTension: string
  areasToAvoid: string

  // Consent
  consentAcknowledged: boolean
  signatureDataUrl: string | null

  // Therapist
  therapistName?: string | null

  // Form metadata
  clientSignedAt: string | null
  status: string
  lastReviewedAt: string | null
  totalVisits: number
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  header: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#0F766E',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 140,
    fontFamily: 'Helvetica-Bold',
    color: '#6B7280',
  },
  value: {
    flex: 1,
    color: '#1a1a1a',
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 4,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    marginRight: 6,
  },
  checkboxChecked: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#0F766E',
    backgroundColor: '#0F766E',
    marginRight: 6,
  },
  consentParagraph: {
    marginBottom: 8,
    lineHeight: 1.5,
    color: '#374151',
  },
  signatureImage: {
    width: 200,
    height: 80,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  footer: {
    marginTop: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    fontSize: 8,
    color: '#9CA3AF',
    textAlign: 'center',
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getMassageTypeLabel(value: string): string {
  const found = MASSAGE_TYPES.find((m) => m.value === value)
  return found?.label ?? value
}

// ---------------------------------------------------------------------------
// PDF Document Component
// ---------------------------------------------------------------------------
function ConsentFormDocument({ data }: { data: ConsentPdfData }) {
  const healthConditionKeys = HEALTH_CONDITIONS.map((c) => c.key)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.header}>
          {`${data.storeName} \u2014 Massage Therapy Consultation Document`}
        </Text>

        {/* Personal Information */}
        <Text style={styles.sectionTitle}>Personal Information</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Name:</Text>
          <Text style={styles.value}>
            {data.firstName} {data.lastName}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Phone:</Text>
          <Text style={styles.value}>{data.phone}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{data.email ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date of Birth:</Text>
          <Text style={styles.value}>{data.dateOfBirth ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Address:</Text>
          <Text style={styles.value}>{data.address ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Gender:</Text>
          <Text style={styles.value}>{data.gender ?? '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Emergency Contact:</Text>
          <Text style={styles.value}>
            {data.emergencyContactName
              ? `${data.emergencyContactName} (${data.emergencyContactPhone ?? '-'})`
              : '-'}
          </Text>
        </View>

        {/* Health Conditions */}
        <Text style={styles.sectionTitle}>Health Conditions</Text>
        <View style={styles.checkboxGrid}>
          {HEALTH_CONDITIONS.map((c) => {
            const checked = data[c.key as keyof ConsentPdfData] === true
            return (
              <View key={c.key} style={styles.checkboxItem}>
                <View style={checked ? styles.checkboxChecked : styles.checkbox} />
                <Text>{c.label}</Text>
              </View>
            )
          })}
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Pregnant:</Text>
          <Text style={styles.value}>{data.isPregnant ? 'Yes' : 'No'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Medical Notes:</Text>
          <Text style={styles.value}>{data.medicalNotes || '-'}</Text>
        </View>

        {/* Massage Preferences */}
        <Text style={styles.sectionTitle}>Massage Preferences</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Preferred Type:</Text>
          <Text style={styles.value}>
            {getMassageTypeLabel(data.preferredMassageType)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Areas of Pain/Tension:</Text>
          <Text style={styles.value}>{data.areasOfPainTension || '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Areas to Avoid:</Text>
          <Text style={styles.value}>{data.areasToAvoid || '-'}</Text>
        </View>

        {/* Consent */}
        <Text style={styles.sectionTitle}>Consent</Text>
        {CONSENT_TEXT.map((paragraph, i) => (
          <Text key={i} style={styles.consentParagraph}>
            {paragraph}
          </Text>
        ))}

        <View style={styles.row}>
          <Text style={styles.label}>Acknowledged:</Text>
          <Text style={styles.value}>
            {data.consentAcknowledged ? 'Yes' : 'No'}
          </Text>
        </View>

        {/* Signature */}
        <Text style={styles.sectionTitle}>Client Signature</Text>
        {data.signatureDataUrl ? (
          <Image src={data.signatureDataUrl} style={styles.signatureImage} />
        ) : (
          <Text style={{ color: '#9CA3AF', marginTop: 4 }}>
            No signature on file
          </Text>
        )}

        {data.clientSignedAt && (
          <View style={[styles.row, { marginTop: 8 }]}>
            <Text style={styles.label}>Signed at:</Text>
            <Text style={styles.value}>{formatLocalTime(data.clientSignedAt)}</Text>
          </View>
        )}

        {/* Therapist */}
        <Text style={styles.sectionTitle}>Therapist</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Therapist Name:</Text>
          <Text style={styles.value}>{data.therapistName || '-'}</Text>
        </View>

        {/* Form Status */}
        <Text style={styles.sectionTitle}>Form Status</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.value}>
            {data.status === 'completed' ? 'Completed' : 'Client Signed'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>First Submitted:</Text>
          <Text style={styles.value}>{formatLocalTime(data.clientSignedAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last Reviewed:</Text>
          <Text style={styles.value}>{formatLocalTime(data.lastReviewedAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total Visits:</Text>
          <Text style={styles.value}>{data.totalVisits}</Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated: {formatDateTime(new Date())}
        </Text>
      </Page>
    </Document>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a transparent-background signature PNG data-URL to one with a white background. */
function flattenSignature(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl) // fallback to original
    img.src = dataUrl
  })
}

async function prepareData(data: ConsentPdfData): Promise<ConsentPdfData> {
  if (!data.signatureDataUrl || !data.signatureDataUrl.startsWith('data:image/')) return data
  const flattened = await flattenSignature(data.signatureDataUrl)
  return { ...data, signatureDataUrl: flattened }
}

// ---------------------------------------------------------------------------
// Public API — generates and downloads the PDF
// ---------------------------------------------------------------------------
export async function generateConsentPdf(data: ConsentPdfData): Promise<void> {
  const prepared = await prepareData(data)
  const blob = await pdf(<ConsentFormDocument data={prepared} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ConsentForm_${data.lastName}${data.firstName}_${formatDate(new Date())}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

/** Generate PDF as a Blob without triggering download (for bulk export) */
export async function generateConsentPdfBlob(data: ConsentPdfData): Promise<Blob> {
  const prepared = await prepareData(data)
  return pdf(<ConsentFormDocument data={prepared} />).toBlob()
}
