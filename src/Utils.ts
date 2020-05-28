import { Page, Request } from 'puppeteer'


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

export function getRequestLog(page: Page) {
  // @ts-ignore
  const p = page as { requestLog: { request: Request; completedAt: number; }[] }
  if (p.requestLog === undefined) {
    p.requestLog = []
  }
  return p.requestLog
}

export function startRequestLogging(page: Page) {
  const requestLog = getRequestLog(page)
  page.on('request', r => requestLog.push({ request: r as Request, completedAt: null }))
  page.on('requestfinished', r => requestLog.find(e => e.request === r).completedAt = Date.now())
  page.on('requestfailed', r => requestLog.find(e => e.request === r).completedAt = Date.now())
}

export async function waitForNetworkIdle(page: Page) {
  const timeout = Date.now() + 30000
  while (true) {
    await page.waitFor(100)
    const now = Date.now()
    const requestLog = getRequestLog(page)
    const isIdle = requestLog.every(e => e.completedAt != null)
    if (isIdle && now - Math.max(...requestLog.map(e => e.completedAt)) > 1000) {
      return
    } else if (now > timeout) {
      throw "Waiting for network idle timeout"
    }
  }
}
