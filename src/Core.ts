import path = require('path')
import fs = require('fs')
import sanitize = require('sanitize-filename')

import { Browser, Page, Cookie } from 'puppeteer'
import { Observable } from 'rxjs'


export type Configuration = any
export type DownloadTask = { id: string; name: string; }
export type DownloadResult = { task: DownloadTask }

export abstract class Downloader {

  protected configuration: Configuration
  protected browser: Browser
  protected cookies: Cookie[] = []

  constructor(configuration: Configuration, browser: Browser) {
    this.configuration = configuration
    this.browser = browser
  }

  abstract login(): Observable<void>

  abstract getDownloadTasks(): Observable<DownloadTask>

  abstract performDownload(task: DownloadTask): Observable<DownloadResult>

  abstract reportResults(results: DownloadResult[]): void

  protected async openPage(url: string) {
    const page = await this.browser.newPage()
    await page.setCookie(...this.cookies)
    await page.goto(url)
    return page
  }

  protected async savePage(baseName: string, page: Page) {
    const filename = path.join(this.configuration.output, baseName)

    if (!fs.existsSync(this.configuration.output)) {
        fs.mkdirSync(this.configuration.output)
    }

    if (this.configuration.format === "png") {
      await page.screenshot({ path: filename + '.png', fullPage: true })
    }
    if (this.configuration.format === "pdf") {
      await page.pdf({ path: filename + '.pdf' })
    }
  }

  protected buildTitle(breadcumbs: string[]) {
    return breadcumbs.map(b => sanitize(b)).join(" - ")
  }

}
