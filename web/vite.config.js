import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

/**
 * inline-sfc-script-src 插件
 * Vue 编译器不支持 <script setup src="./X.js"> 外置脚本，
 * 本插件在编译前将外置 .js 内容内联进 .vue 文件：
 * 源码层面每个模块仍是独立的 .html / .css / .js 文件，构建产物不受影响。
 */
function inlineSfcScriptSrc() {
  return {
    name: 'inline-sfc-script-src',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.vue')) return null
      if (!code.includes('<script setup src=')) return null
      const replaced = code.replace(
        /<script\s+setup\s+src="([^"]+)"\s*><\/script>/g,
        (match, src) => {
          const abs = path.resolve(path.dirname(id), src)
          let content = ''
          try {
            content = fs.readFileSync(abs, 'utf-8')
          } catch (e) {
            this.error(`inline-sfc-script-src: cannot read ${abs}: ${e.message}`)
          }
          return `<script setup>\n${content}\n</script>`
        }
      )
      return { code: replaced, map: null }
    }
  }
}

export default defineConfig({
  plugins: [vue(), inlineSfcScriptSrc()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
