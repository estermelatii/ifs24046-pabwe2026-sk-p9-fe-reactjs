import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { fail, makePost, makeUser, mockFetch, ok, renderWithAuth, typeInEditor, waitForEditor } from '../../testUtils'
import * as api from './api/blogApi'
import ArticleCard from './components/ArticleCard'
import PostStats from './components/PostStats'
import PublicArticleDetail from './components/PublicArticleDetail'
import PublicArticleList from './components/PublicArticleList'
import StickyNavbar from './components/StickyNavbar'
import AiPostGeneratorModal from './modals/AiPostGeneratorModal'
import PostModal, { CATEGORIES } from './modals/PostModal'

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) } }))

const apiPost = (o) => makePost(o)

describe('blogApi', () => {
  it('memanggil endpoint dan memetakan data', async () => {
    const calls = mockFetch({
      'GET /api/public/categories': ok(['Umum']),
      'GET /api/public/posts': ok([apiPost()]),
      'GET /api/public/posts/a%20b': ok(apiPost()),
      'GET /api/posts': ok([apiPost()]),
      'GET /api/posts/stats': ok({ total: 3, published: 2, draft: 1 }),
      'GET /api/posts/4': ok(apiPost()),
      'POST /api/posts': ok(apiPost()),
      'PUT /api/posts/3': ok(apiPost()),
      'PATCH /api/posts/3/toggle-publish': ok(apiPost()),
      'DELETE /api/posts/3': ok(null),
      'POST /api/posts/ai-generate': ok({}),
    })
    await api.getCategories()
    expect((await api.getPublicPosts())[0].author_name).toBe('Member Demo')
    await api.getPublicPosts({ q: 'go', category: 'Umum' })
    await api.getPublicPosts({ category: 'Semua' })
    expect((await api.getPublicPost('a b')).user_id).toBe(2)
    expect((await api.getMyPosts())[0].author_name).toBe('Member Demo')
    expect(await api.getMyStats()).toEqual({ total_articles: 3, total_selesai: 2, belum_selesai: 1 })
    await api.getMyPost(4)
    await api.createPost({})
    await api.updatePost(3, {})
    await api.togglePublish(3)
    await api.deletePost(3)
    await api.aiGenerate({})
    const paths = calls.map((c) => `${c.method} ${c.path}`)
    expect(paths).toContain('GET /api/public/posts?q=go&category=Umum')
    expect(paths).toContain('GET /api/public/posts')
    expect(paths).toContain('DELETE /api/posts/3')
  })
})

