import fetch from "node-fetch"
import filenamify from "filenamify"
import dayjs from "dayjs"

// 比较当前时间是否在 startTime 和 endTime 之间
function isCurrentTimeInRange(startTime, endTime) {
  const currentTime = dayjs().format("HH:mm")
  return currentTime >= startTime && currentTime <= endTime
}

export async function fetchLiveRoomData(rid, token) {
  let resp
  try {
    resp = await fetch(
      `https://core.api.koushare.com/live/v1/live/getLive?liveId=${rid}&secret=${token}`,
      {
        headers: {
          client: "front_web",
          accept: "application/json, text/plain, */*",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "accept-language": "zh-CN,zh;q=0.9",
          "sec-ch-ua":
            '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          // "cookie": "Hm_lvt_4bdc3f2e5c838455c9b8828a5b2913b7=1694091117; indexstc=hello; Hm_lpvt_4bdc3f2e5c838455c9b8828a5b2913b7=1694091307",
          "Referrer-Policy": "origin",
        },
        method: "GET",
      },
    )
  } catch (error) {
    return {
      realURL: "",
      safeTitle: "未获取成功",
      isLive: false,
    }
  }
  /**
   * @type {{
   *  flvurl: string
   *  title: string
   *  liveStatus: int
   * }}
   */
  const data = (await resp.json()).data
  const realURL = data.flvurl
  if (!realURL) {
    console.error("获取直播错误", await resp.json())
  }
  const safeTitle = toSafeStr(data.title)
  const isLive = data.liveStatus == 1
  return {
    realURL,
    safeTitle,
    isLive,
  }
}

function toSafeStr(raw) {
  return filenamify(raw)
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default class KShareRecord {
  /**
   * @type {{id:string,startTime:string,endTime:string,token:string}[]}
   */
  #roomids = []
  #ignoreIds = new Set()
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

  setRoomIds(ids) {
    this.#roomids = ids
  }

  clearIgnoreRoom() {
    this.#ignoreIds.clear()
  }

  addIgnoreRoom(id) {
    this.#ignoreIds.add(id)
  }

  addRoom(id) {
    this.#roomids.push(id)
  }

  addListener(sub) {
    this.#subs.push(sub)
  }

  async loopDetect() {
    await delay(1000)
    while (true) {
      if (this.rePure) break
      await this.detect()
      await delay(this.#waitLoopTime)
    }
  }

  async detect() {
    let ids = this.#roomids
    const now = dayjs()
    console.log(now.format("YYYY-MM-DD HH:mm:ss"))
    console.info("未筛选前", ids)
    // 筛选不需要监听的直播房间号
    ids = ids.filter((room) => {
      if (isCurrentTimeInRange(room.startTime, room.endTime)) {
        if (!this.#ignoreIds.has(room.id)) {
          return true
        }
        console.info(`${room.id} 可能被下载,已忽略`)
        console.info(this.#ignoreIds)
        return false
      }
      console.info(`${room.id} 不在时间段`)
      return false
    })
    console.log("筛选后", { ids })
    if (!ids.length) return
    for (const item of ids) {
      try {
        const data = await fetchLiveRoomData(item.id, item.token)
        const { realURL: flv, safeTitle: title, isLive } = data
        console.info("直播信息", { title, isLive })
        if (isLive) {
          this.#subs.forEach((fn) => {
            if (flv && title) fn({ id: item.id, flv, title })
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
