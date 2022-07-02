#!/bin/bash
#
# Deploy appscript.
# Script must be run from source root (where the deploy and appscript dirs are)
# Must supply ENV in (prd, stg)
#

set -eu
CLASP_JSON=./appscript/.clasp.json
CLASP_PACKAGE_JSON=./appscript/package.json

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

function create_clasp_config() {
  cp ./deploy/clasp.json-"$ENV" $CLASP_JSON
  # shellcheck disable=SC2064
  trap "rm -f -- $CLASP_JSON" EXIT
}

function create_clasp_package_json() {
  # Clasp doesn't work if you try deploy w/o a package.json if you use typescript  
  # Even though it shouldn't care. This is a bug.
  # https://github.com/google/clasp/issues/875
  #
  # I can't leave my regular package.json in there though b/c that creates a 
  # node_modules dir, and .claspignore is broken so I can't exclude it. 
  # Also a bug.
  # https://github.com/google/clasp/issues/67 
  cp ./deploy/clasp.package.json $CLASP_PACKAGE_JSON
  # shellcheck disable=SC2064
  trap "rm -f -- $CLASP_PACKAGE_JSON" EXIT
}

verify_invocation
verify_args
create_clasp_config
create_clasp_package_json

(
  cd ./appscript
  npx clasp push
)
