const t = require('tap')
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

if (module === require.main) {
  t.test('no parent, do nothing', t => test({
    frontmatter: {},
    parent: null
  }, astNoChange(t)))

  t.test('no parent dir, do nothing', t =>
    test(node({}, null), astNoChange(t)))

  t.test('not audio or video or anything', t =>
    test(node({}, '234'), astNoChange(t)))
}
