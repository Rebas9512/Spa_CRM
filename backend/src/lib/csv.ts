function escapeCsv(value: unknown): string {
  let str = String(value ?? '')
  // Prevent CSV formula injection — prefix dangerous leading characters with a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes("'")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: Record<string, unknown>[], keys: string[]): string {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(keys.map((k) => escapeCsv(row[k])).join(','))
  }
  // UTF-8 BOM for Excel compatibility
  return '\uFEFF' + lines.join('\n')
}

export function generateCustomersCsv(rows: Record<string, unknown>[]): string {
  return toCsv(
    ['Name', 'Phone', 'Email', 'Address', 'Date of Birth', 'Gender', 'Last Visit', 'Total Visits'],
    rows,
    ['name', 'phone', 'email', 'address', 'date_of_birth', 'gender', 'last_visit', 'total_visits'],
  )
}

export function generateVisitsCsv(rows: Record<string, unknown>[]): string {
  return toCsv(
    ['Date', 'Customer', 'Phone', 'Service', 'Therapist', 'Signed', 'Cancelled'],
    rows,
    ['visit_date', 'customer_name', 'phone', 'service_type', 'therapist_name', 'signed', 'cancelled'],
  )
}
