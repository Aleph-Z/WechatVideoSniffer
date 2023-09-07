import fetch from 'node-fetch'
import filenamify from 'filenamify'

export async function fetchLiveRoomData(rid) {
  const resp = await fetch(`https://api.koushare.com/api/api-live/getLiveByRoomid?roomid=${rid}&allData=1`, {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      // "cookie": "Hm_lvt_4bdc3f2e5c838455c9b8828a5b2913b7=1694091117; indexstc=hello; Hm_lpvt_4bdc3f2e5c838455c9b8828a5b2913b7=1694091307",
      "Referer": "https://www.koushare.com/",
      "Referrer-Policy": "origin"
    },
    "method": "GET"
  })
  /**
   * @type {{
   *  flvurl: string
   *  ltitle: string
   *  islive: boolean
   * }}
   */
  const data = (await resp.json()).data
  const realURL = data.flvurl
  const safeTitle = toSafeStr(data.ltitle)
  const isLive = data.islive == 1
  return {
    realURL,
    safeTitle,
    isLive,
  }
}

function toSafeStr(raw) {
  return filenamify(raw)
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export default class KShareRecord {

  /**
   * @type {string[]}
   */
  #roomids = []
  #loopTime

  /**
   * @type {Function[]}
   */
  #subs = []

  rePure = false

  constructor(loopTime /* 传递秒 */) {
    this.#loopTime = loopTime
  }

  stopSignal() {
    this.rePure = true
  }

  get #waitLoopTime() {
    return this.#loopTime * 1e3
  }

  addRoom(id) {
    this.#roomids.push(id)
  }

  addListener(sub) {
    this.#subs.push(sub)
  }

  async loopDetect() {
    while (true) {
      if (this.rePure) break
      await delay(this.#waitLoopTime)
      await this.detect()
    }
  }

  async detect() {
    const ids = this.#roomids
    if (!ids.length) return
    for (const item of ids) {
      try {
        const data = await fetchLiveRoomData(item)
        const { realURL: flv, safeTitle: title, isLive } = data
        if (isLive) {
          this.#subs.forEach(fn=> {
            fn({ flv, title })
          })
        } else {
          // NOOP :)  
        }
      } catch (error) {
        console.log(error)
        // NOOP :)  
      }
    }
  }

}