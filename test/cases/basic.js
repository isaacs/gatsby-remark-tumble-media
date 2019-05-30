const t = require('tap')
const { test, node, astNoChange } = require('./common.js')

t.test('no parent, do nothing', t => test({
  frontmatter: {},
  parent: null
}, astNoChange(t)))

t.test('no parent dir, do nothing', t =>
  test(node({}, null), astNoChange(t)))

t.test('not audio or video or anything', t =>
  test(node({}, '234'), astNoChange(t)))
