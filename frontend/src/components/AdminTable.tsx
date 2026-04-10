import { type ReactNode } from 'react'
import { useTranslation } from '../i18n'

export interface AdminTableColumn<T> {
  key: string
  label: string
  width?: string
  render?: (item: T) => ReactNode
}

export interface AdminTableProps<T> {
  columns: AdminTableColumn<T>[]
  data: T[]
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  dateRange?: { from: string; to: string }
  onDateRangeChange?: (range: { from: string; to: string }) => void
  onRowClick?: (item: T) => void
  isLoading?: boolean
}

export default function AdminTable<T extends Record<string, unknown>>({
  columns,
  data,
  totalPages,
  currentPage,
  onPageChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  dateRange,
  onDateRangeChange,
  onRowClick,
  isLoading,
}: AdminTableProps<T>) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {onSearchChange !== undefined && (
          <input
            type="text"
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? t('customers.searchPlaceholder')}
            className="w-full sm:flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30
                       focus:border-teal-500"
          />
        )}
        {onDateRangeChange !== undefined && dateRange && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, from: e.target.value })
              }
              className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none
                         focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
            <span className="text-gray-400 text-sm">—</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, to: e.target.value })
              }
              className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none
                         focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-xl bg-[#FAFAFA] border border-[#E5E7EB] overflow-hidden"
      >
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#F3F4F6]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase tracking-wide"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-gray-400 text-sm"
                >
                  {t('common.loading')}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-gray-400 text-sm"
                >
                  {t('table.noData')}
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={(item.id as string) ?? idx}
                  onClick={() => onRowClick?.(item)}
                  className={`border-b border-[#E5E7EB] last:border-b-0 ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-gray-50 transition-colors'
                      : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-sm text-[#0D0D0D]"
                      style={col.width ? { width: col.width } : undefined}
                    >
                      {col.render
                        ? col.render(item)
                        : String(item[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600
                       hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            &larr; {t('table.prev')}
          </button>
          <span className="text-sm text-gray-500">
            {t('table.pageOf')
              .replace('{current}', String(currentPage))
              .replace('{total}', String(totalPages))}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-[#0F766E]
                       hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('table.next')} &rarr;
          </button>
        </div>
      )}
    </div>
  )
}
