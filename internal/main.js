import Koa from 'koa'
import Router from '@koa/router'
import Cowsay from 'cowsay'
import os from 'os'
import path from 'path'
import fs from 'fs'
import cport from 'detect-port'
import aria2 from 'aria2'
import { execa, execaCommandSync } from 'execa'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { koaBody } from 'koa-body'
import { mkdirpSync } from 'mkdirp'
import downloader from 'nodejs-file-downloader'

const app = new Koa()
const router = new Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isWin = os.platform == 'win32'

// copy by ChatGPT
function getDownloadDir() {
  const homedir = os.homedir()
  let downloadDir
  if (process.platform === 'win32') {
    downloadDir = path.join(homedir, 'Downloads')
  } else if (process.platform === 'darwin') {
    downloadDir = path.join(homedir, 'Downloads')
  } else {
    downloadDir = path.join(homedir, 'Downloads')
  }
  return downloadDir
}

const downloadDir = getDownloadDir()
const wxDownloadDir = path.join(downloadDir, 'wx')

function isCommandExists(command) {
  try {
    execaCommandSync(`command -v ${command}`);
    return true;
  } catch (error) {
    return false;
  }
}

// ok. fine, I'm like python {} format
// https://stackoverflow.com/a/4974690
String.prototype.format = function () {
  var i = 0, args = arguments
  return this.replace(/{}/g, function () {
    return typeof args[i] != 'undefined' ? args[i++] : ''
  })
}

class Aria2Evil {

  #port = 6800
  /**
   * @type {aria2}
   */
  #ctx

  async init() {
    const isNext = await this.check()
    if (!isNext) {
      if (isWin) {
        console.log('windows系统自动下载aria2.exe')
        await this.downloadBin()
      } else {
        console.log('其他系统不支持')
        process.exit(1)
      }
    }
    console.log('aria2-server 启动成功')
    this.start()
    setTimeout(()=> {
      this.#ctx = new aria2()
    }, 1200)
  }

  async downloadBin() {
    // https://github.com/agalwood/Motrix/blob/7012040fec926e16fe8f6c403cf038527f5c18b9/extra/win32/x64/engine/aria2c.exe
    const url = "https://ghproxy.com/https://github.com/agalwood/Motrix/raw/7012040fec926e16fe8f6c403cf038527f5c18b9/extra/win32/x64/engine/aria2c.exe"
    const down = new downloader({
      fileName: 'aria2c.exe',
      url,
      directory: path.normalize(__dirname),
    })
    await down.download()
  }

  get execName() {
    const execName = isWin ? 'aria2c.exe' : 'aria2c'
    return execName
  }

  get execPath() {
    return path.join(__dirname, this.execName)
  }

  async start() {
    // https://github.com/sonnyp/aria2.js
    // aria2c --enable-rpc --rpc-listen-all=true --rpc-allow-origin-all
    console.log('start aria2 server', new Date)
    const exec = isWin ? this.execPath : this.execName
    console.log('current exec path is', exec)
    const { stdout } = await execa(exec, ['--enable-rpc', '--rpc-listen-all=true', '--rpc-allow-origin-all'])
    console.log(stdout)
  }

  /**
   * 
   * @param {string} url 
   */
  download(url) {
    this.#ctx.call('addUri', [url], {
      dir: wxDownloadDir,
    })
  }

  async check() {
    const isNext = isCommandExists(this.execName)
    // 1. 检测 aria2 二进制是否存在
    if (!fs.existsSync(this.execPath) && !isNext) {
      return false 
    }
    // 2. 检测端口是否被占用
    const isOpen = await cport(this.#port)
    return isOpen == this.#port
  }

}

const evil = new Aria2Evil()

router.get('/ping', _=> {
  const msg = 'pong! current time is: {}'.format((new Date).toString())
  _.body = msg
})

router.post('/api', ctx=> {
  const { url } = ctx.request.body
  evil.download(url)
  ctx.body = url
})

app.use(koaBody())

app.use(router.routes())

function serverCallback() {
  const msg = Cowsay.say({
    text : "current server running is {}".format('http://localhost:3000'),
    e : "oO",
    T : "U ",
  })
  console.log(msg)
}

;(async ()=> {
  mkdirpSync(wxDownloadDir)
  console.log('尝试创建下载目录($HOME/Downloads/wx)')
  await evil.init()
  app.listen(3000, serverCallback)
})()