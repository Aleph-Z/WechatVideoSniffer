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
import yauzl from 'yauzl'

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

  #urlCache = new Set

  #aria2Bin = "aria2c.exe"
  #aria2Webui = 'aria2_page.cc'

  get currentWebUIFile() {
    return path.join(__dirname, this.#aria2Webui)
  }

  #webuiCacheData = ""

  async getWebuiData() {
    if (this.#webuiCacheData) return this.#webuiCacheData
    // copy by ChatGPT
    const data = await new Promise((resolve, reject)=> {
      yauzl.open(this.currentWebUIFile, {lazyEntries: true}, (_, zipFile)=> {
        zipFile.readEntry()
        zipFile.on('entry', entry=> {
          if (entry.fileName === 'index.html') {
            zipFile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err);
                return;
              }
              let chunks = [];
              readStream.on('data', (chunk) => {
                chunks.push(chunk);
              });
              readStream.on('end', () => {
                let buffer = Buffer.concat(chunks);
                let content = buffer.toString();
                resolve(content);
              });
            });
          } else {
            zipFile.readEntry();
          }
        })
      })
    })
    this.#webuiCacheData = data
    return data
  }

  async init() {
    const isNext = await this.check()
    if (!isNext) {
      console.log('windows系统自动下载aria2.exe')
      if (isWin) {
        await this.downloadBin()
      }
      if (!fs.existsSync(this.currentWebUIFile)) {
        console.log('webui配置文件不存在自动下载')
        await this.downloadWebUI()
      }
    }
    console.log('aria2-server 启动成功')
    this.start()
    setTimeout(async ()=> {
      this.#ctx = new aria2()
      await this.#ctx.open()
      this.#ctx.on('onDownloadComplete', par=> {
        // TODO: impl this
        console.log("文件下载完成", par) 
      }).on('onDownloadError', par=> {
        // TODO: impl this
        console.log('文件下载失败', par)
      })
    }, 1200)
  }

  async downloadBin() {
    // https://github.com/agalwood/Motrix/blob/7012040fec926e16fe8f6c403cf038527f5c18b9/extra/win32/x64/engine/aria2c.exe
    const url = "https://ghproxy.com/https://github.com/agalwood/Motrix/raw/7012040fec926e16fe8f6c403cf038527f5c18b9/extra/win32/x64/engine/aria2c.exe"
    const binPipe = new downloader({
      fileName: this.#aria2Bin,
      url,
      directory: path.normalize(__dirname),
    })
    await binPipe.download()
  }

  async downloadWebUI() {
    const webui = "https://ghproxy.com/https://github.com/mayswind/AriaNg/releases/download/1.3.6/AriaNg-1.3.6-AllInOne.zip"
    const webuiPipe = new downloader({
      fileName: this.#aria2Webui,
      url: webui,
      directory: path.normalize(__dirname),
    })
    await webuiPipe.download()
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
    // fixme cert link https://github.com/aria2/aria2/issues/889
    console.log('start aria2 server', new Date)
    const exec = isWin ? this.execPath : this.execName
    console.log('current exec path is', exec)
    const { stdout } = await execa(exec, [ '--check-certificate=false', '--enable-rpc', '--rpc-listen-all=true', '--rpc-allow-origin-all'])
    console.log(stdout)
  }

  /**
   * @param {string} raw 
   * @returns {string}
   */
  #getID(raw) {
    const [ , id ] = raw.match(/trtc.*\/(.*)\.flv/) || []
    return id
  }

  /**
   * 
   * @param {string} url 
   */
  download(url) {
    console.log('download task add url is {}'.format(url))
    const id = this.#getID(url)
    if (this.#urlCache.has(url) || this.#urlCache.has(id)) {
      console.log("current task has exist")
      return
    }
    console.log('download task start {}'.format(url))
    this.#urlCache.add(url)
    if (!!id) this.#urlCache.add(id)
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

router.get('/', async ctx=> {
  ctx.type = 'html'
  const data = await evil.getWebuiData()
  ctx.body = data
})

router.get('/ping', _=> {
  const msg = 'pong! current time is: {}'.format((new Date).toString())
  console.log(msg)
  _.body = msg
})

router.post('/api', ctx=> {
  const { url } = ctx.request.body
  console.log('/api request url is {}, start download'.format(url))
  evil.download(url)
  ctx.body = url
})

router.get('/api', ctx=> {
  const msg = '/api GET method demo response' + (new Date).toString()
  console.log(msg)
  ctx.body = msg
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