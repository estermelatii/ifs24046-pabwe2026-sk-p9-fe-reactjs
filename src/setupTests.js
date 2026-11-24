import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// TOAST UI memerlukan canvas/selection penuh; di JSDOM cukup diganti stub yang bisa diperiksa tes.
vi.mock('@toast-ui/editor', () => {
  class Editor {
    static instances = []
    constructor(options) {
      this.options = options
      this.value = options.initialValue
      this.destroyed = false
      options.el.innerHTML = '<div contenteditable="true"></div>'
      Editor.instances.push(this)
    }
    getMarkdown() {
      return this.value
    }
    destroy() {
      this.destroyed = true
    }
  }
  return { default: Editor }
})

vi.mock('@toast-ui/editor/dist/toastui-editor-viewer', () => {
  class Viewer {
    static instances = []
    constructor(options) {
      this.options = options
      this.destroyed = false
      options.el.textContent = options.initialValue
      Viewer.instances.push(this)
    }
    destroy() {
      this.destroyed = true
    }
  }
  return { default: Viewer }
})

afterEach(async () => {
  cleanup()
  ;(await import('@toast-ui/editor')).default.instances.length = 0
  ;(await import('@toast-ui/editor/dist/toastui-editor-viewer')).default.instances.length = 0
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {},
  })
}
window.scrollTo = () => {}
