const sharp = require('sharp')
const path = require('path')
const cheerio = require('cheerio')
const fs = require('fs')
const mkdirp = require('mkdirp')
const url = require('url')
const https = require('https')

const oembedAPI = {
  youtube: 'https://www.youtube.com/oembed?url=',
  vimeo: 'https://vimeo.com/api/oembed.json?url=',
}

module.exports = async ({ getNode, markdownNode, markdownAST }, pluginOptions) => {
  const width = pluginOptions.maxWidth || 700

  const parentNode = getNode(markdownNode.parent)
  // this won't work unless it's a markdown file
  if (!parentNode || !parentNode.dir) {
    return
  }
  const dir = parentNode.dir

  const front = markdownNode.frontmatter
  const arg = { markdownNode, markdownAST, dir, width }
  const type = Array.isArray(front.photos) ? 'photoset'
    : front.video ? 'video'
    : front.audio ? 'audio'
    : front.youtube ? 'video youtube'
    : front.vimeo ? 'video vimeo'
    : null

  const html = type === 'photoset' ? await photos(arg, front.photos)
    : type === 'video' ? media(arg, front.video)
    : type === 'audio' ? media(arg, front.audio)
    : type === 'video youtube'
      ? await oembed(arg, 'youtube', front.youtube)
    : type === 'video vimeo'
      ? await oembed(arg, 'vimeo', front.vimeo)
    : null

  if (html) {
    markdownAST.children.unshift({
      type: `html`,
      value: `<div class="media ${type}">${html}</div>`
    })
  }
}

const oembed = (arg, api, video) => new Promise((resolve) => {
  const oembedRoot = oembedAPI[api]
  const oe = oembedRoot + encodeURIComponent(video)
  https.get(oe, res => {
    if (res.statusCode !== 200)
      return resolve(null)

    const d = []
    res.setEncoding('utf8')
    res.on('data', c => d.push(c))
    res.on('end', () => {
      try {
        const e = JSON.parse(d.join(''))
        resolve(media(arg, e.html))
      } catch (er) {
        resolve(null)
      }
    })
  })
})

// write out each photoset <style> css into styles/{selector hash}.css,
// but only if that file doesn't already exist, to prevent repetition
const crypto = require('crypto')
const hash = x => crypto.createHash('sha256').update(x).digest('hex')
const writeCss = styles => {
  mkdirp.sync('./styles')
  Object.keys(styles).forEach(sel => {
    const f = `${__dirname}/styles/${hash(sel)}.css`
    if (!fs.existsSync(f))
      fs.writeFileSync(f, `${sel}{${styles[sel]}}`)
  })
}

