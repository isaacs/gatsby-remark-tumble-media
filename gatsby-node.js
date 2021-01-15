const fs = require('fs')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')

exports.onPreBootstrap = () => {
  rimraf.sync(`${__dirname}/styles`)
  mkdirp.sync(`${__dirname}/styles`)
}

exports.onPostBuild = (_, pluginOptions) => {
  // gather up the css into the file that the gatsby-browser.js will load
  const overrides = fs.readFileSync(`${__dirname}/overrides.css`, 'utf8')
    .replace(/\$\{width\}/g, pluginOptions.maxWidth || 700)

  const base = fs.readFileSync(`${__dirname}/base.css`, 'utf8')
  const files = fs.readdirSync(`${__dirname}/styles`)
    .filter(f => /\.css$/.test(f))
    .map(f => fs.readFileSync(`${__dirname}/styles/${f}`, 'utf8'))
    .join('\n').trim()
  const css = files.length ? base + files + overrides : ''
  fs.writeFileSync(`${__dirname}/photoset.css`, css)
}
