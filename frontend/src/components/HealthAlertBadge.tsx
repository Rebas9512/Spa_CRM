import { HEALTH_CONDITIONS, HIGH_RISK_CONDITIONS } from '@spa-crm/shared'
import { useTranslation } from '../i18n'

export interface HealthAlerts {
  hasSpinalProblems?: boolean
  hasAllergies?: boolean
  hasHighBloodPressure?: boolean
  hasBruiseEasily?: boolean
  hasVaricoseVeins?: boolean
  hasMigraines?: boolean
  hasHeartConditions?: boolean
  hasInjuries?: boolean
  isPregnant?: boolean
}

interface HealthAlertBadgeProps {
  healthAlerts: HealthAlerts
}

export default function HealthAlertBadge({ healthAlerts }: HealthAlertBadgeProps) {
  const { t } = useTranslation()

  if (!healthAlerts) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
        {t('health.noConditions')}
      </span>
    )
  }

  const activeConditions = HEALTH_CONDITIONS.filter(
    (c) => healthAlerts[c.key as keyof HealthAlerts],
  )

  const isPregnant = healthAlerts.isPregnant

  if (activeConditions.length === 0 && !isPregnant) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
        {t('health.noConditions')}
      </span>
    )
  }

  const allItems: Array<{ key: string; label: string; isHighRisk: boolean }> = [
    ...activeConditions.map((c) => ({
      key: c.key,
      label: c.label,
      isHighRisk: (HIGH_RISK_CONDITIONS as readonly string[]).includes(c.key),
    })),
    ...(isPregnant
      ? [{ key: 'isPregnant', label: t('health.pregnant'), isHighRisk: true }]
      : []),
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {allItems.map((item) => (
        <span
          key={item.key}
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
            item.isHighRisk
              ? 'bg-amber-100 text-amber-700'
              : 'bg-yellow-50 text-yellow-700'
          }`}
        >
          {t(`health.${item.key}`) === `health.${item.key}`
            ? item.label
            : t(`health.${item.key}`)}
        </span>
      ))}
    </div>
  )
}
