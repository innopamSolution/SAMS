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

// 메모·아이템 공개 여부를 개발 서버의 파일(.data-cache/store/*.json)에 저장한다 — 어느 브라우저에서 열어도 같은 내용이 보인다.
// (이 PC의 개발 서버에서만 동작한다. 정적 배포에서는 요청이 실패하므로 앱은 브라우저 저장소만 쓴다.)
function spatialLogStore() {
  const dir = path.resolve(import.meta.dirname, '.data-cache/store')
  const NAMES = new Set(['annotations', 'itemStatus'])
  return {
    name: 'spatiallog-store',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = (req.url || '').split('?')[0].match(/^\/SAMS\/api\/store\/([A-Za-z]+)$/)
        if (!m || !NAMES.has(m[1])) return next()
        const file = path.join(dir, m[1] + '.json')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'GET') {
          if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('none') }
          res.setHeader('Content-Type', 'application/json')
          return fs.createReadStream(file).pipe(res)
        }
        if (req.method === 'PUT') {
          const chunks = []; let size = 0
          req.on('data', (c) => { size += c.length; if (size > 100 * 1024 * 1024) { res.statusCode = 413; res.end('too large'); req.destroy() } else chunks.push(c) })
          req.on('end', () => {
            try {
              const text = Buffer.concat(chunks).toString('utf-8')
              JSON.parse(text)
              fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(file + '.tmp', text)
              fs.renameSync(file + '.tmp', file)
              res.statusCode = 204; res.end()
            } catch { res.statusCode = 400; res.end('bad json') }
          })
          return
        }
        res.statusCode = 405; res.end()
      })
    },
  }
}

export default defineConfig({
  base: '/SAMS/',
  plugins: [react(), spatialLogTiles(), spatialLogStore()],
  server: {
    port: Number(process.env.PORT) || 5184,
  },
})
