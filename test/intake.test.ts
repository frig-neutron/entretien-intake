import {toJira, toJiraTestMode} from "../build/appscript/Code"
import MailApp = GoogleAppsScript.Mail.MailApp;
import SpreadsheetApp = GoogleAppsScript.Spreadsheet.SpreadsheetApp;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import {mockDeep} from "jest-mock-extended";
import Folder = GoogleAppsScript.Drive.Folder;
import File = GoogleAppsScript.Drive.File;
import MatcherContext = jest.MatcherContext;
import UrlFetchApp = GoogleAppsScript.URL_Fetch.UrlFetchApp;
import MailAdvancedParameters = GoogleAppsScript.Mail.MailAdvancedParameters;
import CustomMatcherResult = jest.CustomMatcherResult;

// todo: remove this, duplicated from Code.ts b/c I can't get it to import
const responseFieldLabels: { [label: string]: string } = {
  building: "Bâtiment",
  element: "Elément",
  description: "Description",
  area: "Zone",
  reportedBy: "Rapporté par",
  priority: "Priorité"
}

declare var global: typeof globalThis; // can't use @types/node

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

let firstResponseRow = 2
let unprocessedRowTimestamp = ""

// noinspection JSUnusedGlobalSymbols
let mock = {
  responseValues: [] as string[],
  responseMap() {
    return Object.fromEntries(
        responseColumns.map((e, i) => [e, mock.responseValues[i]])
    )
  },
  summaryLine() {
    let building = mock.responseMap()[responseFieldLabels.building]
    let area = mock.responseMap()[responseFieldLabels.area]
    let shortSummary = mock.responseMap()[responseFieldLabels.element]

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

  responsesSheet: mockDeep<Sheet>(),
  logSheet: mockDeep<Sheet>(),

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
  }
}

/*
responsesSheet =
 {
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
  }


 */

/** @type {GoogleAppsScript.Spreadsheet.Sheet}
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
 */

const mockSpreadsheetApp = mockDeep<SpreadsheetApp>()
const mockSpreadsheet = mockDeep<Spreadsheet>()
global.SpreadsheetApp = mockSpreadsheetApp
mockSpreadsheetApp.getActive.mockImplementation(() => mockSpreadsheet)
mockSpreadsheet.getSheetByName.mockImplementation((name) => {
      switch (name) {
        case "Form responses 1":
          return mock.responsesSheet
        case "state-of-affairs":
          return mock.logSheet
      }
      throw "Unexpected sheet name"
    }
)

const mockMailApp = mockDeep<MailApp>()
global.MailApp = mockMailApp

type MailAppSendMail = Parameters<typeof MailApp.sendEmail>;


type GenericIterator<F extends File | Folder> = {
  getContinuationToken(): string,
  hasNext(): boolean,
  next(): F
}

// wrap value in fake iterator. Returns the same value over and over and over and over....
let iter = <F extends File | Folder>(value: F): GenericIterator<F> => ({
  next: () => value,
  hasNext: () => true,
  getContinuationToken: () => ""
})

