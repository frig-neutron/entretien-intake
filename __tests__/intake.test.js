intake = require("../appscript/Code")

let responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]
let urgentResponseValues = [
  "28/03/2021 16:01:17",
  "L'eau chaude ne marche pas",
  "3737",
  "Sous-sol",
  "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
  "Diego Briceño",
  "chauffe-eau"
]
let nonUrgentResponseValues = [
  "28/03/2021 16:01:17",
  "L'eau chaude ne marche pas",
  "3737",
  "Sous-sol",
  "Régulier (ça peut être régler dans plus de 24 heures / can be solved in more that 24 hours)",
  "Diego Briceño",
  "chauffe-eau"
]

firstResponseRow = 2
unprocessedRowTimestamp = ""

// noinspection JSUnusedGlobalSymbols
mock = {
  responseValues: [],
  responseMap() {
    return Object.fromEntries(
        responseColumns.map((e, i) => [e, mock.responseValues[i]])
    )
  },
  summaryLine() {
    let building = mock.responseMap()[intake.responseFieldLabels.building]
    let area = mock.responseMap()[intake.responseFieldLabels.area]
    let shortSummary = mock.responseMap()[intake.responseFieldLabels.element]

    return building + " " + area + ": " + shortSummary
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
      return [mock.responseValues]
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
        return mock.responseHeaderRange
      }
      if (this._isGetResponseRange(row, column, numRows, numColumns)) {
        return mock.responseValueRange
      }
    }
  },

  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logTimestampRange: {
    getValue() {
      return mock.responseLogTimestamp
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
        return mock.logTimestampRange
      }
      if (this._isIssueKeyCheck(row, col)) {
        return mock.logIssueKeyRange
      }
      if (this._isIssueLinkCheck(row, col)) {
        return mock.logIssueLinkRange
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
          return mock.responsesSheet
        case "state-of-affairs":
          return mock.logSheet
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
                  getDataAsString: () => mock.jiraToken
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
    return {
      getContentText() {
        return JSON.stringify({
          key: mock.newJiraIssueKey,
          self: mock.restUrlBase + mock.newJiraIssueKey,
        })
      }
    }
  })
}

expect.extend({
  filesJiraTicket(received, ticketParts) {
    let [url, options] = received
    let payload = JSON.parse(options.payload)
    let submittedBy = mock.responseMap()[intake.responseFieldLabels.reportedBy]
    let description = mock.responseMap()[intake.responseFieldLabels.description]

    expect(url).toEqual("https://lalliance.atlassian.net/rest/api/latest/issue")
    expect(options).toMatchObject({
      // todo: seems redundant to have multiple content type specs. retest.
      "content-type": "application/json",
      "method": "POST",
      headers: {
        "content-type": "application/json",
        "Accept": "application/json",
        "authorization": "Basic " + mock.jiraToken
      }
    })
    expect(payload).toMatchObject({
      fields: {
        project: {
          key: 'TRIAG'
        },
        issuetype: {
          name: 'Intake'
        },
        summary: mock.summaryLine(),
        description: `${description}\n\nReported by ${submittedBy}`,
        priority: {
          name: ticketParts.isUrgent ? "Urgent" : "Medium"
        }
      }
    })
    return {
      pass: true
    }
  },
  emailBody(received, bodyParts) {
    let submittedBy = mock.responseMap()[intake.responseFieldLabels.reportedBy]
    let description = mock.responseMap()[intake.responseFieldLabels.description]

    if (bodyParts.isUrgent) {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted an URGENT maintenance report"))
    } else {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted a maintenance report"))
    }
    expect(received).toMatch(new RegExp("^Dear " + bodyParts.recipientName))
    expect(received).toMatch(new RegExp(mock.summaryLine() + "\n" + description))
    expect(received).toMatch(new RegExp("You are receiving this email because " + bodyParts.reasonForReceiving))
    expect(received).toMatch(new RegExp(
        "Jira ticket "
        + "https://lalliance.atlassian.net/browse/" + mock.newJiraIssueKey
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
  mock.responseValues = urgentResponseValues
  let timestampLike = /....-..-..T..:..:..\....Z/;

  intake.toJira(null);

  // verify log sheet updates
  expect(mock.logIssueLinkRange.setValue.mock.calls[0][0]).toEqual(mock.restUrlBase + mock.newJiraIssueKey)
  expect(mock.logIssueKeyRange.setValue.mock.calls[0][0]).toEqual(mock.newJiraIssueKey)
  expect(mock.logTimestampRange.setValue.mock.calls[0][0]).toMatch(timestampLike)

  // verify jira ticket
  expect(global.UrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({isUrgent: true})

  // verify sent notifications
  expect(global.MailApp.sendEmail.mock.calls[0]).emailSent({
    to: 'yassaoubangoura@yahoo.fr',
    subject: 'URGENT maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Moussa",
      reasonForReceiving: "you are a building representative for 3737",
      isUrgent: true
    }
  })
  expect(global.MailApp.sendEmail.mock.calls[4]).emailSent({
    to: 'mgutkowska2+intake@gmail.com',
    subject: 'URGENT maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Monica",
      reasonForReceiving: "you are an Urgence-level responder",
      isUrgent: true
    }
  })
})

test("End to end, non-urgent", () => {
  mock.responseValues = nonUrgentResponseValues

  intake.toJira(null);

  // verify jira ticket
  expect(global.UrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({isUrgent: false})

  // verify sent notifications
  expect(global.MailApp.sendEmail.mock.calls[0]).emailSent({
    to: 'yassaoubangoura@yahoo.fr',
    subject: 'Maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Moussa",
      reasonForReceiving: "you are a building representative for 3737",
      isUrgent: false
    }
  })
})

test("Test-mode", () => {
  mock.responseValues = urgentResponseValues

  intake.toJiraTestMode();

  expect(global.UrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({isUrgent: true})

  expect(global.MailApp.sendEmail.mock.calls[0]).emailSent({
    to: 'daniil.alliance+yassaoubangoura@gmail.com',
    subject: 'TEST - URGENT maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Moussa",
      reasonForReceiving: "you are a building representative for 3737",
      isUrgent: true
    }
  })
  expect(global.MailApp.sendEmail.mock.calls[4]).emailSent({
    to: 'daniil.alliance+mgutkowska2+intake@gmail.com',
    subject: 'TEST - URGENT maintenance report from Diego Briceño',
    bodyParts: {
      recipientName: "Monica",
      reasonForReceiving: "you are an Urgence-level responder",
      isUrgent: true
    }
  })

})
