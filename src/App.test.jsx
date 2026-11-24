import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Swal from 'sweetalert2'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App, { matchRoute } from './App'
import { getToken } from './helpers/apiHelper'
import { act } from '@testing-library/react'
import { fail, makePost, makeUser, ok, renderWithAuth } from './testUtils'

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({}) } }))

const member = makeUser()
const admin = makeUser({ id: 1, username: 'admin', role: 'admin', name: 'Admin' })
const publicApi = () => ({
  'GET /api/public/categories': ok(['Umum']),
  'GET /api/public/posts': ok([makePost()]),
  'GET /api/public/posts/belajar-golang': ok(makePost()),
})
const memberApi = () => ({
  'GET /api/posts': ok([makePost()]),
  'GET /api/posts/stats': ok({ total: 1, published: 1, draft: 0 }),
  'POST /api/auth/logout': ok(null),
})
const adminApi = () => ({ 'GET /api/admin/users': ok([]), 'GET /api/admin/posts': ok([]) })
const go = (path) => window.history.pushState(null, '', path)
const app = (opts) => renderWithAuth(<App />, opts)

beforeEach(() => Swal.fire.mockClear())

describe('matchRoute', () => {
  it('memetakan seluruh rute', () => {
    expect(matchRoute('/')).toEqual({ name: 'home' })
    expect(matchRoute('/public')).toEqual({ name: 'home' })
    expect(matchRoute('/login')).toEqual({ name: 'login' })
    expect(matchRoute('/register')).toEqual({ name: 'register' })
    expect(matchRoute('/author/')).toEqual({ name: 'author' })
    expect(matchRoute('/admin')).toEqual({ name: 'admin' })
    expect(matchRoute('/posts/halo%20dunia')).toEqual({ name: 'post', slug: 'halo dunia' })
    expect(matchRoute('/posts/a/b')).toEqual({ name: 'notfound' })
    expect(matchRoute('/xyz')).toEqual({ name: 'notfound' })
  })
})

describe('App', () => {
  it('beranda publik dengan tautan lewati konten', async () => {
    app({ handlers: publicApi() })
    expect(await screen.findByRole('link', { name: 'Baca: Belajar Golang' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lewati ke konten utama' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('detail artikel lewat /posts/:slug', async () => {
    go('/posts/belajar-golang')
    app({ handlers: publicApi() })
    expect(await screen.findByRole('heading', { level: 1, name: 'Belajar Golang' })).toBeInTheDocument()
  })

  it('halaman 404', () => {
    go('/tidak-ada')
    app()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404')
  })

  it('/login dan /register menampilkan formulir untuk tamu', () => {
    go('/login')
    const first = app()
    expect(document.getElementById('login-submit')).toBeInTheDocument()
    first.unmount()
    go('/register')
    app()
    expect(document.getElementById('register-submit')).toBeInTheDocument()
  })

  it('tamu yang membuka /author atau /admin dialihkan ke /login', async () => {
    go('/author')
    const first = app()
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    first.unmount()
    go('/admin')
    app()
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })

  it('login member menuju /author, lalu keluar kembali ke /', async () => {
    go('/login')
    app({ handlers: { ...publicApi(), ...memberApi(), 'POST /api/auth/login': ok({ token: 'tok', user: member }) } })
    await userEvent.type(document.getElementById('login-username'), 'member')
    await userEvent.type(document.getElementById('login-password'), 'member')
    await userEvent.click(document.getElementById('login-submit'))
    expect(await screen.findByRole('heading', { name: 'ruang penulis' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/author')
    await userEvent.click(screen.getByRole('button', { name: /Keluar/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(getToken()).toBeNull()
  })

  it('keluar tetap berhasil walau API logout gagal', async () => {
    go('/author')
    app({ user: member, handlers: { ...publicApi(), ...memberApi(), 'POST /api/auth/logout': fail(500, 'x') } })
    expect(await screen.findByRole('heading', { name: 'ruang penulis' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Keluar/ }))
    await waitFor(() => expect(getToken()).toBeNull())
    expect(window.location.pathname).toBe('/')
  })

  it('sesi diperiksa dulu: pemuat tampil sebelum profil selesai', async () => {
    go('/author')
    app({ user: member, handlers: memberApi() })
    expect(screen.getByText('Memeriksa sesi...')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'ruang penulis' })).toBeInTheDocument()
  })

  it('admin membuka /admin; member dialihkan ke /author', async () => {
    go('/admin')
    const first = app({ user: admin, handlers: adminApi() })
    expect(await screen.findByRole('heading', { name: 'panel admin' })).toBeInTheDocument()
    first.unmount()
    go('/admin')
    app({ user: member, handlers: memberApi() })
    await waitFor(() => expect(window.location.pathname).toBe('/author'))
    expect(await screen.findByRole('heading', { name: 'ruang penulis' })).toBeInTheDocument()
  })

  it('pengguna masuk yang membuka /login dialihkan ke ruang kerjanya', async () => {
    go('/login')
    const first = app({ user: member, handlers: memberApi() })
    await waitFor(() => expect(window.location.pathname).toBe('/author'))
    first.unmount()
    go('/register')
    app({ user: admin, handlers: adminApi() })
    await waitFor(() => expect(window.location.pathname).toBe('/admin'))
  })

  it('auth:expired memperbarui tampilan menjadi tamu', async () => {
    go('/')
    app({ user: member, handlers: { ...publicApi(), ...memberApi() } })
    expect(await screen.findByRole('link', { name: /Ruang Penulis/ })).toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('auth:expired')))
    expect((await screen.findAllByRole('link', { name: 'Masuk' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /Ruang Penulis/ })).toBeNull()
  })
})
