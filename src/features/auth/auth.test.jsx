import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getToken, saveSession } from '../../helpers/apiHelper'
import { fail, makeUser, mockFetch, ok, renderWithAuth } from '../../testUtils'
import { AuthProvider, useAuth } from './AuthContext'
import * as authApi from './api/authApi'
import AuthPage from './components/AuthPage'

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({}) } }))

const session = (user = makeUser()) => ok({ token: 'tok', user })
const $ = (id) => document.getElementById(id)

describe('authApi', () => {
  it('memanggil endpoint auth', async () => {
    const calls = mockFetch({
      'POST /api/auth/login': session(),
      'POST /api/auth/register': session(),
      'POST /api/auth/logout': ok(null),
      'GET /api/auth/profile': ok({}),
      'PUT /api/auth/profile': ok({}),
    })
    await authApi.login('a', 'b')
    await authApi.register({ username: 'a' })
    await authApi.logout()
    await authApi.getProfile()
    await authApi.updateProfile({ name: 'x' })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/auth/login',
      'POST /api/auth/register',
      'POST /api/auth/logout',
      'GET /api/auth/profile',
      'PUT /api/auth/profile',
    ])
  })
})

function Probe() {
  const { user, checking, signIn, signOut } = useAuth()
  return (
    <div>
      <p data-testid="user">{user ? user.username : 'tamu'}</p>
      <p data-testid="checking">{String(checking)}</p>
      <button onClick={() => signIn('t', makeUser({ username: 'baru' }))}>masuk</button>
      <button onClick={signOut}>keluar</button>
    </div>
  )
}

describe('AuthContext', () => {
  it('tamu: tanpa token tidak memanggil profil, signIn dan signOut', async () => {
    const calls = mockFetch({})
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('user')).toHaveTextContent('tamu')
    expect(screen.getByTestId('checking')).toHaveTextContent('false')
    expect(calls).toHaveLength(0)
    await userEvent.click(screen.getByText('masuk'))
    expect(screen.getByTestId('user')).toHaveTextContent('baru')
    expect(getToken()).toBe('t')
    await userEvent.click(screen.getByText('keluar'))
    expect(screen.getByTestId('user')).toHaveTextContent('tamu')
    expect(getToken()).toBeNull()
  })

  it('token tersimpan: memverifikasi profil ke server', async () => {
    saveSession('tok', makeUser({ username: 'lama' }))
    mockFetch({ 'GET /api/auth/profile': ok(makeUser({ username: 'segar' })) })
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('checking')).toHaveTextContent('true')
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('segar'))
    expect(screen.getByTestId('checking')).toHaveTextContent('false')
  })

  it('profil gagal dengan token masih ada: pengguna tersimpan dipertahankan', async () => {
    saveSession('tok', makeUser({ username: 'lama' }))
    mockFetch({ 'GET /api/auth/profile': fail(500, 'galat') })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('checking')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('lama')
  })

  it('profil 401: sesi dibuang dan pengguna menjadi tamu', async () => {
    saveSession('tok', makeUser({ username: 'lama' }))
    mockFetch({ 'GET /api/auth/profile': fail(401, 'kedaluwarsa') })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('tamu'))
  })

  it('unmount sebelum profil selesai tidak memperbarui state', async () => {
    saveSession('tok', makeUser())
    let release
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => (release = r))))
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
    unmount()
    await act(async () => release({ ok: true, status: 200, json: async () => ({ status: 'success', data: makeUser() }) }))
    expect(getToken()).toBe('tok')
  })

  it('profil gagal setelah unmount juga diabaikan', async () => {
    saveSession('tok', makeUser())
    let release
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => (release = r))))
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
    unmount()
    await act(async () => release({ ok: false, status: 500, json: async () => ({ status: 'fail', message: 'x' }) }))
    expect(getToken()).toBe('tok')
  })

  it('event auth:expired menjadikan pengguna tamu', async () => {
    renderWithAuth(<Probe />, { user: makeUser() })
    await waitFor(() => expect(screen.getByTestId('checking')).toHaveTextContent('false'))
    act(() => window.dispatchEvent(new Event('auth:expired')))
    expect(screen.getByTestId('user')).toHaveTextContent('tamu')
  })
})

