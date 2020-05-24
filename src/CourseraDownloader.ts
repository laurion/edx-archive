import path = require('path')

import { launch, Browser } from 'puppeteer'
import { defer, from } from 'rxjs'
import { flatMap } from 'rxjs/operators'

import { Downloader, DownloadTask, DownloadResult } from "./Core"
import { getInnerText } from "./Utils"


interface CourseraDownloadTask extends DownloadTask {
  url: string
}

interface CourseraDownloadResult extends DownloadResult {
  baseName: string
}

export class CourseraDownloader extends Downloader {

  static courseUrlPattern = /^https:\/\/www.coursera.org\/learn\/.*\/home\/welcome$/
  static examUrlPattern = /^https:\/\/www.coursera.org\/learn\/.*\/exam\/.*\/.*$/
  static quizUrlPattern = /^https:\/\/www.coursera.org\/learn\/.*\/quiz\/.*\/.*$/

  login = () => defer(async () => {
    var browser: Browser
    try {
      // prompt user for auth\captcha using non-headless browser window
      console.log("Attempting to login on Coursera.")
      console.log("You might be prompted for captcha.")
      browser = await launch({
        headless: false,
        args: [
          '--app=https://www.coursera.org/?authMode=login',
          '--window-size=815,640' // looks best on current coursera ui
        ]
      })
      const [page] = await browser.pages()
      await page.waitFor('input[type=email]')

      await page.type('input[type=email]', this.configuration.user)
      await page.type('input[type=password]', this.configuration.password)

      await page.waitFor('#g-recaptcha-response')
      const loginEndpoint = "https://www.coursera.org/api/login/v3"
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url() === loginEndpoint, { timeout: 600000 }),
        page.click('button[data-js="submit"]')
      ])

      if (response.status() !== 200) {
        throw `Login failed. Login response status code: ${response.status()}`
      }

      this.cookies.push((await page.cookies()).filter(c => c.name === "CAUTH")[0])
    } finally {
      browser?.close()
    }
  })

  getDownloadTasks = () => this.withPage(this.configuration.courseUrl, async page => {
    await page.waitFor("a.rc-WeekNavigationItem")
    await page.waitFor(this.configuration.delay * 1000)

    const tasks: DownloadTask[] = []

    // @ts-ignore
    const weekUrls = await page.$$eval("a.rc-WeekNavigationItem", es => es.map(e => e.href))
    for (const weekUrl of weekUrls) {
      await page.goto(weekUrl)
      await page.waitFor(".rc-ModuleLessons a")
      await page.waitFor(this.configuration.delay * 1000)

      // @ts-ignore
      const lessonUrls = await page.$$eval(".rc-ModuleLessons a", es => es.map(e => e.href))
      for (const lessonUrl of lessonUrls.filter(u => u.match(CourseraDownloader.quizUrlPattern) || u.match(CourseraDownloader.examUrlPattern)) ) {
        await page.goto(lessonUrl)
        await page.waitFor(".rc-CoverPageRowRightSideGrade")
        await page.waitFor(this.configuration.delay * 1000)

        const hasFeedback = (await getInnerText("button span", page)).some(s => s === "View Feedback")
        if (hasFeedback) {
          const feedbackUrl = lessonUrl + "/view-attempt"
          tasks.push({ id: feedbackUrl, name: feedbackUrl, url: feedbackUrl, index: tasks.length } as CourseraDownloadTask)
        }
      }
    }

    return tasks
  }).pipe(
    flatMap(ts => from(ts))
  )

  performDownload = (task: CourseraDownloadTask) => this.withPage(task.url, async page => {
    await page.waitFor(".rc-TunnelVisionWrapper__content-body")
    await this.waitForRender(page)

    const breadcrumbs = (await getInnerText(".breadcrumb-item", page)).slice(1)
    const baseName = `${task.index + 1} - ${this.buildTitle(breadcrumbs)}`

    await page.evaluate(prettifyPage)

    await this.savePage(baseName, page)

    return { task: task, baseName: baseName } as CourseraDownloadResult
  })

  reportResults(results: DownloadResult[]) {
    console.log(`\nSaved ${results.length} pages to: ${path.resolve(this.configuration.output)}`)
  }

}

function prettifyPage() {
  const body = document.querySelector("body")
  const content = document.querySelector(".rc-TunnelVisionWrapper__content-body")
  body.appendChild(content)
  // @ts-ignore
  document.querySelectorAll("body > div:not(.rc-TunnelVisionWrapper__content-body)").forEach(e => e.style.display = "none")
  body.style.overflow = "auto"
}
