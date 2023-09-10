import fs from "fs"
let prevMtime

function convertRoomData(data) {
  const lines = data.trim().split("\n")

  const roomData = lines.map((line) => {
    line = line.replace("\r", "")
    const [id, timeRange] = line.split(",")
    const [startTime, endTime] = timeRange.split("-")
    return { id, startTime, endTime }
  })

  return roomData
}

export function readFileLines(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, "utf8", (err, content) => {
      if (err) {
        console.error("Error reading file:", err)
        reject(err)
      }
      const data = convertRoomData(content)
      resolve(data)
    })
  })
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