describe('komponen kecil', () => {
  it('ArticleCard: tone band/terang, dengan dan tanpa ringkasan', () => {
    const post = { ...apiPost(), author_name: 'Ani' }
    const { rerender, container } = render(<ArticleCard post={post} />)
    expect(screen.getByRole('link', { name: 'Baca: Belajar Golang' })).toHaveAttribute('href', '/posts/belajar-golang')
    expect(screen.getByText('Ringkasan artikel')).toHaveClass('text-muted')
    expect(container.querySelector('h3')).toBeInTheDocument()
    rerender(<ArticleCard post={{ ...post, excerpt: '' }} tone="band" level={2} />)
    expect(container.querySelector('h2')).toBeInTheDocument()
    expect(screen.queryByText('Ringkasan artikel')).toBeNull()
    rerender(<ArticleCard post={post} tone="band" />)
    expect(screen.getByText('Ringkasan artikel')).toHaveClass('text-white')
  })

  it('PostStats: nilai, nol bila kosong, dan null', () => {
    const { rerender } = render(<PostStats stats={{ total_articles: 3, total_selesai: 2, belum_selesai: 1 }} />)
    expect(screen.getByTestId('stat-Total Artikel')).toHaveTextContent('3')
    expect(screen.getByTestId('stat-Terbit')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-Draf')).toHaveTextContent('1')
    rerender(<PostStats stats={{}} />)
    expect(screen.getByTestId('stat-Terbit')).toHaveTextContent('0')
    rerender(<PostStats stats={null} />)
    expect(screen.getByTestId('stat-Draf')).toHaveTextContent('0')
  })
})

describe('StickyNavbar', () => {
  it('tamu melihat Masuk/Daftar; beranda aktif untuk / dan /public', async () => {
    const { rerender } = renderWithAuth(<StickyNavbar path="/" onLogout={() => {}} />)
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Daftar' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('link', { name: 'Beranda' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Cari artikel' })).toHaveAttribute('href', '/#artikel')
    expect(screen.getByRole('link', { name: 'Delcom Blog, ke beranda' })).toBeInTheDocument()
    rerender(<StickyNavbar path="/public" onLogout={() => {}} />)
    expect(screen.getByRole('link', { name: 'Beranda' })).toHaveAttribute('aria-current', 'page')
  })

  it('beranda tidak aktif di halaman lain', () => {
    renderWithAuth(<StickyNavbar path="/login" onLogout={() => {}} />)
    expect(screen.getByRole('link', { name: 'Beranda' })).not.toHaveAttribute('aria-current')
  })

  it('member: Ruang Penulis dan keluar', async () => {
    const onLogout = vi.fn()
    renderWithAuth(<StickyNavbar path="/" onLogout={onLogout} />, { user: makeUser() })
    expect(await screen.findByRole('link', { name: /Ruang Penulis/ })).toHaveAttribute('href', '/author')
    await userEvent.click(screen.getByRole('button', { name: /Keluar/ }))
    expect(onLogout).toHaveBeenCalled()
  })

  it('admin: Panel Admin', async () => {
    renderWithAuth(<StickyNavbar path="/" onLogout={() => {}} />, { user: makeUser({ role: 'admin' }) })
    expect(await screen.findByRole('link', { name: /Panel Admin/ })).toHaveAttribute('href', '/admin')
  })
})

