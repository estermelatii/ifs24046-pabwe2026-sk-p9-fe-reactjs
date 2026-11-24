import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useDebounce from './useDebounce'
import useDocumentMeta from './useDocumentMeta'
import useInput from './useInput'

describe('useDebounce', () => {
  afterEach(() => vi.useRealTimers())

  it('menunda perubahan nilai dan membatalkan timer lama', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v, d }) => useDebounce(v, d), { initialProps: { v: 'a', d: undefined } })
    expect(result.current).toBe('a')
    rerender({ v: 'b', d: undefined })
    act(() => vi.advanceTimersByTime(200))
    rerender({ v: 'c', d: 100 })
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('c')
  })

  it('memakai jeda bawaan 350 ms', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebounce(v), { initialProps: { v: 'a' } })
    rerender({ v: 'b' })
    act(() => vi.advanceTimersByTime(349))
    expect(result.current).toBe('a')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('b')
  })
})

describe('useDocumentMeta', () => {
  it('mengatur title dan meta description bila elemen ada', () => {
    const meta = document.createElement('meta')
    meta.name = 'description'
    document.head.append(meta)
    const { rerender } = renderHook(({ t, d }) => useDocumentMeta(t, d), { initialProps: { t: 'Masuk', d: 'Deskripsi' } })
    expect(document.title).toBe('Masuk · Delcom Blog')
    expect(meta).toHaveAttribute('content', 'Deskripsi')
    rerender({ t: null, d: undefined })
    expect(document.title).toBe('Delcom Blog — tulis suaramu')
    meta.remove()
  })

  it('tidak error bila meta description tidak ada', () => {
    expect(() => renderHook(() => useDocumentMeta('X', 'Y'))).not.toThrow()
  })
})

describe('useInput', () => {
  it('bind teks, checkbox, set, dan reset', () => {
    const { result } = renderHook(() => useInput({ name: 'a', ok: false }))
    expect(result.current.bind('missing').value).toBe('')
    act(() => result.current.bind('name').onChange({ target: { type: 'text', value: 'b' } }))
    expect(result.current.values.name).toBe('b')
    act(() => result.current.bind('ok').onChange({ target: { type: 'checkbox', checked: true } }))
    expect(result.current.values.ok).toBe(true)
    act(() => result.current.set('name', 'z'))
    expect(result.current.values.name).toBe('z')
    act(() => result.current.reset({ name: 'baru' }))
    expect(result.current.values).toEqual({ name: 'baru' })
    act(() => result.current.reset())
    expect(result.current.values).toEqual({ name: 'a', ok: false })
  })

  it('memakai objek kosong bila tanpa nilai awal', () => {
    const { result } = renderHook(() => useInput())
    expect(result.current.values).toEqual({})
  })
})
