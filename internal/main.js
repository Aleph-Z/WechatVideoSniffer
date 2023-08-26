const Koa = require('koa')
const Router = require('@koa/router')
const Cowsay = require('cowsay')
const execa = require('execa')
const os = require('os')
const path = require('path')
const fs = require('fs')
const cport = require('detect-port')
const aria2 = require('aria2')
const app = new Koa()

const router = new Router()

const isWin = os.platform == 'win32'

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
      await this.start()
      this.#ctx = new aria2()
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
    console.log('current exec path is', this.execPath)
    const { stdout } = await execa(execName, ['--enable-rpc', '--rpc-listen-all=true', '--rpc-allow-origin-all'])
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
    // 1. 检测 aria2 二进制是否存在
    if (!fs.existsSync(this.execPath)) {
      return false 
    }
    // 2. 检测端口是否被占用
    const isOpen = await cport(this.#port)
    return !isOpen
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