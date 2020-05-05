#!/usr/bin/env node

import prompt = require('async-prompt')
import program = require('commander')

import { of, from, Observable } from 'rxjs'
import { toArray, mergeMap, flatMap, tap, shareReplay, filter, distinct } from 'rxjs/operators'
import { retryBackoff } from "backoff-rxjs"

import { Configuration, Downloader } from "./Core"
import { clone } from "./Utils"
import { EdxDownloader } from "./EdxDownloader"
import { CourseraDownloader } from "./CourseraDownloader"


const downloaders = [
  {
    platform: "Edx",
    courseUrlPattern: EdxDownloader.courseUrlPattern,
    concurrency: 4,
    factory: (c: Configuration) => new EdxDownloader(c) as Downloader
  },
  {
    platform: "Coursera",
    courseUrlPattern: CourseraDownloader.courseUrlPattern,
    concurrency: 1,
    factory: (c: Configuration) => new CourseraDownloader(c) as Downloader
  }
]

function getDownloader(courseUrl: string) {
  const found = downloaders.find(d => courseUrl.match(d.courseUrlPattern))
  if (!found) {
    throw `Unable to find downloader for this course url: ${courseUrl}`
  } else {
    return found
  }
}

async function getConfiguration(): Promise<Configuration> {
  function parseInteger(v: string) { return parseInt(v) }

  function parseFormat(value: string, _: string) {
    if (!["pdf", "png"].includes(value)) {
      console.log(`invalid format: ${value}`)
      process.exit(1)
    }
    return value
  }

  program
    .name("edx-archive")
    .arguments('<course_url>')
    .option('-u, --user <email>', 'edx login (email)')
    .option('-p, --password <password>', 'edx password')
    .option('-o, --output <directory>', 'output directory', 'Archive')
    .option('-f, --format <format>', 'save pages as pdf or png', parseFormat, 'pdf')
    .option('-r, --retries <retries>', 'number of retry attempts in case of failure', parseInteger, 3)
    .option('-d, --delay <seconds>', 'delay before saving page', parseInteger, 1)
    .option('-c, --concurrency <number>', 'number of pages to save in parallel', parseInteger, null)
    .option('--no-headless', 'disable headless mode')
    .option('--debug', 'output extra debugging', false)
    .parse(process.argv)

  if (program.args.length !== 1) {
    program.help()
  }

  const configuration = clone(program.opts())

  configuration.courseUrl = program.args[0]

  if (configuration.concurrency === null) {
    configuration.concurrency = getDownloader(configuration.courseUrl).concurrency
  }

  if (!configuration.user) {
    configuration.user = await prompt('User: ')
  }

  if (!configuration.password) {
    configuration.password = await prompt.password('Password: ')
  }

  return configuration
}

async function main() {
  const kickstart = of(null as void)
  var downloader: Downloader

  try {
    // build configuration
    const configuration = await getConfiguration()
    if (configuration.debug) {
      console.log("Configuration:")
      console.log(clone(configuration, { user: "<censored>", password: "<censored>" }))
    }
    const backoffConfig = {
      initialInterval: 5000,
      maxInterval: 60000,
      maxRetries: configuration.retries,
    }

    // init helper for logging\debug info
    function trace<T>(
      logFunction: (v: T) => void,
      extraLogFunction: (v: T) => void = v => console.log(v)
    ) {
      return (source: Observable<T>) => source.pipe(
        tap(v => { logFunction(v); if (configuration.debug) extraLogFunction(v) })
      )
    }

    // prepare downloader
    downloader = getDownloader(configuration.courseUrl).factory(configuration)
    await downloader.init()

    // // login
    await kickstart.pipe(
      tap(() => console.log("Logging in...")),
      shareReplay(),
      flatMap(downloader.login),
      tap(() => console.log("Logged in.")),
      retryBackoff(backoffConfig),
    ).toPromise()

    // getting download tasks
    const tasks = await kickstart.pipe(
      tap(() => console.log("Getting download tasks...")),
      shareReplay(),
      flatMap(downloader.getDownloadTasks),
      trace(() => {}, task => { console.log("Created download task:"); console.log(task) }),
      // TODO filter and distinct here
      toArray(),
      trace(tasks => console.log(`Scheduled ${tasks.length} download tasks.`)),
      retryBackoff(backoffConfig),
    ).toPromise()

    // perform downloads
    const results = await kickstart.pipe(
      tap(() => console.log("Downloading...")),
      flatMap(() => from(tasks)),
      shareReplay(),
      mergeMap(
        task => of(task).pipe(
          trace(task => console.log(`Downloading task: ${task.name}`)),
          shareReplay(),
          flatMap(downloader.performDownload),
          trace(result => console.log(`Download complete: ${result.task.name}`)),
          retryBackoff(backoffConfig),
        ),
        configuration.concurrency
      ),
      toArray(),
    ).toPromise()

    // output report
    downloader.reportResults(results)

    // shutdown
    await downloader.shutdown()
    console.log("Done.")
    process.exit(0)
  } catch (e) {
    console.error(e)
    downloader?.shutdown()
    process.exit(1)
  }
}

main()
