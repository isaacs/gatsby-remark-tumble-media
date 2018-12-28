const sharp = require('sharp')
const path = require('path')
const cheerio = require('cheerio')

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
  // total content width is 700px by default, or maxHeight option.

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
  // XXX if you have a lot of these on a page, it'll get repetitive
  // figure out a way to shove it into a single per-page style?
  const styles = {
    '.photosettable':'border-collapse:collapse',
    '.photosettable .rowcell,.photosettable .colcell':'border:solid #fff',
    '.photosettable .rowcell':'border-width:10px 0',
    '.photosettable .colcell':'border-width:0 10px',
  }
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
    styles[`.photosettable .photo`] = `max-width:100%;overflow:hidden`
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

    styles[`.photosettable img`] = `width:100%`

    return `<tr>${rowcell}${table}<tr>${
      row.map(p => `${colcell}${div}${img(p)}</div></td>`).join('\n')
    }</tr></table></td></tr>`
  }).join('\n')
  return `${table}${rows}</table>${toCss(styles, width)}`
}

// "Tables? Oh noh! But what abuot responsiev!???!?"  lol.
// Undo everything and make it a simple single-column of full-width
// images.  Otherwise, it cuts off and obscures the content at small
// sizes.  Preserving the row/col layout at small widths requires
// some zoom hacks that are complicated and tend to not look good
// anyway.
const resets = {
  [([
    '.photosettable',
    '.photosettable tbody',
    '.photosettable tr',
    '.photosettable td',
    '.photosettable .photo',
    '.photosettable .ctr',
    '.photosettable img'
  ]).join(',')]: {
    display:'block',
    width:'100%',
    height:'auto',
    margin:0,
    'box-sizing':'border-box',
    border:0,
    position:'static'
  },
  '.photosettable td.colcell': {
    border:'10px solid #fff',
    'border-bottom':0
  },
  '.photosettable': {
    'border-bottom': '10px solid #fff'
  },
  '.photosettable .photosettable': {
    border: 0
  }
}

const toCss = (styles, width) => `<style>${
  Object.keys(styles).map(sel => `${sel}{${styles[sel]}}`).join('')
}@media (max-width: ${parseInt(width)+50}px) {${
  Object.keys(resets).map(sel =>
    `${sel}{${
      Object.keys(resets[sel]).map(k =>
        `${k}:${resets[sel][k]}!important`).join(';')
    }}`).join('')
}}
</style>`

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
  if (node && node.length) {
    const startWidth = node.attr('width')
    const startHeight = node.attr('height')

    // scale up or down appropriately
    const endHeight = startWidth && startHeight
      ? Math.round(1000 * startHeight * width / startWidth) / 1000
      : null

    node.attr('width', width)
    node.css('width', `${width}px`)
    if (endHeight) {
      node.attr('height', endHeight)
      node.css('height', `${endHeight}px`)
    }
  }
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
    : null

  const html = type === 'photoset' ? await photos(arg, front.photos)
    : type === 'video' ? media(arg, front.video)
    : type === 'audio' ? media(arg, front.audio)
    : null

  if (html) {
    markdownAST.children.unshift({
      type: `html`,
      value: `<div class="media ${type}">${html}</div>`
    })
  }
}
