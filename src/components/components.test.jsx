import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Editor from '@toast-ui/editor'
import Viewer from '@toast-ui/editor/dist/toastui-editor-viewer'
import { describe, expect, it, vi } from 'vitest'
import { makeUser, renderWithAuth, typeInEditor, waitForEditor } from '../testUtils'
import { Avatar, ChromeBlob, CoverArt } from './Art'
import * as Icons from './Icons'
import KebabMenu from './KebabMenu'
import MarkdownEditor from './MarkdownEditor'
import MarkdownViewer from './MarkdownViewer'
import SiteFooter from './SiteFooter'
import { ArrowButton, FieldError, Modal, PageLoader, StatusBadge, SubmitButton } from './Ui'
import WorkspaceShell from './WorkspaceShell'

describe('Icons & Art', () => {
  it('merender semua ikon dan spinner', () => {
    const { container } = render(
      <>
        {Object.entries(Icons).map(([name, Icon]) => (
          <Icon key={name} />
        ))}
        <Icons.Eye size={30} className="x" />
      </>,
    )
    expect(container.querySelectorAll('svg').length).toBe(Object.keys(Icons).length + 1)
  })

  it('ChromeBlob memakai dua nada warna', () => {
    const { container } = render(
      <>
        <ChromeBlob />
        <ChromeBlob tint="pink" className="z" />
      </>,
    )
    expect(container.querySelectorAll('svg.chrome-blob')).toHaveLength(2)
  })

  it('CoverArt: gambar sampul, seni gradien, dan seed dari judul', () => {
    const { container, rerender } = render(<CoverArt post={{ id: 1, title: 'a', cover_image_path: 'https://x.test/a.png' }} />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.test/a.png')
    rerender(<CoverArt post={{ id: 3, title: 'abc' }} rounded="rounded-xl" className="k" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg.chrome-blob')).toBeInTheDocument()
    rerender(<CoverArt post={{ title: 'abcd' }} />)
    expect(container.querySelector('svg.chrome-blob')).toBeInTheDocument()
  })

  it('Avatar: inisial dari username, dua kata, dan tanpa pengguna', () => {
    const { container, rerender } = render(<Avatar user={{ username: 'member' }} />)
    expect(container).toHaveTextContent('M')
    rerender(<Avatar user={{ username: 'ani budi cici' }} size={24} />)
    expect(container).toHaveTextContent('AB')
    rerender(<Avatar />)
    expect(container).toHaveTextContent('?')
  })
})

describe('Ui', () => {
  it('ArrowButton: tiga varian', () => {
    render(
      <>
        <ArrowButton to="/a">Satu</ArrowButton>
        <ArrowButton to="/b" variant="white">Dua</ArrowButton>
        <ArrowButton to="/c" variant="outline">Tiga</ArrowButton>
      </>,
    )
    expect(screen.getByText('Satu')).toHaveClass('btn-primary')
    expect(screen.getByText('Dua')).toHaveClass('btn-white')
    expect(screen.getByText('Tiga')).toHaveClass('btn-outline')
  })

  it('SubmitButton, FieldError, PageLoader, StatusBadge', () => {
    const { container, rerender } = render(
      <>
        <SubmitButton processing>Kirim</SubmitButton>
        <FieldError id="e" message="Salah" />
        <FieldError id="f" />
        <PageLoader />
        <PageLoader label="Tunggu" />
        <StatusBadge published />
        <StatusBadge published={false} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Kirim' })).toBeDisabled()
    expect(container.querySelector('svg.spin')).toBeInTheDocument()
    expect(screen.getByText('Salah')).toBeInTheDocument()
    expect(screen.getByText('Memuat...')).toBeInTheDocument()
    expect(screen.getByText('Tunggu')).toBeInTheDocument()
    expect(screen.getByText('Terbit')).toBeInTheDocument()
    expect(screen.getByText('Draf')).toBeInTheDocument()
    rerender(<SubmitButton processing={false}>Kirim</SubmitButton>)
    expect(container.querySelector('svg.spin')).toBeNull()
  })

  describe('Modal', () => {
    const setup = (props = {}) => {
      const onClose = vi.fn()
      const utils = render(
        <>
          <button>pemicu</button>
          <Modal open onClose={onClose} title="Judul" footer={<button>Simpan</button>} {...props}>
            <input data-autofocus aria-label="isi" />
          </Modal>
        </>,
      )
      return { onClose, ...utils }
    }

    it('tertutup tidak merender apa pun', () => {
      render(<Modal open={false} onClose={() => {}} title="X">isi</Modal>)
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('layar penuh vs standar, fokus awal, Escape, dan tombol tutup', async () => {
      const { onClose, rerender } = setup({ fullScreen: true })
      const dialog = screen.getByRole('dialog', { name: 'Judul' })
      expect(dialog.className).toContain('max-w-[96vw]')
      expect(document.body.style.overflow).toBe('hidden')
      await waitFor(() => expect(screen.getByLabelText('isi')).toHaveFocus())
      await userEvent.keyboard('{Escape}')
      await userEvent.click(screen.getByRole('button', { name: 'Tutup' }))
      expect(onClose).toHaveBeenCalledTimes(2)
      rerender(
        <Modal open onClose={onClose} title="Standar" labelledBy="lbl">
          <p>tanpa footer</p>
        </Modal>,
      )
      expect(screen.getByRole('dialog', { name: 'Standar' }).className).not.toContain('max-w-[96vw]')
      expect(screen.queryByText('Simpan')).toBeNull()
    })

    it('fokus pertama bila tidak ada data-autofocus, dan fokus kembali saat ditutup', async () => {
      const trigger = document.createElement('button')
      document.body.append(trigger)
      trigger.focus()
      const { rerender } = render(
        <Modal open onClose={() => {}} title="T">
          <p>tanpa input</p>
        </Modal>,
      )
      await waitFor(() => expect(screen.getByRole('button', { name: 'Tutup' })).toHaveFocus())
      rerender(<Modal open={false} onClose={() => {}} title="T" />)
      expect(trigger).toHaveFocus()
      expect(document.body.style.overflow).toBe('')
      trigger.remove()
    })

    it('Tab berputar di dalam dialog (maju & mundur) dan mengabaikan tombol lain', async () => {
      setup()
      await waitFor(() => expect(screen.getByLabelText('isi')).toHaveFocus())
      const close = screen.getByRole('button', { name: 'Tutup' })
      const save = screen.getByRole('button', { name: 'Simpan' })
      save.focus()
      await userEvent.tab()
      expect(close).toHaveFocus()
      await userEvent.tab({ shift: true })
      expect(save).toHaveFocus()
      screen.getByLabelText('isi').focus()
      await userEvent.tab()
      expect(save).toHaveFocus()
      await userEvent.keyboard('a')
    })

    it('Tab tidak melakukan apa pun bila semua elemen fokus dinonaktifkan', () => {
      setup()
      screen.getAllByRole('button').forEach((b) => (b.disabled = true))
      screen.getByLabelText('isi').disabled = true
      expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow()
    })
  })
})

describe('KebabMenu', () => {
  const setup = () => {
    const onSelect = vi.fn()
    render(
      <>
        <p>luar</p>
        <KebabMenu
          label="Aksi"
          items={[
            { key: 'a', text: 'Lihat', icon: Icons.Eye, onSelect },
            { key: 'b', text: 'Hapus', icon: Icons.Trash, danger: true, onSelect: vi.fn() },
          ]}
        />
      </>,
    )
    return onSelect
  }

  it('membuka, fokus ke item pertama, memilih, dan menutup', async () => {
    const onSelect = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Aksi' }))
    expect(screen.getByRole('menuitem', { name: 'Lihat' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Hapus' })).toHaveClass('text-red-700')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Lihat' }))
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('menutup lewat klik luar dan Escape (fokus kembali), mengabaikan klik dalam & tombol lain', async () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Aksi' })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('a')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.click(screen.getByText('luar'))
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('Markdown', () => {
  it('editor: nilai awal, perubahan, label aksesibel, dan destroy saat unmount', async () => {
    const onChange = vi.fn()
    const { unmount, container } = render(<MarkdownEditor value="awal" onChange={onChange} labelledBy="lbl" />)
    const editor = await waitForEditor()
    expect(editor.options.initialValue).toBe('awal')
    expect(editor.options.previewStyle).toBe('vertical')
    expect(container.querySelector('[contenteditable]')).toHaveAttribute('aria-labelledby', 'lbl')
    typeInEditor('# baru')
    expect(onChange).toHaveBeenCalledWith('# baru')
    unmount()
    expect(editor.destroyed).toBe(true)
  })

  it('editor: nilai kosong dan layar sempit memakai tab', async () => {
    const old = window.innerWidth
    window.innerWidth = 500
    render(<MarkdownEditor onChange={() => {}} labelledBy="x" />)
    const editor = await waitForEditor()
    expect(editor.options.initialValue).toBe('')
    expect(editor.options.previewStyle).toBe('tab')
    window.innerWidth = old
  })

  it('viewer: teks cadangan lalu TOAST UI Viewer (setTimeout)', async () => {
    const { unmount } = render(<MarkdownViewer content="halo **dunia**" />)
    expect(screen.getByTestId('markdown-fallback')).toHaveTextContent('halo **dunia**')
    await waitFor(() => expect(Viewer.instances.length).toBeGreaterThan(0), { timeout: 3000 })
    unmount()
    expect(Viewer.instances.at(-1).destroyed).toBe(true)
  })

  it('viewer: memakai requestIdleCallback bila tersedia dan membatalkannya', async () => {
    const cancel = vi.fn()
    window.requestIdleCallback = vi.fn((cb) => {
      setTimeout(cb, 0)
      return 7
    })
    window.cancelIdleCallback = cancel
    const first = render(<MarkdownViewer content="a" />)
    await waitFor(() => expect(Viewer.instances.length).toBeGreaterThan(0), { timeout: 3000 })
    first.unmount()
    expect(cancel).toHaveBeenCalledWith(7)
    delete window.requestIdleCallback
    delete window.cancelIdleCallback
  })

  it('viewer: unmount sebelum siap membersihkan timer', () => {
    const before = Viewer.instances.length
    render(<MarkdownViewer content="a" />).unmount()
    expect(Viewer.instances.length).toBe(before)
  })
})

describe('SiteFooter & WorkspaceShell', () => {
  it('footer menampilkan tautan masuk/daftar hanya untuk tamu', async () => {
    const guest = renderWithAuth(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'Halaman Login' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Halaman Register' })).toBeInTheDocument()
    guest.unmount()
    renderWithAuth(<SiteFooter />, { user: makeUser() })
    expect(screen.queryByRole('link', { name: 'Halaman Login' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Beranda Publik' })).toBeInTheDocument()
  })

  it('WorkspaceShell: tab aktif, tab admin, dan keluar', async () => {
    const onLogout = vi.fn()
    const member = renderWithAuth(
      <WorkspaceShell path="/author" onLogout={onLogout}>
        <p>isi</p>
      </WorkspaceShell>,
      { user: makeUser() },
    )
    expect(screen.getByRole('link', { name: 'Ruang Penulis' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Panel Admin' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Keluar/ }))
    expect(onLogout).toHaveBeenCalled()
    member.unmount()
    renderWithAuth(
      <WorkspaceShell path="/admin" onLogout={onLogout}>
        <p>isi</p>
      </WorkspaceShell>,
      { user: makeUser({ role: 'admin', username: 'admin' }) },
    )
    expect(await screen.findByRole('link', { name: 'Panel Admin' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Ruang Penulis' })).not.toHaveAttribute('aria-current')
  })
})
