import express from 'express'
import fs from 'fs'
import pino from 'pino'
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  jidNormalizedUser,
  fetchLatestBaileysVersion
} from 'baileys'
import { upload } from './mega.js'

const router = express.Router()

function removeFile(path) {
  try {
    if (fs.existsSync(path)) {
      fs.rmSync(path, { recursive: true, force: true })
    }
  } catch (e) {
    console.error('Remove error:', e)
  }
}

router.get('/', async (req, res) => {
  let num = req.query.number

  if (!num) {
    return res.status(400).json({ error: 'Number is required' })
  }

  num = num.replace(/[^0-9]/g, '')
  const sessionDir = `./session_${num}`

  removeFile(sessionDir)

  async function initiateSession() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
      const { version } = await fetchLatestBaileysVersion() // ✅ FIX

      const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: true
      })

      if (!sock.authState.creds.registered) {
        await delay(1500)
        const code = await sock.requestPairingCode(num)

        if (!res.headersSent) {
          return res.json({ code })
        }
      }

      sock.ev.on('creds.update', saveCreds)

      sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
          await delay(5000)

          const megaUrl = await upload(
            fs.createReadStream(`${sessionDir}/creds.json`),
            `session_${Date.now()}.json`
          )

          const sessionId =
            'RASHU-MD=' + megaUrl.replace('https://mega.nz/file/', '')

          const userJid = jidNormalizedUser(num + '@s.whatsapp.net')

          await sock.sendMessage(userJid, { text: sessionId })
          await sock.sendMessage(userJid, {
            text:
              '*🪄 QUEEN RASHU MD 🪄*\n\n' +
              'SESSION SUCCESSFUL ✅\n\n' +
              'Session ID එක share කරන්න එපා ❗\n\n' +
              '> POWERED BY QUEEN RASHU MD'
          })

          await delay(200)
          removeFile(sessionDir)
        }

        if (
          connection === 'close' &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          await delay(5000)
          initiateSession()
        }
      })
    } catch (err) {
      console.error('Session error:', err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Server error' })
      }
    }
  }

  initiateSession()
})

export default router