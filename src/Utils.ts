import { Page } from 'puppeteer'
import { defer, from } from 'rxjs'
import { flatMap } from 'rxjs/operators'

export function clone(object: any, overwtite: any = {}) {
  return Object.assign(Object.assign({}, object), overwtite)
}

export function deferFrom<T>(f: () => Promise<T[]>) {
  return defer(f).pipe(flatMap((x) => from(x)))
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
