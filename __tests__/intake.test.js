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
        summary: ticketParts.summary,
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
  /**
   * Passes is this call sends this email
   * @param received - Jest call object
   * @param emailSpec
   */
  callSendsEmail(received, emailSpec) {
    let emailObject = received[0]
    expect(emailObject).toMatchObject({
      to: emailSpec.to,
      subject: emailSpec.subject,
      body: expect.emailBody(emailSpec.bodyParts)
    })
    return {
      pass: true,
    }
  },
  /**
   * Passes if at least one call matches emailSpec. (i.e.: if this email is sent by some call)
   * @param received - array of jest mock calls
   * @param emailSpec - spec of a single email
   */
  someCallSendsEmail(received, emailSpec) {
    let assertionErrorOrUndefined = received.map(theCall => {
      try {
        return expect(theCall).callSendsEmail(emailSpec)
      } catch (assertionError) {
        return assertionError
      }
    })
    let isSuccess = (e) => typeof e == "undefined" // no error == success
    let matchSuccesses = assertionErrorOrUndefined.map(isSuccess);
    let atLeastOneMatch = matchSuccesses.filter(i => i).length > 0
    return {
      pass: atLeastOneMatch,
      message: () => {
        let isFailure = (e) => !isSuccess(e)
        let matchFailures = assertionErrorOrUndefined.filter(isFailure).map(e => e.message)
        return `No email matches spec ${JSON.stringify(emailSpec, null, 2)}\n` + matchFailures.join("\n")
      }
    }
  },
  /**
   * Passes if each email objects is matched by the callSendsEmail matcher. (i.e.: if every email is sent)
   * @param received - array of Jest mock calls
   * @param emailSpecs - array of email message specifications
   */
  toSendAllEmail(received, ...emailSpecs) {
    emailSpecs.map(e => expect(received).someCallSendsEmail(e));
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
  expect(global.UrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
    isUrgent: true,
    summary: mock.summaryLine()
  })

  // verify sent notifications
  expect(global.MailApp.sendEmail.mock.calls).toSendAllEmail(
      {
        to: 'yassaoubangoura@yahoo.fr',
        subject: 'URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Moussa",
          reasonForReceiving: "you are a building representative for 3737",
          isUrgent: true
        }
      },
      {
        to: 'mgutkowska2+intake@gmail.com',
        subject: 'URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Monica",
          reasonForReceiving: "you are an Urgence-level responder",
          isUrgent: true
        }
      },
      {
        to: 'shkosi@hotmail.com',
        subject: 'URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Kosai",
          reasonForReceiving: "you are a triage responder",
          isUrgent: true
        }
      }
  )
})

test("End to end, non-urgent", () => {
  mock.responseValues = nonUrgentResponseValues

  intake.toJira(null);

  // verify jira ticket
  expect(global.UrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
    isUrgent: false,
    summary: mock.summaryLine()
  })

  // verify sent notifications
  expect(global.MailApp.sendEmail.mock.calls).toSendAllEmail({
        to: 'yassaoubangoura@yahoo.fr',
        subject: 'Maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Moussa",
          reasonForReceiving: "you are a building representative for 3737",
          isUrgent: false
        }
      },
      {
        to: 'shkosi@hotmail.com',
        subject: 'Maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Kosai",
          reasonForReceiving: "you are a triage responder",
          isUrgent: false
        }
      }
  )
})

test("Test-mode", () => {
  mock.responseValues = urgentResponseValues

  intake.toJiraTestMode();

  expect(global.UrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
    isUrgent: true,
    summary: "TEST - " + mock.summaryLine()
  })

  expect(global.MailApp.sendEmail.mock.calls).toSendAllEmail(
      {
        to: 'frig.neutron+yassaoubangoura@gmail.com',
        subject: 'TEST - URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Moussa",
          reasonForReceiving: "you are a building representative for 3737",
          isUrgent: true
        }
      }, {
        to: 'frig.neutron+mgutkowska2+intake@gmail.com',
        subject: 'TEST - URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Monica",
          reasonForReceiving: "you are an Urgence-level responder",
          isUrgent: true
        }
      },
      {
        to: 'frig.neutron+shkosi@gmail.com',
        subject: 'TEST - URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Kosai",
          reasonForReceiving: "you are a triage responder",
          isUrgent: true
        }
      }
  )
})
