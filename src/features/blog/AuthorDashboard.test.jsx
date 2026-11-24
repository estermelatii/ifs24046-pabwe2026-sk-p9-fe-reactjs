import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Swal from 'sweetalert2'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, makePost, makeUser, ok, renderWithAuth, typeInEditor, waitForEditor } from '../../testUtils'
import AuthorDashboard from './components/AuthorDashboard'

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn() } }))

const published = makePost()
const draft = makePost({ id: 2, title: 'Draf Saya', slug: 'draf-saya', is_published: false, published_at: null })
const base = () => ({
  'GET /api/posts': ok([published, draft]),
  'GET /api/posts/stats': ok({ total: 2, published: 1, draft: 1 }),
})
const render = (handlers = {}) => renderWithAuth(<AuthorDashboard />, { handlers: { ...base(), ...handlers } })
const menu = async (title, item) => {
  await userEvent.click(screen.getByRole('button', { name: `Aksi untuk ${title}` }))
  await userEvent.click(screen.getByRole('menuitem', { name: item }))
}

beforeEach(() => {
  Swal.fire.mockReset()
  Swal.fire.mockResolvedValue({ isConfirmed: true })
})

describe('AuthorDashboard', () => {
  it('menampilkan statistik dan tabel artikel', async () => {
    render()
    expect(await screen.findByText('Draf Saya')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('stat-Terbit')).toHaveTextContent('1'))
    expect(screen.getByTestId('stat-Total Artikel')).toHaveTextContent('2')
    expect(screen.getByRole('table', { name: 'Daftar artikel milik Anda' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Terbitkan: Belajar Golang' })).toBeChecked()
  })

  it('daftar kosong (data null) dan galat', async () => {
    const empty = render({ 'GET /api/posts': ok(null) })
    expect(await screen.findByText('Belum ada artikel.')).toBeInTheDocument()
    empty.unmount()
    render({ 'GET /api/posts': fail(500, 'Gagal memuat') })
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat')
  })

  it('toggle publikasi untuk artikel terbit dan draf', async () => {
    const { calls } = render({ 'PATCH /api/posts/1/toggle-publish': ok(draft), 'PATCH /api/posts/2/toggle-publish': ok(published) })
    await screen.findByText('Draf Saya')
    await userEvent.click(screen.getByRole('switch', { name: 'Terbitkan: Belajar Golang' }))
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'Artikel dikembalikan menjadi draf.' })))
    await userEvent.click(screen.getByRole('switch', { name: 'Terbitkan: Draf Saya' }))
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'Artikel berhasil diterbitkan.' })))
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2)
  })

  it('galat toggle ditampilkan', async () => {
    render({ 'PATCH /api/posts/1/toggle-publish': fail(500, 'Gagal toggle') })
    await screen.findByText('Draf Saya')
    await userEvent.click(screen.getByRole('switch', { name: 'Terbitkan: Belajar Golang' }))
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: 'Gagal toggle' })))
  })

  it('menghapus artikel setelah konfirmasi', async () => {
    const { calls } = render({ 'DELETE /api/posts/1': ok(null) })
    await screen.findByText('Draf Saya')
    await menu('Belajar Golang', 'Hapus')
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'Artikel dihapus.' })))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('batal hapus tidak memanggil API; galat hapus ditampilkan', async () => {
    const { calls } = render({ 'DELETE /api/posts/1': fail(500, 'Gagal hapus') })
    await screen.findByText('Draf Saya')
    Swal.fire.mockResolvedValueOnce({ isConfirmed: false })
    await menu('Belajar Golang', 'Hapus')
    await waitFor(() => expect(Swal.fire).toHaveBeenCalled())
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await menu('Belajar Golang', 'Hapus')
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ text: 'Gagal hapus' })))
  })

  it('Lihat: artikel terbit membuka halaman publik, draf menampilkan info', async () => {
    render()
    await screen.findByText('Draf Saya')
    await menu('Draf Saya', 'Lihat')
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'info' })))
    await menu('Belajar Golang', 'Lihat')
    expect(window.location.pathname).toBe('/posts/belajar-golang')
  })

  it('Edit membuka modal berisi artikel', async () => {
    render({ 'PUT /api/posts/1': ok(published) })
    await screen.findByText('Draf Saya')
    await menu('Belajar Golang', 'Edit')
    expect(screen.getByRole('dialog', { name: 'Edit Artikel' })).toBeInTheDocument()
    await waitForEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Tambah Artikel lalu Batal menutup modal', async () => {
    render()
    await screen.findByText('Draf Saya')
    await userEvent.click(screen.getByRole('button', { name: /Tambah Artikel/ }))
    expect(screen.getByRole('dialog', { name: 'Tambah Artikel' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('menambah artikel baru menutup modal dan memuat ulang daftar', async () => {
    const { calls } = render({ 'POST /api/posts': ok(published) })
    await screen.findByText('Draf Saya')
    await userEvent.click(screen.getByRole('button', { name: /Tambah Artikel/ }))
    await waitForEditor()
    await userEvent.type(screen.getByLabelText('Judul'), 'Baru')
    typeInEditor('isi')
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path === '/api/posts').length).toBeGreaterThan(1))
  })

  it('AI Generator: Batal lalu terapkan hasil ke editor artikel baru', async () => {
    render({ 'POST /api/posts/ai-generate': ok({ title: 'Hasil AI', category: 'Teknologi', excerpt: 'r', content: 'c', reading_time: 1, sources: [] }) })
    await screen.findByText('Draf Saya')
    await userEvent.click(screen.getByRole('button', { name: /AI Generator/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /AI Generator/ }))
    const dialog = screen.getByRole('dialog', { name: 'AI Blog Generator' })
    await userEvent.type(within(dialog).getByLabelText('Topik artikel'), 'Golang')
    await userEvent.click(within(dialog).getByRole('button', { name: /Buat Draf Artikel/ }))
    await within(dialog).findByText('Hasil AI')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Terapkan ke Editor' }))
    expect(await screen.findByRole('dialog', { name: 'Tambah Artikel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Judul')).toHaveValue('Hasil AI')
  })
})