const photos = async ({ markdownNode, markdownAST, dir, width }) => {
  // 1. figure out height and width of each photo in the set
  // 2. figure out the appropriate width of each item in the row
  // 3. figure out the appropriate height of the row
  //
  // Use tables because they are still the best layout approach by any
  // reasaonable metric and all the FUD about them is laughable bullshit.
  // Prepend the markup into the body, and let remark-images do the rest.
  //
  // Set the height and width of overflow-auto photo containers
  // Width is total content width / row item count
  // then scale each row item's effective height down equivalently
  // Height of row is shortest resulting image height
  // Then the images are set to width:100%,
  // and height truncated via css overflow:hidden
  //
  // total content width is 700px by default, or maxWidth option.

  // turn list of 'url alt' into {url,alt}
  const set = []
  const photos = markdownNode.frontmatter.photos
  for (let i = 0; i < photos.length; i++) {
    const row = photos[i]
    set[i] = []
    for (let j = 0; j < row.length; j++) {
      const p = row[j]
      const meta = await sharp(path.resolve(dir, p.split(' ')[0])).metadata()
      set[i].push({
        file: path.resolve(dir, p.split(' ')[0]),
        url: p.split(' ')[0],
        alt: p.split(' ').slice(1).join(' ').replace(/"/g, "&quo;"),
        meta: meta
      })
    }
  }

  return (set.length === 1 && set[0].length === 1)
    ? singlePhoto(set)
    : photoSet(set, width)
}

const singlePhoto = set => {
  // just one photo, simple img tag will suffice
  const photo = set[0][0]
  const meta = photo.meta
  const imgTag = `
  <img src="${photo.url}"
    alt="${photo.alt}"
    height="${meta.height}"
    width="${meta.width}"
    style="max-width:100%;width:100%;">
  `
  return imgTag
}

const photoSet = (set, width)  => {
  const styles = {}
  const tableClass = `class="photosettable"`
  const tableProps = `${tableClass} cellpadding=0 cellspacing=0`
  const table = `<table ${tableProps}>`
  const rowcell = `<td class="rowcell">`
  const colcell = `<td class="colcell">`
  const rows = set.map(row => {
    const rowLen = row.length

    // spacing is 10px
    // total width is 700px
    // n: imgwidth
    // 1: 700 - 10 - 10 = 680
    // 2: (700 - 10 - 10 - 10)/2 = 335
    // 3: (700 - 10 - 10 - 10 - 10)/3 = 220
    // n: (700 - 10 - 10n)/n
    const imgWidth = (width - 10 - 10 * rowLen) / rowLen
    // get the scaled height of each photo
    row.forEach(photo => {
      photo.scaleHeight = Math.floor(
        photo.meta.height * imgWidth/photo.meta.width
      )
    })
    const rowHeightNum = row.map(p => p.scaleHeight).sort()[0]
    // scale each to that width, then take the smallest height
    const rowHeight = rowLen === 1 ? 'auto' : (rowHeightNum + 'px')
    const widthCls = ('w-' + imgWidth).replace('.','-')
    const heightCls = ('h-' + rowHeight).replace('.', '-')

    const div = `<div class="photo ${widthCls} ${heightCls}">`
    styles[`.photosettable .${widthCls}`] = `width:${imgWidth}px`
    styles[`.photosettable .${heightCls}`] = `height:${rowHeight}`

    // If an image's scaled height H is larger than the rowHeight R,
    // then make it pos:rel, top:R/2, margin-top:-(H/2)
    // Do so with another wrapping div, so that it doesn't mess with the
    // gatsby-remark-image stuff which does funky positioning on the
    // image itself.
    const img = p => {
      const ret = `<img width=${imgWidth}
        class="w-${imgWidth}"
        src="${p.url}" alt="${p.alt}">`

      if (p.scaleHeight <= rowHeightNum)
        return ret

      const cls = `c-${rowHeightNum}-${p.scaleHeight}`
      styles[`.photosettable .${cls}`] = [
        `position:relative`,
        `height:${rowHeight}`,
        `top:${Math.floor(rowHeightNum/2)}px`,
        `margin-top:${-1*Math.floor(p.scaleHeight / 2)}px`,
      ].join(';')
      return `<div class="ctr ${cls}">${ret}</div>`
    }

    return `<tr>${rowcell}${table}<tr>${
      row.map(p => `${colcell}${div}${img(p)}</div></td>`).join('\n')
    }</tr></table></td></tr>`
  }).join('\n')

  writeCss(styles)
  return `${table}${rows}</table>`
}

const media = ({ markdownNode, markdownAST, width }, embedHTML) => {
  const $ = cheerio.load(embedHTML)
  // try to set the width of the iframe/obj/embed the max width, and
  // scale up the height to match, if that's also set.
  mediaWidth($('object'), width)
  mediaWidth($('iframe'), width)
  mediaWidth($('embed'), width)
  mediaWidth($('video'), width)
  audioWidth($('audio'), width)
  return $('body').html()
}

const audioWidth = (node, width) => {
  if (node && node.length) {
    node.css('width', `${width}px`)
    node.css('max-width', `100%`)
  }
}

const mediaWidth = (node, width) => {
  if (!node || !node.length)
    return

  const startWidth = node.attr('width')
  const startHeight = node.attr('height')

  const aspect = Math.floor(startHeight / startWidth * 10000) / 100
  if (isNaN(aspect)) {
    // don't know both height and width, so just set the width
    // to 100% and hope for the best!  Note that this is rare in
    // most embeds, since they generally set the height and width
    // to get the right aspect ratio.
    node.attr('width', width)
    node.css('width', `${width}px`)
    node.css('max-width', `100%`)
    return
  }

  // Wrap in a pos:rel div that is:
  // width:100%
  // overflow:hidden
  // padding-top:(h/w * 100)px
  // Then the object or iframe is pos:abs,
  // top:0, left:0, width:100%, height:100%
  node.css('position', 'absolute')
  node.css('width', '100%')
  node.css('height', '100%')
  node.css('top', '0')
  node.css('left', '0')
  node.css('box-sizing', 'border-box')
  node.css('margin', '0')
  node.wrap('<div>', '</div>')
  const parent = node.parent()
  parent.css('width', '100%')
  parent.css('position', 'relative')
  parent.css('overflow', 'hidden')
  parent.css('padding', '0')
  parent.css('padding-top', `${aspect}%`)
}
