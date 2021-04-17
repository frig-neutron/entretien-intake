intake = require("../appscript/Code")

let responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]
let responseValues = [
  "28/03/2021 16:01:17",
  "L'eau chaude ne marche pas",
  "3737",
  "Sous-sol",
  "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
  "Diego Briceño",
  "chauffe-eau"
]

firstResponseRow = 2
unprocessedRowTimestamp = ""

// noinspection JSUnusedGlobalSymbols
mocks = {
  responseMap() {
    return Object.fromEntries(
        responseColumns.map((e, i) => [e, responseValues[i]])
    )
  },
  responseLogTimestamp: unprocessedRowTimestamp,
  restUrlBase: "https://lalliance.atlassian.net/mockrest/",
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
      return [responseValues]
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

/** @type {GoogleAppsScript.Spreadsheet.SpreadsheetApp} */
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

/** @type {GoogleAppsScript.Mail.MailApp} */
global.MailApp = {
  sendEmail: jest.fn()
}

// wrap value in fake iterator. Returns the same value over and over and over and over....
iter = (value) => ({
  next: () => value
})

/** @type {GoogleAppsScript.Drive.DriveApp} */
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
          self: mocks.restUrlBase + mocks.newJiraIssueKey,
        })
      }
    }
  })
}

expect.extend({
  emailBody(received, bodyParts) {
    let submittedBy = mocks.responseMap()[intake.responseFieldLabels.reportedBy]
    let building = mocks.responseMap()[intake.responseFieldLabels.building]
    let area = mocks.responseMap()[intake.responseFieldLabels.area]
    let shortSummary = mocks.responseMap()[intake.responseFieldLabels.element]
    let description = mocks.responseMap()[intake.responseFieldLabels.description]

    if (bodyParts.isUrgent) {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted an URGENT maintenance report"))
    } else {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted a maintenance report"))
    }
    expect(received).toMatch(new RegExp("^Dear " + bodyParts.recipientName))
    expect(received).toMatch(new RegExp(building + " " + area + ": " + shortSummary + "\n" + description))
    expect(received).toMatch(new RegExp("You are receiving this email because " + bodyParts.reasonForReceiving))
    expect(received).toMatch(new RegExp(
        "Jira ticket "
        + "https://lalliance.atlassian.net/browse/" + mocks.newJiraIssueKey
        + " has been assigned to this report"
    ))

    return {
      pass: true,
    }
  },
  emailSent(received, matchers) {
    let emailObject = received[0]
    expect(emailObject).toMatchObject({
      to: matchers.to,
      subject: matchers.subject,
      body: expect.emailBody(matchers.bodyParts)
    })
    return {
      pass: true,
    }
  }
})

test("End to end, urgent", () => {
  let timestampLike = /....-..-..T..:..:..\....Z/;

  intake.toJira(null);

  expect(mocks.logIssueLinkRange.setValue.mock.calls[0][0]).toEqual(mocks.restUrlBase + mocks.newJiraIssueKey)
  expect(mocks.logIssueKeyRange.setValue.mock.calls[0][0]).toEqual(mocks.newJiraIssueKey)
  expect(mocks.logTimestampRange.setValue.mock.calls[0][0]).toMatch(timestampLike)

  expect(global.MailApp.sendEmail.mock.calls[0]).emailSent({
    to: 'daniil.alliance+as.moussa.br3737@gmail.com',
    subject: 'URGENT maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Moussa",
      reasonForReceiving: "you are a building representative for 3737",
      isUrgent: true
    }
  })
  expect(global.MailApp.sendEmail.mock.calls[1]).emailSent({
    to: 'daniil.alliance+urgence@gmail.com',
    subject: 'URGENT maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Monica",
      reasonForReceiving: "you are an Urgence-level responder",
      isUrgent: true
    }
  })
  // verify:
  // - jira ticket filed
  // -- verify that token is correct
  // -- verify ticket values
  // - title is formatted
})

test("Test-mode", () => {
  // when jirafy invoked in test mode,
  // same as end-to-end test except
  // jira tickets have TEST prefixed to description
  // all email goes to daniil.alliance+other.person@gmail.com

})
