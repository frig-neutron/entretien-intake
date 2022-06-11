pkg mgr: Yarn

## Setup
 - login w/ clasp: `npx clasp login` after you `npm install` 
   everything

## Addresses of sheets
### Production
 - https://docs.google.com/spreadsheets/d/1bgp0tQi2P6-DLLpFbiABCHKHqIuhnrjk0hxB_sw89iQ/
 - `{"scriptId":"1gZTpx-4gctx_bZov63w9VdWQA4BrnjYDqubuFKuxjdLguK5AJ4K6R5IO"}`
### Staging 
 - https://docs.google.com/spreadsheets/d/16IHfZfz8KI7YCd0hANXyJFWZGvSKTVdAwf1zV_4_rhQ/
 - `{"scriptId":"1zASoko5C5ko9vs4YzgHvPoGA7_iaFLZ1skNfPr6bURoC2V_fhQ907iNd"}`

## Troubleshooting 
 - ticket responses are processed on the log sheet 
 - after successful filing a log entry is put in place
 - to reprocess stuff, delete the log entry and rerun the script
 - Ubuntu `yarn` package is not what you want. You want `yarnpkg`
