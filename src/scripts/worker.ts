// Worker 进程入口
import 'dotenv/config'
import { startWorkerLoop } from '@/lib/worker/generation-worker'

log('Starting EVSS V2 generation worker...')

try {
  startWorkerLoop()
} catch (err) {
  console.error('[worker] Fatal error, keeping process alive for PM2 restart:', err)
  // 不直接退出，让 PM2 重启
}

function log(msg: string) {
  console.log(`[worker-entry] ${msg}`)
}
