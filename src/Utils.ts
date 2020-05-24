import { Page } from 'puppeteer'


export function clone(object: any, overwtite: any = {}) {
  return Object.assign(Object.assign({}, object), overwtite)
}

export function getInnerText(selector: string, page: Page): Promise<string[]> {
  // @ts-ignore
  return page.$$eval(selector, es => es.map(e => e.innerText))
}

export async function waitForMathJax(page: Page) {
  await page.waitFor(() => typeof MathJax !== "undefined")
  await page.evaluate(() => new Promise(function(resolve, reject) {
    try {
      // TODO this might be unreliable. Try to find a better way to detect
      // whether math has been processed
      MathJax.Hub.Queue(() => { resolve() })
    } catch (e) {
      reject(e)
    }
  }))
}

export function trackNetworkIdling(page: Page) {
  page.on('request', onRequestStarted)
  page.on('requestfinished', onRequestFinished)
  page.on('requestfailed', onRequestFinished)

  // @ts-ignore
  page.idleSince = null
  let active = 0

  function onRequestStarted() {
    ++active
  }

  function onRequestFinished() {
    --active;
    // @ts-ignore
    page.idleSince = (active === 0) ? Date.now() : null
  }
}

export async function waitForNetworkIdle(page: Page) {
  const startTime = Date.now()
  while (true) {
    const now = Date.now()
    // @ts-ignore
    if (page.idleSince !== null && now - page.idleSince > 1000) {
      return
    } else if (now - startTime > 30000) {
      throw "Waiting for network idle timeout"
    } else {
      await page.waitFor(100)
    }
  }
}
