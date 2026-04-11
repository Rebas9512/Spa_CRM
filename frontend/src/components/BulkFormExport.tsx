import { useState } from 'react'
import JSZip from 'jszip'
import { useAppStore } from '../store/appStore'
import { useTranslation } from '../i18n'
import { generateConsentPdfBlob } from './ConsentFormPdf'
import type { ConsentPdfData } from './ConsentFormPdf'
import { apiFetch } from '../lib/apiClient'

interface FormExportCustomer {
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
  hasIntake: boolean
  intakeStatus: string | null
  clientSignedAt: string | null
  lastReviewedAt: string | null
  totalVisits: number
  formData: Record<string, unknown>
}

export default function BulkFormExport() {
  const { t } = useTranslation()
  const { storeSession } = useAppStore()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  const handleExport = async () => {
    if (!dateFrom || !dateTo || !storeSession?.token) return
    if (dateFrom > dateTo) {
      setProgress(t('export.formsInvalidRange'))
      return
    }
    setLoading(true)
    setProgress(t('export.formsFetching'))

    try {
      const res = await apiFetch<{ customers: FormExportCustomer[]; storeName: string }>(
        `/api/manage/export/forms?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      )

      const customers = res.customers.filter((c) => c.hasIntake)

      if (customers.length === 0) {
        setProgress(t('export.formsNone'))
        setLoading(false)
        return
      }

      setProgress(`${t('export.formsGenerating')} (${customers.length})`)

      const zip = new JSZip()

      for (let i = 0; i < customers.length; i++) {
        const c = customers[i]
        const fd = c.formData

        const pdfData: ConsentPdfData = {
          storeName: c.storeName,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email,
          dateOfBirth: c.dateOfBirth,
          address: c.address,
          gender: c.gender,
          emergencyContactName: c.emergencyContactName,
          emergencyContactPhone: c.emergencyContactPhone,
          hasSpinalProblems: (fd.hasSpinalProblems as boolean) || false,
          hasAllergies: (fd.hasAllergies as boolean) || false,
          hasHighBloodPressure: (fd.hasHighBloodPressure as boolean) || false,
          hasBruiseEasily: (fd.hasBruiseEasily as boolean) || false,
          hasVaricoseVeins: (fd.hasVaricoseVeins as boolean) || false,
          hasMigraines: (fd.hasMigraines as boolean) || false,
          hasHeartConditions: (fd.hasHeartConditions as boolean) || false,
          hasInjuries: (fd.hasInjuries as boolean) || false,
          isPregnant: (fd.isPregnant as boolean) || false,
          medicalNotes: (fd.medicalNotes as string) || '',
          preferredMassageType: (fd.preferredMassageType as string) || '',
          areasOfPainTension: (fd.areasOfPainTension as string) || '',
          areasToAvoid: (fd.areasToAvoid as string) || '',
          consentAcknowledged: (fd.consentAcknowledged as boolean) || false,
          signatureDataUrl: (fd.clientSignatureDataUrl as string) || null,
          clientSignedAt: c.clientSignedAt,
          status: c.intakeStatus || '',
          lastReviewedAt: c.lastReviewedAt,
          totalVisits: c.totalVisits,
        }

        setProgress(`${t('export.formsGenerating')} ${i + 1}/${customers.length}`)
        const blob = await generateConsentPdfBlob(pdfData)
        const baseName = `ConsentForm_${c.lastName}${c.firstName}`
        const fileName = zip.files[`${baseName}.pdf`] ? `${baseName}_${i + 1}.pdf` : `${baseName}.pdf`
        zip.file(fileName, blob)
      }

      setProgress(t('export.formsZipping'))
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ConsentForms_${dateFrom}_${dateTo}.zip`
      a.click()
      URL.revokeObjectURL(url)

      setProgress(`${t('export.formsDone')} (${customers.length})`)
    } catch (err) {
      console.error('Bulk form export error:', err)
      setProgress(t('export.formsFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-900">
        {t('export.formsTitle')}
      </h3>
      <p className="text-sm text-gray-500">{t('export.formsDesc')}</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">{t('export.dateFrom')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">{t('export.dateTo')}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleExport}
            disabled={loading || !dateFrom || !dateTo}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-5 py-2 text-sm font-medium text-white
                       active:bg-[#0d6b63] disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
            </svg>
            {loading ? t('common.loading') : t('export.formsButton')}
          </button>
        </div>
      </div>

      {progress && (
        <p className={`text-sm ${progress === t('export.formsFailed') ? 'text-red-500' : 'text-gray-500'}`}>
          {progress}
        </p>
      )}
    </div>
  )
}
