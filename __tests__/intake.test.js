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

mocks = {
  responseLogTimestamp: unprocessedRowTimestamp,

  /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
  responsesSheet: {
    getLastColumn: () => responseColumns.length,
    getLastRow: () => firstResponseRow,
    getRange: formResponseSheetGetRange
  },

  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logTimestampRange: {
    getValue: function (){
      return mocks.responseLogTimestamp
    }
  },
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logIssueKeyRange: {

  },
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logIssueLinkRange: {

  },

  /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
  logSheet: {
    _isTimestampCheck: (r, c) => r === firstResponseRow && c === 1,
    _isIssueKeyCheck: (r, c) => r === firstResponseRow && c === 2,
    _isIssueLinkCheck: (r, c) => r === firstResponseRow && c === 3,
    getRange: function(row, col) {
      if (this._isTimestampCheck(row, col)){
        return mocks.logTimestampRange
      }
      if (this._isIssueKeyCheck(row, col)){
        return mocks.logIssueKeyRange
      }
      if (this._isIssueLinkCheck(row, col)){
        return mocks.logIssueLinkRange
      }
    }
  }
}

global.SpreadsheetApp = {
  getActive: () => ({
    getSheetByName: (name) => {
      switch(name){
        case "Form responses 1":
          return mocks.responsesSheet
        case "state-of-affairs":
          return mocks.logSheet
      }
    }
  })
}

global.MailApp = {

}

// wrap value in fake iterator. Returns the same value over and over and over and over....
iter = (value) => ({
  next: () => value
})

mockJiraToken = "tok-" + Math.random()

global.DriveApp = {
  getRootFolder: () => ({
    getFoldersByName: (folderName) => {
      if (folderName === "jira") {
        return iter({
          getFilesByName: (fileName) => {
            if (fileName === "jira-basic-auth-token"){
              return iter({
                getBlob: () => ({
                  getDataAsString: () => mockJiraToken
                })
              })
            }
          }
        })
      }
    }
  })
}

global.UrlFetchApp = {

}

test("End to end", () => {
  intake.toJira(null);

  // verify:
  // - jira ticket filed
  // -- verify that token is correct
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
