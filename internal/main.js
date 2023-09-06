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

const kAria2MaxDownloadOption = 20

const isWin = os.platform == 'win32'

// https://stackoverflow.com/a/19448657
Date.prototype.YYYYMMDDHHMMSS = function () {
  var yyyy = this.getFullYear().toString();
  var MM = pad(this.getMonth() + 1,2);
  var dd = pad(this.getDate(), 2);
  var hh = pad(this.getHours(), 2);
  var mm = pad(this.getMinutes(), 2)
  var ss = pad(this.getSeconds(), 2)

  return yyyy + MM + dd+  hh + mm + ss;
}

function pad(number, length) {
  var str = '' + number;
  while (str.length < length) {
      str = '0' + str;
  }
  return str;
}

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

// copy by https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
function formatBytes(bytes,decimals) {
  if(bytes == 0) return '0 Bytes';
  var k = 1024,
      dm = decimals || 2,
      sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
      i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// https://bobbyhadz.com/blog/javascript-get-filename-without-path
function getFilename(fullPath) {
  return fullPath.replace(/^.*[\\\/]/, '');
}

// https://stackoverflow.com/a/19811573
function getRealFilename(filename) {
  return path.basename(filename, path.extname(filename))
}

function getExtension(filename) {
  var ext = path.extname(filename||'').split('.');
  return ext[ext.length - 1];
}

// TODO: 将 flv 转为 ffmpeg
class Convert {

  #ffmpeg = ""
  #outputDir = ""

  constructor(outputDir, bin) {
    if (bin) {
      this.#ffmpeg = bin
    }
    this.#outputDir = outputDir
  }

  // TODO: 下载 ffmpeg 二进制
  downloadBin() {

  }

  async exec(raw) {
    const filename = getFilename(raw)
    const realFilename = getRealFilename(filename)
    const outputFilename = path.join(this.#outputDir, realFilename)
    // TODO: 将 stdout 打印到 process.stdout
    const data = await execa(this.#ffmpeg, [
      "-i",
      raw,
      outputFilename,
    ])
    return data
  }
}


// 将下载好的文件同步到其他目录供百度云自动同步
class FLVSync {
  
  #target = ""

  #envKey = "NODE_SYNC"

  constructor(target) {
    if (target) {
      this.#target = target
    } else {
      this.initAsEnv()
    }
  } 

  // Windows 环境变量设置: setx NODE_SYNC D:\Downloads
  initAsEnv() {
    const _target = process.env[this.#envKey] || ""
    if (!_target) {
      console.log("需要设置环境变量: NODE_SYNC")
      if (isWin) {
        process.exit(1)
      }
    }
    this.#target = _target
  }

  exec(filename, outputFilename) {
    const old = path.join(wxDownloadDir, filename)
    const output = path.join(this.#target, outputFilename)
    const size = fs.statSync(old).size
    const humanSize=  formatBytes(size)
    const msg = '{} 准备同步到 {} 文件大小为 {}'.format(filename, this.#target, humanSize)
    console.log(msg)
    fs.copyFileSync(old, output)
    const taskDoneMsg = '{} 同步结束({})'.format(filename, output)
    console.log(taskDoneMsg)
  }

}

const Aria2RecordStatus = {
  Unknow: 0,
  Start: 1,
  End: 2,
}

class Aria2Record {

  #status = Aria2RecordStatus.Unknow
  #stashTime
  #flvUrl

  constructor(flvUrl) {
    this.#flvUrl = flvUrl
    this.#status = Aria2RecordStatus.Start
    this.#stashTime = new Date()
  }

  changeRecordToDone() {
    this.changeRecordStatus(Aria2RecordStatus.End)
  }

  changeRecordToStart() {
    this.changeRecordStatus(Aria2RecordStatus.Start)
  }

  get flv() {
    return this.#flvUrl
  }

  get statusToString() {
    switch (this.#status) {
      case Aria2RecordStatus.Start:
        return "录制中"
      case Aria2RecordStatus.End:
        return "录制结束"
      default:
        return "未知状态"
    }
  }

  get isOver() {
    return this.#status == Aria2RecordStatus.End
  }

  get fileName() {
    const time = this.#stashTime.YYYYMMDDHHMMSS()
    return `${this.statusToString}-${time}.flv`
  }

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

  flvSync = new FLVSync()

  tasks = new Map()

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
    }
    if (!fs.existsSync(this.currentWebUIFile)) {
      console.log('webui配置文件不存在自动下载')
      await this.downloadWebUI()
    }
    console.log('aria2-server 启动成功')
    this.start()
    setTimeout(async ()=> {
      this.#ctx = new aria2()
      await this.#ctx.open()
      this.#ctx.on('onDownloadComplete', async par=> {
        console.log("文件下载完成", par) 
        const filename = await this.mustQueryTaskFilename(par)
        const task = this.tasks.get(filename)
        task.changeRecordToDone()
        const outputFilename = task.fileName
        this.flvSync.exec(filename, outputFilename)
      }).on('onDownloadError', async par=> {
        // FIXME: 或许 flv 这种推流格式会返回失败, 所以可能要跟上面逻辑一样为好.
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
    const options = [ '--check-certificate=false', `--dir=${wxDownloadDir}`, '--enable-rpc', '--rpc-listen-all=true', '--rpc-allow-origin-all', `--max-concurrent-downloads=${kAria2MaxDownloadOption}`]
    const { stdout } = await execa(exec, options)
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

  // FIXME: 这里如果传递的 url 是重复的话, 文件名就会错误
  // 已知 aria2 下载重复路径的文件名格式为: xx.1.$ext
  async mustQueryTaskFilename(par) {
    const gid = par[0].gid
    const result = this.queryTaskFilename(gid)
    return result
  }

  async queryTaskFilename(id, returnObj) {
    const status = await this.#ctx.call("tellStatus", id)
    if (returnObj) return status
    // FIXME: must!!
    const path = status.files[0].path
    const result = getFilename(path)
    return result
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
    if (!id) return /* 如果没有 id 就不执行后续的流程 */
    this.#urlCache.add(id)
    const aria2Record = new Aria2Record(url)
    const filename = aria2Record.fileName
    this.tasks.set(filename, aria2Record)
    this.#ctx.call('addUri', [url], {
      "out": filename,
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

function preRemoveOldRecord(dir, day = 3) {
  const currentTime = Date.now();
  const files = fs.readdirSync(dir)
  if (!files.length) {
    console.log("无需检测, 下载目录为空")
    return
  } else {
    console.log(`开始检测${files.length}个历史缓存文件`)
  }
  const patchTime = day * 24 * 60 * 60 * 1000
  files.forEach(file=> {
    const realFile = path.join(dir, file)
    try {
      const stat = fs.statSync(realFile)
      const timeDiff = currentTime - stat.mtime.getTime()
      if (timeDiff > patchTime) {
        console.log("文件已超过{}天, 执行删除任务({})".format(day, realFile))
        fs.unlinkSync(realFile)
      }
    } catch (error) {
      console.log(`检测${stat}文件失败`)
    }
  })
}

;(async ()=> {
  mkdirpSync(wxDownloadDir)
  console.log("启动前开始执行定期删除任务")
  preRemoveOldRecord(wxDownloadDir)
  await evil.init()
  app.listen(3000, serverCallback)
})()