describe('PublicArticleList', () => {
  const base = () => ({
    'GET /api/public/categories': ok(['Teknologi', 'Umum']),
    'GET /api/public/posts': ok([apiPost(), apiPost({ id: 2, title: 'Artikel Dua', slug: 'artikel-dua' })]),
  })

  it('tamu: hero dengan tombol masuk/daftar dan galeri', async () => {
    renderWithAuth(<PublicArticleList />, { handlers: base() })
    expect(await screen.findByRole('link', { name: 'Baca: Artikel Dua' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Masuk' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Daftar Penulis' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Teknologi' })).toBeInTheDocument()
    expect(screen.getByText('2 artikel ditemukan')).toBeInTheDocument()
  })

  it('member dan admin: tombol Buka ruang kerja', async () => {
    const member = renderWithAuth(<PublicArticleList />, { handlers: base(), user: makeUser() })
    expect(await screen.findByRole('link', { name: 'Buka ruang kerja' })).toHaveAttribute('href', '/author')
    member.unmount()
    renderWithAuth(<PublicArticleList />, { handlers: base(), user: makeUser({ role: 'admin' }) })
    expect(await screen.findByRole('link', { name: 'Buka ruang kerja' })).toHaveAttribute('href', '/admin')
  })

  it('menekan Enter pada kolom pencarian tidak memuat ulang halaman', async () => {
    renderWithAuth(<PublicArticleList />, { handlers: base() })
    await screen.findByRole('link', { name: 'Baca: Artikel Dua' })
    const input = screen.getByLabelText(/Cari artikel berdasarkan/)
    await userEvent.type(input, 'go{Enter}')
    expect(input).toHaveValue('go')
  })

  it('menampilkan pemuat saat pertama kali memuat', () => {
    renderWithAuth(<PublicArticleList />, { handlers: base() })
    expect(screen.getAllByText('Memuat artikel...').length).toBeGreaterThan(0)
  })

  it('pencarian real-time dan filter kategori memakai query yang benar', async () => {
    const { calls } = renderWithAuth(<PublicArticleList />, { handlers: base() })
    await screen.findByRole('link', { name: 'Baca: Artikel Dua' })
    await userEvent.type(screen.getByLabelText(/Cari artikel berdasarkan/), 'go')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/public/posts?q=go')).toBe(true))
    await userEvent.click(await screen.findByRole('button', { name: 'Umum' }))
    await waitFor(() => expect(calls.some((c) => c.path === '/api/public/posts?q=go&category=Umum')).toBe(true))
    expect(screen.getByRole('button', { name: 'Umum' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Semua' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('kategori bawaan dipakai bila API kategori gagal; daftar null dianggap kosong', async () => {
    renderWithAuth(<PublicArticleList />, { handlers: { 'GET /api/public/categories': fail(500, 'x'), 'GET /api/public/posts': ok(null) } })
    expect(await screen.findByText('Belum ada artikel yang cocok.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bisnis' })).toBeInTheDocument()
    expect(screen.getByText('0 artikel ditemukan')).toBeInTheDocument()
  })

  it('menampilkan galat galeri', async () => {
    renderWithAuth(<PublicArticleList />, { handlers: { 'GET /api/public/categories': ok([]), 'GET /api/public/posts': fail(500, 'Server error') } })
    expect(await screen.findByText('Server error')).toBeInTheDocument()
  })

  it('permintaan lama dibatalkan (AbortError) tanpa menampilkan galat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, init) => {
        const respond = (data) => Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) })
        if (String(url).includes('categories')) return respond(['Umum'])
        if (String(url).includes('category=Umum')) return respond([apiPost({ title: 'Terbaru' })])
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' }))))
      }),
    )
    render(
      <AuthProvider>
        <PublicArticleList />
      </AuthProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Umum' }))
    expect(await screen.findByRole('link', { name: 'Baca: Terbaru' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('PublicArticleDetail', () => {
  it('memuat lalu menampilkan artikel lengkap', async () => {
    mockFetch({ 'GET /api/public/posts/belajar-golang': ok(apiPost({ cover_image_path: 'https://x.test/c.png' })) })
    render(<PublicArticleDetail slug="belajar-golang" />)
    expect(screen.getByText('Memuat artikel...')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Belajar Golang' })).toBeInTheDocument()
    expect(screen.getByText('Ringkasan artikel')).toBeInTheDocument()
    expect(screen.getByText('Member Demo')).toBeInTheDocument()
    expect(screen.getByText(/3 menit baca/)).toBeInTheDocument()
    expect(document.title).toContain('Belajar Golang')
  })

  it('artikel tanpa ringkasan', async () => {
    mockFetch({ 'GET /api/public/posts/x': ok(apiPost({ excerpt: '' })) })
    render(<PublicArticleDetail slug="x" />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText('Ringkasan artikel')).toBeNull()
  })

  it('404: artikel tidak ada', async () => {
    mockFetch({ 'GET /api/public/posts/hilang': fail(404, 'Artikel tidak ditemukan') })
    render(<PublicArticleDetail slug="hilang" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'artikel tidak ada' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('belum diterbitkan')
    expect(screen.getByRole('link', { name: 'Kembali ke beranda' })).toBeInTheDocument()
    expect(document.title).toContain('Artikel tidak ditemukan')
  })

  it('galat lain menampilkan pesan dari server', async () => {
    mockFetch({ 'GET /api/public/posts/x': fail(500, 'Server rusak') })
    render(<PublicArticleDetail slug="x" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'gagal memuat' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Server rusak')
  })

  it('berpindah slug memuat ulang dan mengabaikan respons lama', async () => {
    mockFetch({
      'GET /api/public/posts/a': ok(apiPost({ title: 'Artikel A' })),
      'GET /api/public/posts/b': ok(apiPost({ title: 'Artikel B' })),
    })
    const { rerender, unmount } = render(<PublicArticleDetail slug="a" />)
    rerender(<PublicArticleDetail slug="b" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Artikel B' })).toBeInTheDocument()
    unmount()
  })

  it('unmount sebelum respons selesai tidak memperbarui state (sukses & gagal)', async () => {
    let release
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => (release = r))))
    const ok1 = render(<PublicArticleDetail slug="a" />)
    ok1.unmount()
    release({ ok: true, status: 200, json: async () => ({ status: 'success', data: apiPost() }) })
    const bad = render(<PublicArticleDetail slug="b" />)
    bad.unmount()
    release({ ok: false, status: 500, json: async () => ({ status: 'fail', message: 'x' }) })
    await new Promise((r) => setTimeout(r, 20))
  })
})

describe('PostModal', () => {
  const open = (props = {}) => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    const utils = render(<PostModal open onClose={onClose} onSaved={onSaved} {...props} />)
    return { onClose, onSaved, ...utils }
  }

  it('tidak merender apa pun saat tertutup', () => {
    render(<PostModal open={false} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('memvalidasi judul dan isi', async () => {
    const calls = mockFetch({})
    open()
    await waitForEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(screen.getByText('Judul wajib diisi.')).toBeInTheDocument()
    expect(screen.getByText('Konten artikel wajib diisi.')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('membuat artikel baru', async () => {
    const calls = mockFetch({ 'POST /api/posts': ok(apiPost()) })
    const { onSaved } = open()
    expect(screen.getByRole('dialog', { name: 'Tambah Artikel' })).toBeInTheDocument()
    await waitForEditor()
    await userEvent.type(screen.getByLabelText('Judul'), ' Judul Baru ')
    await userEvent.selectOptions(screen.getByLabelText('Kategori'), 'Bisnis')
    await userEvent.type(screen.getByLabelText(/Ringkasan/), ' ringkas ')
    await userEvent.type(screen.getByLabelText(/Alamat gambar/), 'https://x.test/a.png')
    typeInEditor('# isi')
    await userEvent.click(screen.getByLabelText('Terbitkan sekarang'))
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls[0].body).toEqual({ title: 'Judul Baru', category: 'Bisnis', excerpt: 'ringkas', content: '# isi', cover_image_path: 'https://x.test/a.png', is_published: true })
  })

  it('mengubah artikel yang ada dengan nilai awal terisi', async () => {
    const calls = mockFetch({ 'PUT /api/posts/1': ok(apiPost()) })
    const { onSaved } = open({ post: apiPost({ is_published: true }) })
    expect(screen.getByRole('dialog', { name: 'Edit Artikel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Judul')).toHaveValue('Belajar Golang')
    expect(screen.getByLabelText('Terbitkan sekarang')).toBeChecked()
    await waitForEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calls[0].method).toBe('PUT')
  })

  it('draf AI: nilai awal dari initial, kategori tak dikenal menjadi Umum, tidak terbit', async () => {
    open({ initial: { title: 'Draf AI', category: 'Aneh', excerpt: 'r', content: 'isi', cover_image_path: 'https://x.test/a.png' } })
    expect(screen.getByLabelText('Judul')).toHaveValue('Draf AI')
    expect(screen.getByLabelText('Kategori')).toHaveValue('Umum')
    expect(screen.getByLabelText('Terbitkan sekarang')).not.toBeChecked()
    expect((await waitForEditor()).options.initialValue).toBe('isi')
  })

  it('draf AI tanpa kategori memakai Umum; kategori valid dipertahankan; artikel tanpa field', async () => {
    const { rerender } = open({ initial: { title: 'A' } })
    expect(screen.getByLabelText('Kategori')).toHaveValue('Umum')
    rerender(<PostModal open onClose={() => {}} onSaved={() => {}} initial={{ title: 'B', category: 'Opini' }} />)
    await waitFor(() => expect(screen.getByLabelText('Kategori')).toHaveValue('Opini'))
    rerender(<PostModal open onClose={() => {}} onSaved={() => {}} post={{ id: 9 }} />)
    await waitFor(() => expect(screen.getByLabelText('Judul')).toHaveValue(''))
  })

  it('menampilkan galat server dan tombol batal', async () => {
    mockFetch({ 'POST /api/posts': fail(422, 'Judul sudah dipakai') })
    const { onClose } = open({ initial: { title: 'A', content: 'isi' } })
    await waitForEditor()
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Judul sudah dipakai')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(onClose).toHaveBeenCalled()
    expect(CATEGORIES).toContain('Umum')
  })
})

describe('AiPostGeneratorModal', () => {
  const draft = {
    title: 'Artikel AI',
    category: 'Teknologi',
    excerpt: 'Ringkasan AI',
    content: 'Isi AI',
    reading_time: 2,
    sources: [{ url: 'https://a.test', title: 'Sumber A', snippet: 'cuplikan' }, { url: 'https://b.test' }],
  }
  const setup = () => {
    const onClose = vi.fn()
    const onApply = vi.fn()
    const utils = render(<AiPostGeneratorModal open onClose={onClose} onApply={onApply} />)
    return { onClose, onApply, ...utils }
  }

  it('tertutup tidak merender dialog', () => {
    render(<AiPostGeneratorModal open={false} onClose={() => {}} onApply={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('topik kosong ditolak', async () => {
    const calls = mockFetch({})
    setup()
    expect(screen.getByRole('button', { name: 'Terapkan ke Editor' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Buat Draf Artikel/ }))
    expect(screen.getByText('Topik wajib diisi.')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('menghasilkan draf dengan sumber lalu menerapkannya', async () => {
    const calls = mockFetch({ 'POST /api/posts/ai-generate': ok(draft) })
    const { onApply, onClose } = setup()
    await userEvent.type(screen.getByLabelText('Topik artikel'), ' Golang ')
    await userEvent.selectOptions(screen.getByLabelText(/Kategori/), 'Teknologi')
    await userEvent.click(screen.getByRole('button', { name: /Buat Draf Artikel/ }))
    const preview = await screen.findByRole('region', { name: 'Pratinjau draf' })
    expect(calls[0].body).toEqual({ topic: 'Golang', category: 'Teknologi', include_web_search: true })
    expect(within(preview).getByText('Artikel AI')).toBeInTheDocument()
    expect(within(preview).getByRole('link', { name: 'Sumber A' })).toHaveAttribute('href', 'https://a.test')
    expect(within(preview).getByText('cuplikan')).toBeInTheDocument()
    expect(within(preview).getByRole('link', { name: 'https://b.test' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Terapkan ke Editor' }))
    expect(onApply).toHaveBeenCalledWith(draft)
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('tanpa penelusuran web dan tanpa sumber', async () => {
    const calls = mockFetch({ 'POST /api/posts/ai-generate': ok({ ...draft, sources: [] }) })
    setup()
    await userEvent.click(screen.getByLabelText(/Sertakan penelusuran/))
    await userEvent.type(screen.getByLabelText('Topik artikel'), 'Golang')
    await userEvent.click(screen.getByRole('button', { name: /Buat Draf Artikel/ }))
    await screen.findByRole('region', { name: 'Pratinjau draf' })
    expect(calls[0].body.include_web_search).toBe(false)
    expect(screen.queryByText('Sumber rujukan')).toBeNull()
  })

  it('respons tanpa field sources', async () => {
    mockFetch({ 'POST /api/posts/ai-generate': ok({ ...draft, sources: undefined }) })
    setup()
    await userEvent.type(screen.getByLabelText('Topik artikel'), 'Golang')
    await userEvent.click(screen.getByRole('button', { name: /Buat Draf Artikel/ }))
    await screen.findByText('Artikel AI')
    expect(screen.queryByText('Sumber rujukan')).toBeNull()
  })

  it('menampilkan status memuat dan galat dari server', async () => {
    let release
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => (release = r))))
    setup()
    await userEvent.type(screen.getByLabelText('Topik artikel'), 'Golang')
    await userEvent.click(screen.getByRole('button', { name: /Buat Draf Artikel/ }))
    expect(await screen.findByText(/1–2 menit/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI sedang menulis/ })).toBeDisabled()
    release({ ok: false, status: 503, json: async () => ({ status: 'fail', message: 'AI belum dikonfigurasi' }) })
    expect(await screen.findByText('AI belum dikonfigurasi')).toBeInTheDocument()
  })

  it('membuka ulang modal mengosongkan isian', async () => {
    mockFetch({})
    const { rerender } = setup()
    await userEvent.type(screen.getByLabelText('Topik artikel'), 'Sisa')
    rerender(<AiPostGeneratorModal open={false} onClose={() => {}} onApply={() => {}} />)
    rerender(<AiPostGeneratorModal open onClose={() => {}} onApply={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Topik artikel')).toHaveValue(''))
  })
})
