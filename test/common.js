const tumble = require('../')

const test = exports.test = async (node, ast, width) =>
  await tumble({
    getNode,
    markdownNode: node,
    markdownAST: ast,
  }, { maxWidth: width })

// just mock this to return markdownNode.parent
const getNode = n => n

// test the thing that gets added at the end
const ast = exports.ast = (t, msg) => ({ children: { unshift (n) {
  t.matchSnapshot(n.value, msg)
}}})

const astNoChange = exports.astNoChange = t => ({
  children: { unshift (n) {
    t.notOk(n)
    t.fail('should not add any nodes')
  }}
})

const node = exports.node = (frontmatter, dir) => ({
  frontmatter, parent: { dir }
})

if (require.main === module)
  require('tap').pass('this is fine')
