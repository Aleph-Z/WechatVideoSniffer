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

const app = new Koa()
const router = new Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isWin = os.platform == 'win32'

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
    if (isNext) {
      console.log('aria2-server 启动成功')
      this.start()
      setTimeout(()=> {
        this.#ctx = new aria2()
      }, 1200)
    } else {
      console.log('aria2-server 启动失败')
    }
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
    this.#ctx.call('addUri', [url], {})
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
router.get('/ping', _=> {
  const msg = 'pong! current time is: {}'.format((new Date).toString())
  _.body = msg
})

app.use(router.routes())

function serverCallback() {
  const msg = Cowsay.say({
    text : "current server running is {}".format('http://localhost:3000'),
    e : "oO",
    T : "U ",
  })
  console.log(msg)
}

const evil = new Aria2Evil()
;(async ()=> {
  await evil.init()
  app.listen(3000, serverCallback)
})()