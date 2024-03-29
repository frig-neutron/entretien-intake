# DEPRECATED

⚠️ This repository is deprecated. Functionality moved to https://github.com/frig-neutron/entretien-announce/tree/master/intake_form

# Maintenance intake scripts

Scripts that handle conversion of maintenance intake form responses into Jira tickets.

## Setup
 - Install `yarn`
 - `make init`

## "Staging" environment

We only have one Jira instance, so there's no real staging environment. What passes for staging 
around here is an alternate "test mode" entry point on the script which causes it to
- prepend `TEST - ` to the Jira ticket and 
- redirect all email to my email address.

Jira tickets will still appear in the public Jira repository, albeit with a `TEST - ` prefix. 
These have to be manually cleaned up.

It would be nice if the staging mode deployment would actually deploy an alternate role 
directory, but perhaps that is too much to ask.

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
