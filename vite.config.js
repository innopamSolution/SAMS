import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 외장하드 Spatial Log 폴더에서 풀어 둔 3D 타일(.data-cache/tiles)을 개발 서버가 /spatiallog/ 로 내준다.
// (public 폴더의 링크는 서버가 따라가지 않아, 전용 미들웨어로 읽는다. 배포 빌드에는 포함되지 않는다.)
function spatialLogTiles() {
  const root = path.resolve(import.meta.dirname, '.data-cache/tiles')
  const types = { '.json': 'application/json', '.b3dm': 'application/octet-stream', '.glb': 'model/gltf-binary', '.pnts': 'application/octet-stream' }
  return {
    name: 'spatiallog-tiles',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = (req.url || '').split('?')[0].match(/^\/SAMS\/spatiallog\/(.+)$/)
        if (!m) return next()
        const file = path.join(root, decodeURIComponent(m[1]))
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end('not found') }
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  base: '/SAMS/',
  plugins: [react(), spatialLogTiles()],
  server: {
    port: Number(process.env.PORT) || 5184,
  },
})
