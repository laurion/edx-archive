import path = require('path')

import { from } from 'rxjs'
import { flatMap } from 'rxjs/operators'

import { Downloader, DownloadTask, DownloadResult } from "./Core"
import { waitForMathJax, getInnerText } from "./Utils"


interface EdxDownloadTask extends DownloadTask {
  url: string
}

interface EdxDownloadResult extends DownloadResult {
  baseName: string
}

export class EdxDownloader extends Downloader {

  static courseUrlPattern = /^https:\/\/courses.edx.org\/courses\/.*\/course\/$/

  login = () => this.withPage('https://courses.edx.org/login', async page => {
    await page.waitFor('#login-email')
    await page.type('#login-email', this.configuration.user)
    await page.type('#login-password', this.configuration.password)
    const loginEndpoints = [
      "https://courses.edx.org/user_api/v1/account/login_session/",
      "https://courses.edx.org/login_ajax"
    ]
    const [response] = await Promise.all([
      page.waitForResponse(r => loginEndpoints.includes(r.url())),
      page.click('.login-button')
    ])

    if (response.status() !== 200) {
      throw `Login failed. Login response status code: ${response.status()}`
    }

    this.cookies.push(...await page.cookies())
  })

  getDownloadTasks = () => this.withPage(this.configuration.courseUrl, async page => {
    const tasks: DownloadTask[] = []

    // @ts-ignore
    const subsectionUrls = await page.$$eval("a.outline-button", es => es.map(e => e.href))
    for (const subsectionUrl of subsectionUrls) {
      await page.goto(subsectionUrl)

      const subsectionPages = await page.$$eval("button.tab.nav-item", es => es.map(
        e => window.location.protocol + "//" + window.location.host + "/" + window.location.pathname + $(e).data("element")
      ))
      for (const url of subsectionPages) {
        tasks.push({ id: url, name: url, url: url, index: tasks.length } as EdxDownloadTask)
      }
    }

    return tasks
  }).pipe(
    flatMap(ts => from(ts))
  )

  performDownload = (task: EdxDownloadTask) => this.withPage(task.url, async page => {
    await page.waitFor("#seq_content")
    await waitForMathJax(page)
    await page.waitFor(this.configuration.delay * 1000)

    const breadcrumbs = (await getInnerText(".breadcrumbs span", page)).filter(b => b !== "").slice(1)
    const baseName = `${task.index + 1} - ${this.buildTitle(breadcrumbs)}`

    await page.evaluate(prettifyPage)

    await this.savePage(baseName, page)

    return { task: task, baseName: baseName } as EdxDownloadResult
  })

  reportResults(results: DownloadResult[]) {
    console.log(`\nSaved ${results.length} pages to: ${path.resolve(this.configuration.output)}`)
  }

}

function prettifyPage() {
  $(".show").trigger("click")
  $(".hideshowbottom").trigger("click")
  $(".close-modal").trigger("click")
  $(".discussion-show.shown").trigger("click")
  $(".discussion-module").hide()
  $("header").hide()
  $("#footer-edx-v3").hide()
  $(".course-tabs").hide()
  $(".course-expiration-message").hide()
  $(".first-purchase-offer-banner").hide()
  $(".verification-sock").hide()
  $("#frontend-component-cookie-policy-banner").hide()
  $(".sequence-bottom").hide()
  $(".sequence-nav").hide()
  $(".nav-utilities").hide()
  $(".course-license").hide()
  $(".bookmark-button-wrapper").hide()
  $(".subtitles").hide()
  $(".video-wrapper").hide()
}
