// electron-vite spawns the local Electron binary using this process's env.
// Editors built on Electron (VS Code and forks) set ELECTRON_RUN_AS_NODE in
// their integrated terminal, which leaks in and makes the spawned Electron
// binary boot as plain Node instead of the full app, so we clear it here
// before requiring electron-vite's CLI.
const path = require('node:path')

delete process.env.ELECTRON_RUN_AS_NODE

process.argv.splice(2, 0, 'dev')
require(path.join(__dirname, '../node_modules/electron-vite/bin/electron-vite.js'))
