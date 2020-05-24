import path = require('path')
import fs = require('fs')
import sanitize = require('sanitize-filename')

import { launch, Browser, Page, Cookie } from 'puppeteer'
import { Observable, defer } from 'rxjs'

import { trackNetworkIdling, waitForNetworkIdle, waitForMathJax } from "./Utils"


export type Configuration = any
export type DownloadTask = { id: string; index: number; name: string; }
export type DownloadResult = { task: DownloadTask }

export abstract class Downloader {

  protected configuration: Configuration
  protected browser: Browser
  protected cookies: Cookie[] = []
  private onUnexpectedBrowserDisconnect: () => Promise<void>

  constructor(configuration: Configuration) {
    this.configuration = configuration
    const self = this
    this.onUnexpectedBrowserDisconnect = async () => {
      console.log("Browser disconnected unexpectedly. Restarting browser.")
      await self.closeBrowser()
      await self.launchBrowser()
    }
  }

  abstract login(): Observable<void>

  abstract getDownloadTasks(): Observable<DownloadTask>

  abstract performDownload(task: DownloadTask): Observable<DownloadResult>

  abstract reportResults(results: DownloadResult[]): void

  async init() {
    await this.launchBrowser()
  }

  async shutdown() {
    await this.closeBrowser()
  }

  protected async launchBrowser() {
    this.browser = await launch({ headless: this.configuration.headless })
    this.browser.on('disconnected', this.onUnexpectedBrowserDisconnect)
    if (this.configuration.debug) {
      console.log(`Started browser with PID: ${this.browser.process().pid}`)
    }
  }

  protected async closeBrowser() {
    this.browser.off('disconnected', this.onUnexpectedBrowserDisconnect)
    await this.browser.close()
  }

  protected withPage<T>(url: string, f: (p: Page) => Promise<T>) {
    return defer(async () => {
      const page = await this.browser.newPage()
      try {
        trackNetworkIdling(page)
        await page.setCookie(...this.cookies)
        await page.goto(url)
        return await f(page)
      } finally {
        await new Promise(resolve =>page.close().then(resolve).catch(resolve))
      }
    })
  }

  protected async savePage(baseName: string, page: Page) {
    const filename = path.join(this.configuration.output, baseName)

    if (!fs.existsSync(this.configuration.output)) {
      fs.mkdirSync(this.configuration.output)
    }

    await page.emulateMediaType('screen');

    const saveTasks: Promise<any>[] = []
    if (this.configuration.format === "png") {
      saveTasks.push(page.screenshot({ path: filename + '.png', fullPage: true }))
    }
    if (this.configuration.format === "pdf") {
      saveTasks.push(page.pdf({ path: filename + '.pdf', margin: {top:'14mm', bottom:'14mm', left:'14mm', right:'14mm'}}));
    }

    await Promise.race([
      Promise.all(saveTasks),
      new Promise((_, reject) => setTimeout(() => reject("Saving page timeout"), 30000))
    ])
  }

  protected async waitForRender(page: Page) {
    await waitForNetworkIdle(page)
    await waitForMathJax(page)
    await page.waitFor(this.configuration.delay * 1000)
  }

  protected buildTitle(breadcumbs: string[]) {
    return breadcumbs.map(b => sanitize(b)).join(" - ")
  }

}
