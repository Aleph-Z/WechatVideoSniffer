import fs from "fs"
let prevMtime

export function readFileLines(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, "utf8", (err, content) => {
      if (err) {
        console.error("Error reading file:", err)
        reject(err)
      }
      const data = content.split("\n").filter((it) => it)
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
