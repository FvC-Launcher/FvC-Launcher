// Builds the FvC Skins Fabric mod (mod/) into resources/mods/fvc-skins.jar,
// which the launcher copies into every Fabric 26.2 instance. Needs a JDK 25
// on PATH or in JAVA_HOME.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const modDir = path.join(__dirname, '../mod')
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'

const result = spawnSync(gradlew, ['copyToLauncher', '--console=plain'], {
  cwd: modDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
process.exit(result.status ?? 1)
