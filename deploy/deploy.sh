#!/bin/bash
#
# Deploy appscript.
# Script must be run from source root (where the deploy and appscript dirs are)
# Must supply ENV in (prd, stg)
#

set -eu
CLASP_JSON=./appscript/.clasp.json

function verify_invocation() {
  test -d appscript || {
    echo appscript dir not found: run script from repository root
    exit 1
  }
}

function verify_args() {
  test "$ENV" == "prd" ||
  test "$ENV" == "stg" || {
    echo "Invalid \$ENV='$ENV'. Expected 'prd' or 'stg'"
    exit 1
  }
}

function link_clasp_config() {
  cp ./deploy/clasp.json-"$ENV" $CLASP_JSON
  # shellcheck disable=SC2064
  trap "rm -f -- $CLASP_JSON" EXIT
}

verify_invocation
verify_args
link_clasp_config

(
  cd ./appscript
  npx clasp push
)
