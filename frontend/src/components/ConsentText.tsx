import { CONSENT_TEXT } from '@spa-crm/shared'

export default function ConsentText() {
  return (
    <div
      className="rounded-lg border overflow-y-auto p-4 text-sm text-gray-700 leading-relaxed space-y-3"
      style={{
        backgroundColor: '#FAFAFA',
        borderColor: '#E5E7EB',
        maxHeight: 260,
      }}
    >
      {CONSENT_TEXT.map((paragraph, i) => (
        <p key={i} className={i > 0 ? 'font-bold' : undefined}>
          {paragraph}
        </p>
      ))}
    </div>
  )
}
