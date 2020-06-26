![npm](https://img.shields.io/npm/v/edx-archive)

`edx-archive` allows you to download edX course pages. It allows you to save:
* lecture excercises\homework\exams (including answers)
* errata
* extra materials that appear on course pages (including collapsable text\tables)

Note: if you also want to download video and resources you can use [edx-dl](https://github.com/coursera-dl/edx-dl).

## Installation

You will need Node.js to install and run `edx-archive`. You can get it from [here](https://nodejs.org/en/download/).

Once you have Node.js on your system:

```
npm install edx-archive -g
```

## Usage example

The following will download edX demo course pages in `png` format:

```
edx-archive -u your@email.com -p edx_password --format png "https://courses.edx.org/courses/edX/DemoX/Demo_Course/course/"
```

## Full list of options

```
Usage: edx-archive [options] <course_url>

Options:
  -u, --user <email>          edx login (email)
  -p, --password <password>   edx password
  -o, --output <directory>    output directory (default: "Archive")
  -f, --format <format>       save pages as pdf or png (default: "pdf")
  -r, --retries <retries>     number of retry attempts in case of failure (default: 3)
  -d, --delay <seconds>       delay before saving page (default: 1)
  -c, --concurrency <number>  number of pages to save in parallel (default: 4)
  --debug                     output extra debugging (default: false)
  -h, --help                  output usage information
```
