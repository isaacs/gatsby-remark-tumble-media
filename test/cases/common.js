const tumble = require('../..')
const plugin = require('../../gatsby-node.js')
const fs = require('fs')
const path = require('path')
const css = path.resolve(`${__dirname}/../../photoset.css`)

const test = exports.test = async (node, ast, width) =>
  await tumble({
    getNode,
    markdownNode: node,
    markdownAST: ast,
  }, { maxWidth: width }).then(() => {
    plugin.onPostBootstrap({}, { maxWidth: width })
    ast.t.matchSnapshot(fs.readFileSync(css, 'utf8'), 'photoset css')
  })

// just mock this to return markdownNode.parent
const getNode = n => n

// test the thing that gets added at the end
const ast = exports.ast = (t, msg) => ({ children: { unshift (n) {
  t.matchSnapshot(n.value, msg)
}}, t })

const astNoChange = exports.astNoChange = t => ({
  children: { unshift (n) {
    t.notOk(n)
    t.fail('should not add any nodes')
  }},
  t
})

const node = exports.node = (frontmatter, dir) => ({
  frontmatter, parent: { dir }
})

if (require.main === module)
  require('tap').pass('this is fine')
