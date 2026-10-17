import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig({
  base: '/story-recorder/',
  plugins: [vue(), mkcert()],
  server: {
    https: true,
  }
})