/** @type {GoogleAppsScript.Drive.DriveApp} */
global.DriveApp = {
  getRootFolder: () => ({
    getFoldersByName: (folderName: string) => {
      if (folderName === "jira") {
        return iter<Folder>({
          getFilesByName: (fileName) => {
            if (fileName === "jira-basic-auth-token") {
              return iter<File>({
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

const mockUrlFetchApp = mockDeep<UrlFetchApp>()
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


type TicketParts = {
  isUrgent: boolean,
  summary: string
}

type EmailSpec = {
  to: string,
  subject: string,
  bodyParts: BodyParts
}

declare global {
  namespace jest {
    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Matchers<R> {
      filesJiraTicket(ticketParts: TicketParts): CustomMatcherResult,

      emailBody(bodyParts: BodyParts): CustomMatcherResult,

      someCallSendsEmail(e: EmailSpec): CustomMatcherResult,

      callSendsEmail(e: EmailSpec): CustomMatcherResult,

      toSendAllEmail(...emailSpecs: EmailSpec[]): CustomMatcherResult
    }
  }
}


expect.extend({
  filesJiraTicket(ctx: MatcherContext, received, ticketParts: TicketParts) {
    const [url, options] = received
    const payload = JSON.parse(options.payload)
    const submittedBy = mock.responseMap()[responseFieldLabels.reportedBy]
    const description = mock.responseMap()[responseFieldLabels.description]

    expect(url).toEqual("https://lalliance.atlassian.net/rest/api/latest/issue")
    expect(options).toMatchObject({
      // todo: seems redundant to have multiple content type specs. retest.
      "contentType": "application/json",
      "method": "post",
      headers: {
        "contentType": "application/json",
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
      pass: true,
      message: () => "I ain't nothing to say to you"
    }
  },
  emailBody(ctx: MatcherContext, received: string, bodyParts: BodyParts) {
    let submittedBy = mock.responseMap()[responseFieldLabels.reportedBy]
    let description = mock.responseMap()[responseFieldLabels.description]

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
      message: () => "I ain't nothing to say to you"
    }
  },
  /**
   * Passes is this call sends this email
   * @param received - Jest call object
   * @param emailSpec
   */
  callSendsEmail(received, emailSpec: EmailSpec) {
    const emailObject = received[0]
    expect(emailObject).toMatchObject({
      to: emailSpec.to,
      subject: emailSpec.subject,
      body: expect.emailBody(emailSpec.bodyParts)
    })
    return {
      pass: true,
      message: () => "I ain't nothing to say to you"
    }
  },
  /**
   * Passes if at least one call matches emailSpec. (i.e.: if this email is sent by some call)
   * @param received - array of jest mock calls
   * @param emailSpec - spec of a single email
   */
  someCallSendsEmail(received, emailSpec: EmailSpec): CustomMatcherResult {
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
  toSendAllEmail(received: MailAppSendMail[], ...emailSpecs): CustomMatcherResult {
    emailSpecs.map(e => expect(received).someCallSendsEmail(e));
    return {
      pass: true,
      message: () => "I ain't nothing to say to you"
    }
  }
})

test("End to end, urgent", () => {
  mock.responseValues = urgentResponseValues
  let timestampLike = /....-..-..T..:..:..\....Z/;

  toJira(null);

  // verify log sheet updates
  expect(mock.logIssueLinkRange.setValue.mock.calls[0][0]).toEqual(mock.restUrlBase + mock.newJiraIssueKey)
  expect(mock.logIssueKeyRange.setValue.mock.calls[0][0]).toEqual(mock.newJiraIssueKey)
  expect(mock.logTimestampRange.setValue.mock.calls[0][0]).toMatch(timestampLike)

  // verify jira ticket
  expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
    isUrgent: true,
    summary: mock.summaryLine()
  })

  // verify sent notifications
  expect(mockMailApp.sendEmail.mock.calls).toSendAllEmail(
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

  toJira(null);

  // verify jira ticket
  expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
    isUrgent: false,
    summary: mock.summaryLine()
  })

  // verify sent notifications
  expect(mockMailApp.sendEmail.mock.calls).toSendAllEmail({
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

type BodyParts = {
  recipientName: string,
  reasonForReceiving: string,
  isUrgent: boolean
}

test("Test-mode", () => {
  mock.responseValues = urgentResponseValues

  toJiraTestMode("");

  expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
    isUrgent: true,
    summary: "TEST - " + mock.summaryLine()
  })

  expect(mockMailApp.sendEmail.mock.calls).toSendAllEmail(
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
      }, {
        to: 'frig.neutron+shkosi@gmail.com',
        subject: 'TEST - URGENT maintenance report from Diego Briceño',
        bodyParts: {
          recipientName: "Kosai",
          reasonForReceiving: "you are a triage responder",
          isUrgent: true
        }
      })
})
