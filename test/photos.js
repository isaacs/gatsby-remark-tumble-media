const t = require('tap')
const tumble = require('../')
const { test, ast, astNoChange, node } = require('./common.js')

const path = require('path')
const catdir = path.resolve(__dirname, 'cats')
const fs = require('fs')

t.test('solo image, scale up', async t => test(
  node({ photos: [['moving-cat.gif']] }, catdir),
  ast(t, `solo cat`),
  500))

t.test('solo image, scale down', async t => test(
  node({ photos: [['three-kitties.jpg three of them!']] }, catdir),
  ast(t, `solo cat`),
  200))

t.test('repetitive styles', async t => test(
  node({ photos:
   [ [ 'four-in-a-row.jpg', 'cat.jpg' ],
     [ 'four-in-a-row.jpg', 'cat.jpg' ] ] }, catdir),
  ast(t, `repetive cats`),
  700))

t.test('several rows', async t => test(
  node({ photos:
   [ [ 'four-in-a-row.jpg', 'cat.jpg' ],
     [ 'cat-on-its-own-row.jpg' ],
     [ 'one-kitten.jpg',
       'two-kittens.jpg',
       'three-kitties.jpg',
       'cat.png' ],
     [ 'moving-cat.gif ""jif"" for giraffics interface format' ] ] }, catdir),
  ast(t, `many cats`),
  700))

t.test('broken image', async t => {
  const consoleError = console.error
  const logs = []
  console.error = msg =>
    logs.push(String(msg).replace(catdir, '${CATDIR}').replace(/[\\\/]/g, '/'))
  t.teardown(() => console.error = consoleError)
  return test(node({ photos:
    [ [ 'frou-in-a-row.jpg this one is not here', 'cat.jpg but this one is' ],
      [ 'cat-on-its-own-row.jpg' ],
      [ 'one-kitten.jpg',
        'two-kittens.jpg',
        'three-kitties.jpg',
        'cat.png' ],
      [ 'moving-cat.gif' ] ] }, catdir),
    ast(t, `many cats, one missing`),
    700).then(() => t.matchSnapshot(logs, 'got expected logs'))
})
