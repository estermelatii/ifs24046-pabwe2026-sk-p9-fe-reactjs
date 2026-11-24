import { apiFetch } from '../../../helpers/apiHelper'
import { normalizePosts, normalizeUsers } from '../../../helpers/dataMapper'

export const getUsers = () => apiFetch('/api/admin/users').then(normalizeUsers)
export const getAllPosts = () => apiFetch('/api/admin/posts').then(normalizePosts)
export const getUserPosts = (id) => apiFetch(`/api/admin/users/${id}/posts`).then(normalizePosts)
