import fs from "fs"
import iconv from "iconv-lite"
import jschardet from "jschardet"

let prevMtime

function convertRoomData(data) {
  const lines = data.trim().split("\n")

  const roomData = lines.map((line) => {
    line = line.replace("\r", "")
    const [id, timeRange, token] = line.split(",")
    const [startTime, endTime] = timeRange.split("-")
    return { id, startTime, endTime, token }
  })

  return roomData
}

export function readFileLines(path) {
  // 解码
  const buffer = fs.readFileSync(path)
  const encode = jschardet.detect(buffer).encoding
  let fileContent = iconv.decode(buffer, encode) // 转码后的文本内容
  console.info("debug:", { fileContent })
  const data = convertRoomData(fileContent)
  console.info("debug:", { data })
  return data
}
export function watchFile(path, callback) {
  // 监视文件的变化
  fs.watchFile(path, (curr) => {
    if (curr.mtime !== prevMtime) {
      readFileLines(path).then((ids) => {
        prevMtime = curr.mtime
        callback(ids)
      })
    }
  })
}
