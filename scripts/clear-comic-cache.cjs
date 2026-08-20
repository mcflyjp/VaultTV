const fs = require('fs')
const path = require('path')
const file = path.join(process.env.APPDATA, 'VaultTV', 'reading-artwork-cache.json')
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const before = Object.keys(data).length
const kept = {}
let removed = 0
for (const [k, v] of Object.entries(data)) {
  if (k.startsWith('comic::')) { removed++; continue }
  kept[k] = v
}
fs.writeFileSync(file, JSON.stringify(kept, null, 2), 'utf8')
console.log('before:', before, 'removed:', removed, 'after:', Object.keys(kept).length)
