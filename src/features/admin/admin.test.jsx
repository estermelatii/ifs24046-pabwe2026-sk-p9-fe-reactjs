import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fail, makePost, mockFetch, ok } from '../../testUtils'
import { getAllPosts, getUserPosts, getUsers } from './api/adminApi'
import AdminDashboard from './components/AdminDashboard'

const users = [
  { id: 1, username: 'admin', email: 'a@x.co', role: 'admin', posts_count: 0, published_count: 0 },
  { id: 2, username: 'member', email: 'm@x.co', role: 'member', posts_count: 3, published_count: 2 },
]
const base = () => ({
  'GET /api/admin/users': ok(users),
  'GET /api/admin/posts': ok([makePost(), makePost({ id: 2, title: 'Draf', is_published: false, author: undefined, user_id: 9 })]),
  'GET /api/admin/users/2/posts': ok([makePost({ title: 'Milik Member' })]),
})

describe('adminApi', () => {
  it('memanggil endpoint admin dan memetakan pengguna', async () => {
    const calls = mockFetch(base())
    expect((await getUsers())[1]).toMatchObject({ total_articles: 3, total_published: 2 })
    expect((await getAllPosts())[0].author_name).toBe('Member Demo')
    await getUserPosts(2)
    expect(calls.map((c) => c.path)).toEqual(['/api/admin/users', '/api/admin/posts', '/api/admin/users/2/posts'])
  })
})

describe('AdminDashboard', () => {
  it('menampilkan ringkasan, direktori pengguna, dan seluruh artikel', async () => {
    mockFetch(base())
    render(<AdminDashboard />)
    expect(screen.getByText('Memuat data...')).toBeInTheDocument()
    expect(await screen.findByText('Arsip seluruh artikel')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Seluruh pengguna sistem' })).toBeInTheDocument()
    const summary = screen.getByRole('list', { name: 'Ringkasan sistem' })
    expect(within(summary).getByText('Total Pengguna').nextSibling).toHaveTextContent('2')
    expect(within(summary).getByText('Total Artikel').nextSibling).toHaveTextContent('3')
    expect(within(summary).getByText('Artikel Terbit').nextSibling).toHaveTextContent('2')
    expect(screen.getByText('Member Demo')).toBeInTheDocument()
    expect(screen.getByText('#9')).toBeInTheDocument()
  })

  it('memfilter artikel per pengguna lalu kembali ke semua', async () => {
    mockFetch(base())
    render(<AdminDashboard />)
    await screen.findByText('Arsip seluruh artikel')
    await userEvent.click(screen.getByRole('button', { name: 'Lihat artikel milik member' }))
    expect(await screen.findByText('Artikel milik member')).toBeInTheDocument()
    expect(await screen.findByText('Milik Member')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tampilkan semua' }))
    expect(await screen.findByText('Arsip seluruh artikel')).toBeInTheDocument()
  })

  it('filter pengguna dengan daftar null menampilkan status kosong', async () => {
    mockFetch({ ...base(), 'GET /api/admin/users/2/posts': ok(null) })
    render(<AdminDashboard />)
    await screen.findByText('Arsip seluruh artikel')
    await userEvent.click(screen.getByRole('button', { name: 'Lihat artikel milik member' }))
    expect(await screen.findByText('Belum ada artikel.')).toBeInTheDocument()
  })

  it('galat saat memfilter pengguna', async () => {
    mockFetch({ ...base(), 'GET /api/admin/users/2/posts': fail(500, 'Gagal filter') })
    render(<AdminDashboard />)
    await screen.findByText('Arsip seluruh artikel')
    await userEvent.click(screen.getByRole('button', { name: 'Lihat artikel milik member' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal filter')
  })

  it('galat saat memuat awal dan data null dianggap kosong', async () => {
    mockFetch({ 'GET /api/admin/users': fail(500, 'Gagal memuat'), 'GET /api/admin/posts': ok([]) })
    const first = render(<AdminDashboard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat')
    first.unmount()
    mockFetch({ 'GET /api/admin/users': ok(null), 'GET /api/admin/posts': ok(null) })
    render(<AdminDashboard />)
    expect(await screen.findByText('Belum ada artikel.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('list', { name: 'Ringkasan sistem' })).toBeInTheDocument())
  })
})
