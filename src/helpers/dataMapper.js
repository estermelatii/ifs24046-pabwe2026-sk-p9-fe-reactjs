// Menyamakan bentuk data dari backend ke bentuk yang dipakai komponen UI.
// Backend mengirim stats {total, published, draft}, artikel {author:{id,name,username}}, dan
// pengguna {posts_count, published_count}; nama lama (total_articles, author_name, dst.) tetap didukung.

export function normalizeStats(stats) {
  if (!stats) return null
  return {
    total_articles: stats.total_articles ?? stats.total ?? 0,
    total_selesai: stats.total_selesai ?? stats.published ?? 0,
    belum_selesai: stats.belum_selesai ?? stats.draft ?? 0,
  }
}

export function normalizePost(post) {
  if (!post) return post
  const author = post.author ?? {}
  return {
    ...post,
    author_name: post.author_name ?? author.name ?? author.username ?? '',
    user_id: post.user_id ?? author.id,
  }
}

export const normalizePosts = (posts) => (Array.isArray(posts) ? posts.map(normalizePost) : posts)

export function normalizeUser(user) {
  return {
    ...user,
    total_articles: user.total_articles ?? user.posts_count ?? 0,
    total_published: user.total_published ?? user.published_count ?? 0,
  }
}

export const normalizeUsers = (users) => (Array.isArray(users) ? users.map(normalizeUser) : users)
