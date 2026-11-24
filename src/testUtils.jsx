import { vi } from 'vitest'
import { act, render } from '@testing-library/react'
import Editor from '@toast-ui/editor'
import { AuthProvider } from './features/auth/AuthContext'
import { saveSession } from './helpers/apiHelper'

export const ok = (data) => [200, { status: 'success', message: 'ok', data }]
export const fail = (status, message) => [status, { status: 'fail', message }]

/** Mengganti fetch global. handlers: { 'METHOD /path': [status, json] | ({ body, path }) => [status, json] }. */
export function mockFetch(handlers) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET'
      const path = String(url)
      const body = init.body ? JSON.parse(init.body) : undefined
      calls.push({ method, path, body, headers: init.headers })
      const handler = handlers[`${method} ${path}`] || handlers[`${method} ${path.split('?')[0]}`]
      const [status, json] = typeof handler === 'function' ? handler({ body, path }) : handler || fail(404, 'Endpoint not found')
      return { ok: status >= 200 && status < 300, status, json: async () => json }
    }),
  )
  return calls
}

export const makePost = (o = {}) => ({
  id: 1,
  title: 'Belajar Golang',
  slug: 'belajar-golang',
  category: 'Teknologi',
  excerpt: 'Ringkasan artikel',
  content: '## Isi\n\nParagraf',
  cover_image_path: '',
  is_published: true,
  published_at: '2026-11-01T10:00:00Z',
  reading_time: 3,
  author: { id: 2, name: 'Member Demo', username: 'member' },
  created_at: '2026-10-30T10:00:00Z',
  ...o,
})

export const makeUser = (o = {}) => ({ id: 2, name: 'Member Demo', username: 'member', email: 'member@delcom.blog', role: 'member', ...o })

/** Mengisi editor TOAST UI tiruan (instance terakhir) seolah pengguna mengetik. */
export function typeInEditor(markdown) {
  const editor = Editor.instances.at(-1)
  editor.value = markdown
  act(() => editor.options.events.change())
}

export async function waitForEditor() {
  await vi.waitFor(() => expect(Editor.instances.length).toBeGreaterThan(0))
  return Editor.instances.at(-1)
}

/** Merender UI di dalam AuthProvider asli. Bila `user` diberikan, sesi tersimpan & profil ditanggapi. */
export function renderWithAuth(ui, { user, handlers = {} } = {}) {
  if (user) saveSession('tok', user)
  const calls = mockFetch({ ...(user ? { 'GET /api/auth/profile': ok(user) } : {}), ...handlers })
  return { calls, ...render(ui, { wrapper: AuthProvider }) }
}
