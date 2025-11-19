import express from 'express';
import fs from 'fs';
import pino from 'pino';
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);
   
    await removeFile(dirs);

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            let conn = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" }).child({ level: "fatal" })
                    ),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS('Safari')
            });

            if (!conn.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await conn.requestPairingCode(num);

                if (!res.headersSent) {
                    console.log({ num, code });
                    return res.send({ code });
                }
            }

            conn.ev.on('creds.update', saveCreds);

            conn.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {

                    await delay(5000);

                    function randomID(len = 6, nlen = 4) {
                        const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let txt = '';
                        for (let i = 0; i < len; i++) txt += abc[Math.floor(Math.random() * abc.length)];
                        const num = Math.floor(Math.random() * Math.pow(10, nlen));
                        return `${txt}${num}`;
                    }

                    const sessionFile = `${dirs}/creds.json`;
                    const megaUrl = await upload(fs.createReadStream(sessionFile), `${randomID()}.json`);

                    let stringSession = megaUrl.replace('https://mega.nz/file/', '');
                    stringSession = 'RASHU-MD=' + stringSession;

                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                    await conn.sendMessage(userJid, { text: stringSession });

                    await conn.sendMessage(userJid, {
                        text: "*🪄 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐃 New Update 💐*\n\n" +
                            "*SESSION SUCCESSFUL ✅*\n" +
                            "මෙ Session ID එක *කාටවත් දෙන්න එපා!* 😩💐\n\n" +
                            "┉┉┉┉┉┉┉┉[ ❤️‍🩹 ]┉┉┉┉┉┉┉┉\n" +
                            "*📌 WhatsApp Group*\nhttps://chat.whatsapp.com/GGwN8bjWtCDKrm7kuNCcnd\n\n" +
                            "*📌 WhatsApp Channel*\nhttps://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23\n\n" +
                            "*📌 RASHU Contact*\nwa.me/94727319036\n\n" +
                            "> Powered By QUEEN RASHU MD 🫟"
                    });

                    await delay(300);
                    removeFile(dirs);
                    process.exit(0);
                }

                else if (connection === "close" &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output?.statusCode !== 401
                ) {
                    console.log("Reconnecting...");
                    await delay(5000);
                    initiateSession();
                }
            });

        } catch (err) {
            console.error("Error:", err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

process.on('uncaughtException', (err) => {
    console.log('Caught exception: ' + err);
});

export default router;
