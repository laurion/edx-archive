import { Observable, defer, from } from 'rxjs'
import { flatMap } from 'rxjs/operators'
import puppeteer = require('puppeteer')
import path = require('path')
import fs = require('fs')

export type Configuration = any
export type DownloadTask = { id: string; name: string; }
export type DownloadResult = { task: DownloadTask }

export abstract class Downloader {

  protected configuration: Configuration
  protected browser: puppeteer.Browser

  constructor(configuration: Configuration, browser: puppeteer.Browser) {
    this.configuration = configuration
    this.browser = browser
  }

  abstract login(): Observable<void>

  abstract getDownloadTasks(): Observable<DownloadTask>

  abstract performDownload(task: DownloadTask): Observable<DownloadResult>

  abstract reportResults(results: DownloadResult[]): void

  protected async openPage(url: string) {
    const page = await this.browser.newPage()
    await page.goto(url)
    return page
  }

  protected async savePage(baseName: string, page: puppeteer.Page) {
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

}

export function deferFrom<T>(f: () => Promise<T[]>) {
  return defer(f).pipe(flatMap((x) => from(x)))
}