describe('AuthPage login', () => {
  it('memvalidasi isian kosong', async () => {
    renderWithAuth(<AuthPage mode="login" />)
    await userEvent.click($('login-submit'))
    expect(screen.getByText('Username atau email wajib diisi.')).toBeInTheDocument()
    expect(screen.getByText('Password wajib diisi.')).toBeInTheDocument()
    expect($('login-username')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('masuk')
  })

  it('mode bawaan adalah login', () => {
    renderWithAuth(<AuthPage />)
    expect($('login-submit')).toBeInTheDocument()
  })

  it('member berhasil masuk menuju /author', async () => {
    const { calls } = renderWithAuth(<AuthPage mode="login" />, { handlers: { 'POST /api/auth/login': session() } })
    await userEvent.type($('login-username'), ' member ')
    await userEvent.type($('login-password'), 'member')
    await userEvent.click($('login-submit'))
    await waitFor(() => expect(window.location.pathname).toBe('/author'))
    expect(calls[0].body).toEqual({ username: 'member', password: 'member' })
    expect(getToken()).toBe('tok')
  })

  it('admin berhasil masuk menuju /admin', async () => {
    renderWithAuth(<AuthPage mode="login" />, { handlers: { 'POST /api/auth/login': session(makeUser({ role: 'admin', username: 'admin' })) } })
    await userEvent.type($('login-username'), 'admin')
    await userEvent.type($('login-password'), 'admin')
    await userEvent.click($('login-submit'))
    await waitFor(() => expect(window.location.pathname).toBe('/admin'))
  })

  it('menampilkan galat server', async () => {
    renderWithAuth(<AuthPage mode="login" />, { handlers: { 'POST /api/auth/login': fail(401, 'username atau password salah') } })
    await userEvent.type($('login-username'), 'x')
    await userEvent.type($('login-password'), 'y')
    await userEvent.click($('login-submit'))
    expect(await screen.findByText('username atau password salah')).toBeInTheDocument()
    expect($('login-submit')).toBeEnabled()
  })
})

describe('AuthPage register', () => {
  it('memvalidasi username, email, dan password', async () => {
    renderWithAuth(<AuthPage mode="register" />)
    await userEvent.click($('register-submit'))
    expect(screen.getByText('Username wajib diisi.')).toBeInTheDocument()
    expect(screen.getByText('Masukkan email yang valid.')).toBeInTheDocument()
    expect(screen.getByText('Password wajib diisi.')).toBeInTheDocument()
    await userEvent.type($('register-username'), 'ab')
    await userEvent.type($('register-email'), 'a@b.co')
    await userEvent.type($('register-password'), '123')
    await userEvent.click($('register-submit'))
    expect(screen.getByText('Username minimal 3 karakter.')).toBeInTheDocument()
    expect(screen.getByText('Password minimal 6 karakter.')).toBeInTheDocument()
    expect(screen.queryByText('Masukkan email yang valid.')).toBeNull()
    expect(screen.getByRole('link', { name: 'Masuk di sini' })).toHaveAttribute('href', '/login')
  })

  it('berhasil mendaftar', async () => {
    const { calls } = renderWithAuth(<AuthPage mode="register" />, { handlers: { 'POST /api/auth/register': session() } })
    await userEvent.type($('register-username'), 'ester')
    await userEvent.type($('register-email'), ' e@x.co ')
    await userEvent.type($('register-password'), 'rahasia1')
    await userEvent.click($('register-submit'))
    await waitFor(() => expect(window.location.pathname).toBe('/author'))
    expect(calls[0].body).toEqual({ username: 'ester', email: 'e@x.co', password: 'rahasia1' })
  })
})
