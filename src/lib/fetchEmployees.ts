export interface Employee {
  name: string
  department: string
}

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

let cached: Employee[] | null = null

export async function fetchEmployees(): Promise<Employee[]> {
  if (cached) return cached

  const url = APPS_SCRIPT_URL
  if (!url) return []

  try {
    const separator = url.includes('?') ? '&' : '?'
    const response = await fetch(`${url}${separator}action=employees`, {
      method: 'GET',
    })

    if (!response.ok) return []

    const data = await response.json()

    if (Array.isArray(data)) {
      cached = data.map((row: { name?: string; department?: string }) => ({
        name: String(row.name || '').trim(),
        department: String(row.department || '').trim(),
      }))
      return cached
    }

    return []
  } catch {
    return []
  }
}
