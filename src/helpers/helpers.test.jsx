import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, clearSession, getStoredUser, getToken, saveSession } from './apiHelper'
import { normalizePost, normalizePosts, normalizeStats, normalizeUser, normalizeUsers } from './dataMapper'
import { Link, navigate, usePathname } from './navigation'
import { confirmDialog, formatDate, formatShortDate, showAlert, showToast } from './toolsHelper'
import { fail, mockFetch, ok } from '../testUtils'

const fire = vi.hoisted(() => vi.fn())
vi.mock('sweetalert2', () => ({ default: { fire } }))

describe('apiHelper', () => {
  it('menyimpan, membaca, dan menghapus sesi', () => {
    saveSession('tok', { username: 'a' })
    expect(getToken()).toBe('tok')
    expect(getStoredUser()).toEqual({ username: 'a' })
    clearSession()
    expect(getToken()).toBeNull()
  })

  it('tidak melempar bila localStorage tidak tersedia', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getToken()).toBeNull()
    expect(() => saveSession('t', {})).not.toThrow()
  })

  it('menyuntik token, mengirim body, dan mengembalikan data', async () => {
    saveSession('tok', {})
    const calls = mockFetch({ 'POST /api/x': ok([1]), 'GET /api/y': ok({ a: 1 }) })
    expect(await apiFetch('/api/x', { method: 'POST', body: { a: 1 } })).toEqual([1])
    expect(calls[0].headers.Authorization).toBe('Bearer tok')
    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].body).toEqual({ a: 1 })
    await apiFetch('/api/y', { auth: false })
    expect(calls[1].headers.Authorization).toBeUndefined()
    expect(calls[1].headers['Content-Type']).toBeUndefined()
  })

  it('auth tanpa token tidak menambah header Authorization', async () => {
    const calls = mockFetch({ 'GET /api/y': ok(1) })
    await apiFetch('/api/y')
    expect(calls[0].headers.Authorization).toBeUndefined()
  })

  it('401 dengan token menghapus sesi dan memberi sinyal auth:expired', async () => {
    saveSession('tok', {})
    mockFetch({ 'GET /api/x': fail(401, 'kedaluwarsa') })
    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ message: 'kedaluwarsa', status: 401 })
    window.removeEventListener('auth:expired', onExpired)
    expect(onExpired).toHaveBeenCalled()
    expect(getToken()).toBeNull()
  })

  it('401 tanpa token tidak memicu auth:expired', async () => {
    mockFetch({ 'POST /api/x': fail(401, 'salah') })
    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)
    await expect(apiFetch('/api/x', { method: 'POST', auth: false })).rejects.toBeInstanceOf(ApiError)
    window.removeEventListener('auth:expired', onExpired)
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('galat jaringan, respons bukan JSON, dan pesan bawaan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    await expect(apiFetch('/api/x')).rejects.toThrow('Tidak dapat terhubung')
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    await expect(apiFetch('/api/x')).rejects.toBe(abort)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('bukan json') } }))
    await expect(apiFetch('/api/x')).rejects.toThrow('Permintaan gagal (502)')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'error', message: 'rusak' }) }))
    await expect(apiFetch('/api/x')).rejects.toThrow('rusak')
  })
})

