import path = require('path')
import sanitize = require("sanitize-filename")
import { defer } from 'rxjs'

import { Downloader, DownloadTask, DownloadResult, deferFrom } from "./Core"

interface EdxDownloadTask extends DownloadTask {
  url: string,
  index: number,
}

interface EdxDownloadResult extends DownloadResult {
  baseName: string
}

export class EdxDownloader extends Downloader {

  login = () => defer(async () => {
    const page = await this.openPage('https://courses.edx.org/login')

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
      throw `Login failed. Login response status code: ${response.status()}`;
    }
  })

  getDownloadTasks = () => deferFrom(async () => {
    const page = await this.openPage(this.configuration.courseUrl)

    const subsectionUrls = await page.evaluate(() => {
      return $("a.outline-button").map(function(_, e: HTMLAnchorElement) {
        return e.href
      }).toArray()
    })

    const tasks: DownloadTask[] = []
    for (const subsectionUrl of subsectionUrls) {
      await page.goto(subsectionUrl)
      for (const url of await page.evaluate(getSubsectionPages)) {
        tasks.push({
          id: url,
          name: url,
          url: url,
          index: tasks.length,
        } as EdxDownloadTask)
      }
    }

    await page.close()

    return tasks
  })

  performDownload = (task: EdxDownloadTask) => defer(async () => {
    const page = await this.openPage(task.url)

    const baseName = `${task.index + 1} - ${buildTitle(await page.evaluate(getBreadcrumbs))}`

    await page.evaluate(prettifyPage)

    await page.evaluate(waitForMathJax)

    await page.waitFor(this.configuration.delay * 1000)

    await this.savePage(baseName, page)

    await page.close()

    return {
      task: task,
      baseName: baseName,
    } as EdxDownloadResult
  })

  reportResults(results: DownloadResult[]) {
    console.log(`\nSaved ${results.length} pages to: ${path.resolve(this.configuration.output)}`)
  }

}

function buildTitle(breadcumbs: string) {
  return breadcumbs.split(/\n/).map((part) => {
    return sanitize(part.trim())
      .replace(/\s+/g, " ")
      .replace(/^(Course)$/, "")
  }).filter((Boolean)).join(" - ")
}

function getSubsectionPages() {
  return $("button.tab.nav-item").map(function(_, e) {
    return window.location.protocol + "//" + window.location.host + "/" + window.location.pathname + $(e).data("element")
  }).toArray()
}

function getBreadcrumbs() {
  return $(".breadcrumbs").first().text()
}

function waitForMathJax() {
  return new Promise(function(resolve, reject) {
    try {
      // TODO this might be unreliable. Try to find a better way to detect
      // whether math has been processed
      MathJax.Hub.Queue(() => { resolve() })
    } catch (e) {
      reject(e)
    }
  })
}

function prettifyPage() {
  $(".show").trigger("click")
  $(".hideshowbottom").trigger("click")
  $(".discussion-show.shown").trigger("click")
  $(".discussion-module").hide()
  $("header").hide()
  $("#footer-edx-v3").hide()
  $(".course-tabs").hide()
  $(".course-expiration-message").hide()
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
