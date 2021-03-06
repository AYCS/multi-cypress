'use strict'

const debug = require('debug')('multi')
const la = require('lazy-ass')
const is = require('check-more-types')

const path = require('path')
const relative = path.join.bind(null, __dirname)
const inCurrent = path.join.bind(null, process.cwd())
const fs = require('fs')

// expect common output folder
function generateGitLabCiFile (outputFolder, specFiles, dockerImage,
  script, beforeScript, afterScript,
  buildScript) {
  debug(`generating gitlab file for folder "${outputFolder}"`)
  la(is.maybe.unemptyString(dockerImage),
    'docker image should be just string', dockerImage)
  if (dockerImage) {
    debug(`based on docker image ${dockerImage}`)
  }
  la(is.maybe.arrayOfStrings(script), 'expected test commands', script)

  const defaultBuildCommands = [
    'echo $CI_BUILD_ID > build.id',
    'npm install --quiet',
    'npm test',
    'npm run build'
  ]
  if (!buildScript) {
    buildScript = defaultBuildCommands
  }

  const defaultTestCommands = [
    `cypress ci --spec "${outputFolder}/$CI_BUILD_NAME.js"`
  ]
  if (!script) {
    script = defaultTestCommands
  }
  debug('test commands')
  debug(script)

  const defaultBeforeScriptCommands = []
  if (!beforeScript) {
    beforeScript = defaultBeforeScriptCommands
  }
  if (is.not.empty(beforeScript)) {
    debug('before script commands')
    debug(beforeScript)
  }

  const defaultAfterScriptCommands = []
  if (!afterScript) {
    afterScript = defaultAfterScriptCommands
  }
  if (is.not.empty(afterScript)) {
    debug('after script commands')
    debug(afterScript)
  }

  la(is.arrayOfStrings(specFiles), 'expected list of specs', specFiles)
  const names = specFiles.map((full) => path.basename(full, '.js'))
  debug('project names', names)

  const templateName = relative('./gitlab-ci-template.yml')
  const start = fs.readFileSync(templateName, 'utf8')
  var gitlabFile = '# this is a generated file\n'
  if (dockerImage) {
    gitlabFile += `image: ${dockerImage}
`
  }
  gitlabFile += start

  gitlabFile +=
    `
# save current build job id to kind of tie together multiple test jobs
# because GitLab CI api does not expose the pipeline ID
# pass the saved id through the file
build-specs:
  stage: build
  script:
`
  buildScript.forEach((buildCommand) => {
    gitlabFile += `    - ${buildCommand}
`
  })

  gitlabFile += `
  artifacts:
    paths:
      - build.id
      - cypress/support
      - cypress/fixtures
      - ${outputFolder}

# Common build job definition using GitLab YAML features
# http://docs.gitlab.com/ce/ci/yaml/README.html#special-yaml-features

# we will generate the test definitions per spec bundle
# using the common definition
`

  gitlabFile +=
    `
# Hidden job that defines an anchor named 'e2e_test_definition'
# This job will be automatically assigned "test" phase
.job_template: &e2e_test_definition
  artifacts:
    when: on_failure
    expire_in: 1 week
    paths:
      - cypress/screenshots/
      - cypress/videos/
  script:
`
  script.forEach((testCommand) => {
    gitlabFile += `    - ${testCommand}
`
  })
  if (is.not.empty(beforeScript)) {
    gitlabFile += '  before_script:\n'
    beforeScript.forEach((testCommand) => {
      gitlabFile += `    - ${testCommand}
`
    })
  }
  if (is.not.empty(afterScript)) {
    gitlabFile += '  after_script:\n'
    afterScript.forEach((testCommand) => {
      gitlabFile += `    - ${testCommand}
`
    })
  }

  names.forEach((name) => {
    gitlabFile += `
${name}:
  <<: *e2e_test_definition
    `
  })
  gitlabFile += '\n'
  const gitlabFilename = inCurrent('.gitlab-ci.yml')
  fs.writeFileSync(gitlabFilename, gitlabFile, 'utf8')
  console.log('saved', gitlabFilename)
}

module.exports = generateGitLabCiFile