describe('dataMapper', () => {
  it('normalizeStats mendukung kedua bentuk dan null', () => {
    expect(normalizeStats(null)).toBeNull()
    expect(normalizeStats({ total: 3, published: 2, draft: 1 })).toEqual({ total_articles: 3, total_selesai: 2, belum_selesai: 1 })
    expect(normalizeStats({ total_articles: 5, total_selesai: 4, belum_selesai: 1 })).toEqual({ total_articles: 5, total_selesai: 4, belum_selesai: 1 })
    expect(normalizeStats({})).toEqual({ total_articles: 0, total_selesai: 0, belum_selesai: 0 })
  })

  it('normalizePost mengisi author_name dan user_id', () => {
    expect(normalizePost(null)).toBeNull()
    expect(normalizePost({ author: { id: 7, name: 'Ani', username: 'ani' } })).toMatchObject({ author_name: 'Ani', user_id: 7 })
    expect(normalizePost({ author: { id: 7, username: 'ani' } }).author_name).toBe('ani')
    expect(normalizePost({}).author_name).toBe('')
    expect(normalizePost({ author_name: 'X', user_id: 1 })).toMatchObject({ author_name: 'X', user_id: 1 })
    expect(normalizePosts([{ author: { name: 'A' } }])[0].author_name).toBe('A')
    expect(normalizePosts(null)).toBeNull()
  })

  it('normalizeUser mendukung kedua bentuk', () => {
    expect(normalizeUser({ posts_count: 3, published_count: 2 })).toMatchObject({ total_articles: 3, total_published: 2 })
    expect(normalizeUser({ total_articles: 1, total_published: 1 })).toMatchObject({ total_articles: 1, total_published: 1 })
    expect(normalizeUser({})).toMatchObject({ total_articles: 0, total_published: 0 })
    expect(normalizeUsers([{ posts_count: 1 }])[0].total_articles).toBe(1)
    expect(normalizeUsers(undefined)).toBeUndefined()
  })
})

describe('navigation', () => {
  function Where() {
    return <p data-testid="where">{usePathname()}</p>
  }

  it('navigate memperbarui path dan mengabaikan tujuan yang sama', () => {
    render(<Where />)
    act(() => navigate('/login'))
    expect(window.location.pathname).toBe('/login')
    const spy = vi.spyOn(window.history, 'pushState')
    act(() => navigate('/login'))
    expect(spy).not.toHaveBeenCalled()
    act(() => navigate('/author', { replace: true }))
    expect(window.location.pathname).toBe('/author')
    expect(screen.getByTestId('where')).toHaveTextContent('/author')
  })

  it('Link memakai navigate untuk klik biasa dan membiarkan klik modifier atau target lain', async () => {
    const onClick = vi.fn()
    render(
      <>
        <Link to="/login" onClick={onClick}>biasa</Link>
        <Link to="/register">modifier</Link>
        <Link to="/admin" target="_blank">tab-baru</Link>
        <Link to="/author" onClick={(e) => e.preventDefault()}>dicegah</Link>
        <Link to="/public" target="_self">self</Link>
      </>,
    )
    await userEvent.click(screen.getByText('biasa'))
    expect(window.location.pathname).toBe('/login')
    expect(onClick).toHaveBeenCalled()
    fireEvent.click(screen.getByText('modifier'), { ctrlKey: true })
    expect(window.location.pathname).toBe('/login')
    await userEvent.click(screen.getByText('tab-baru'))
    expect(window.location.pathname).toBe('/login')
    await userEvent.click(screen.getByText('dicegah'))
    expect(window.location.pathname).toBe('/login')
    await userEvent.click(screen.getByText('self'))
    expect(window.location.pathname).toBe('/public')
  })

  it('Link mengabaikan klik bukan tombol utama', async () => {
    render(<Link to="/admin">kanan</Link>)
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('kanan') })
    expect(window.location.pathname).toBe('/')
  })
})

describe('toolsHelper', () => {
  it('dialog dan toast memakai SweetAlert2', async () => {
    fire.mockResolvedValue({ isConfirmed: true })
    await showToast('Halo')
    expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({ toast: true, icon: 'success', title: 'Halo' }))
    await showToast('Info', 'info')
    expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({ icon: 'info' }))
    await showAlert('Gagal', 'detail')
    expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Gagal', text: 'detail', icon: 'error' }))
    expect(await confirmDialog('Hapus?', 'yakin')).toBe(true)
    expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({ confirmButtonText: 'Ya, lanjutkan', showCancelButton: true }))
    fire.mockResolvedValueOnce({ isConfirmed: false })
    expect(await confirmDialog('Hapus?', 'yakin', 'Hapus')).toBe(false)
  })

  it('memformat tanggal', () => {
    expect(formatDate('2026-11-01T10:00:00Z')).toMatch(/2026/)
    expect(formatDate(null)).toBe('—')
    expect(formatDate('bukan-tanggal')).toBe('—')
    expect(formatShortDate('2026-11-01T10:00:00Z')).toMatch(/2026/)
    expect(formatShortDate('')).toBe('—')
    expect(formatShortDate('xx')).toBe('—')
  })
})
