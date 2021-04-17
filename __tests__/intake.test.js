intake = require("../appscript/Code")

let responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]
// todo:
// return response columns if called with (1, 1, 1, nCols)
// return data rows if called with
let formResponseSheetGetRange = jest.fn(() => ({
  getValues: () => ([responseColumns])
}))

firstResponseRow = 2
unprocessedRowTimestamp = ""

// noinspection JSUnusedGlobalSymbols
mocks = {
  responseLogTimestamp: unprocessedRowTimestamp,
  jiraToken: "tok-" + Math.random(),
  newJiraIssueKey: "ISSUE-" + Math.random(),

  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  responseHeaderRange: {
    getValues() {
      return [responseColumns]
    }
  },
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  responseValueRange: {
    getValues() {
      return [[
        "28/03/2021 16:01:17",
        "L'eau chaude ne marche pas",
        "3737",
        "Sous-sol",
        "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
        "Diego Briceño",
        "chauffe-eau"
      ]]
    }
  },

  /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
  responsesSheet: {
    _isGetResponseRange: (row, col, nRows, nCols) =>
        row === firstResponseRow && col === 1 &&
        nRows === 1 && nCols === responseColumns.length,
    _isGetHeaderRange: (row, col, nRows, nCols) =>
        row === 1 && col === 1 &&
        nRows === 1 && nCols === responseColumns.length,
    getLastColumn: () => responseColumns.length,
    getLastRow: () => firstResponseRow,
    getRange(row, column, numRows, numColumns) {
      if (this._isGetHeaderRange(row, column, numRows, numColumns)) {
        return mocks.responseHeaderRange
      }
      if (this._isGetResponseRange(row, column, numRows, numColumns)) {
        return mocks.responseValueRange
      }
    }
  },

  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logTimestampRange: {
    getValue() {
      return mocks.responseLogTimestamp
    },
    setValue: jest.fn()
  },
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logIssueKeyRange: {
    setValue: jest.fn()
  },
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logIssueLinkRange: {
    setValue: jest.fn()
  },

  /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
  logSheet: {
    _isTimestampCheck: (r, c) => r === firstResponseRow && c === 1,
    _isIssueKeyCheck: (r, c) => r === firstResponseRow && c === 2,
    _isIssueLinkCheck: (r, c) => r === firstResponseRow && c === 3,
    getRange(row, col) {
      if (this._isTimestampCheck(row, col)) {
        return mocks.logTimestampRange
      }
      if (this._isIssueKeyCheck(row, col)) {
        return mocks.logIssueKeyRange
      }
      if (this._isIssueLinkCheck(row, col)) {
        return mocks.logIssueLinkRange
      }
    }
  }
}

global.SpreadsheetApp = {
  getActive: () => ({
    getSheetByName: (name) => {
      switch (name) {
        case "Form responses 1":
          return mocks.responsesSheet
        case "state-of-affairs":
          return mocks.logSheet
      }
    }
  })
}

global.MailApp = {}

// wrap value in fake iterator. Returns the same value over and over and over and over....
iter = (value) => ({
  next: () => value
})

global.DriveApp = {
  getRootFolder: () => ({
    getFoldersByName: (folderName) => {
      if (folderName === "jira") {
        return iter({
          getFilesByName: (fileName) => {
            if (fileName === "jira-basic-auth-token") {
              return iter({
                getBlob: () => ({
                  getDataAsString: () => mocks.jiraToken
                })
              })
            }
          }
        })
      }
    }
  })
}

// noinspection JSUnusedLocalSymbols
global.UrlFetchApp = {
  fetch: jest.fn((url, options) => {
    // todo: verify token and that options match submitted form values
    return {
      getContentText() {
        return JSON.stringify({
          key: mocks.newJiraIssueKey,
          self: "https://lalliance.atlassian.net/mockrest/" + mocks.newJiraIssueKey,
        })
      }
    }
  })
}

test("End to end", () => {
  intake.toJira(null);

  // todo: check invocations, and possibly reset
  mocks.logIssueLinkRange.setValue
  mocks.logIssueKeyRange.setValue
  mocks.logTimestampRange.setValue

  // verify:
  // - jira ticket filed
  // -- verify that token is correct
  // -- verify ticket values
  // - email sent to each BR, urgence and catchall mailbox
  // - email contains jira link
  // - title is formatted
  // - email starts with greeting
})

test("Test-mode", () => {
  // when jirafy invoked in test mode,
  // same as end-to-end test except
  // jira tickets have TEST prefixed to description
  // all email goes to daniil.alliance+other.person@gmail.com

})

// piece-by-piece
test("Create notification emails", () => {
  intake.roleDirectory["666"] = [{
    name: "TheBeast",
    email: "665+1@gmail.com"
  }]
  let ticketContext = {
    "jiraTicket": "abc123",
    "formData": {
      "building": 666,
      "summary": "summary",
      "priority": "Medium"
    },
    "rowIndex": 1
  }
  let emails = intake.createNotificationEmail(ticketContext)

  expect(emails).toMatchObject([{
    to: "665+1@gmail.com"
  }])
})
