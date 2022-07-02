import {toJira, toJiraTestMode} from "../appscript/Code"
import {mock} from "jest-mock-extended";
import MailApp = GoogleAppsScript.Mail.MailApp;
import SpreadsheetApp = GoogleAppsScript.Spreadsheet.SpreadsheetApp;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import Folder = GoogleAppsScript.Drive.Folder;
import File = GoogleAppsScript.Drive.File;
import UrlFetchApp = GoogleAppsScript.URL_Fetch.UrlFetchApp;
import CustomMatcherResult = jest.CustomMatcherResult;
import DriveApp = GoogleAppsScript.Drive.DriveApp;
import FolderIterator = GoogleAppsScript.Drive.FolderIterator;
import Blob = GoogleAppsScript.Base.Blob;
import HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;
import Integer = GoogleAppsScript.Integer;
import Range = GoogleAppsScript.Spreadsheet.Range;

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

const responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]
const urgentResponseValues = [
  "28/03/2021 16:01:17",
  "L'eau chaude ne marche pas",
  "3737",
  "Sous-sol",
  "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
  "Diego Briceño",
  "chauffe-eau"
]
const nonUrgentResponseValues = [
  "28/03/2021 16:01:17",
  "L'eau chaude ne marche pas",
  "3737",
  "Sous-sol",
  "Régulier (ça peut être régler dans plus de 24 heures / can be solved in more that 24 hours)",
  "Diego Briceño",
  "chauffe-eau"
]

const firstResponseRow = 2
const unprocessedRowTimestamp = ""

const mocks = {
  responseValues: [] as string[],
  responseMap() {
    return Object.fromEntries(
        responseColumns.map((e, i) => [e, mocks.responseValues[i]])
    )
  },
  summaryLine() {
    const building = mocks.responseMap()[responseFieldLabels.building]
    const area = mocks.responseMap()[responseFieldLabels.area]
    const shortSummary = mocks.responseMap()[responseFieldLabels.element]

    return building + " " + area + ": " + shortSummary
  },
  responseLogTimestamp: unprocessedRowTimestamp,
  restUrlBase: "https://lalliance.atlassian.net/mockrest/",
  jiraToken: "tok-" + Math.random(),
  newJiraIssueKey: "ISSUE-" + Math.random(),

  responsesSheet: mock<Sheet>(),

  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logTimestampRange: mock<Range>({
    getValue(): any {
      return mocks.responseLogTimestamp
    }
  }),
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logIssueKeyRange: mock<Range>(),
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  logIssueLinkRange: mock<Range>()
}

global.SpreadsheetApp = mock<SpreadsheetApp>({
  getActive() {
    return mock<Spreadsheet>({
      getSheetByName(name: string) {
        switch (name) {
          case "Form responses 1":
            return responseSheet()
          case "state-of-affairs":
            return logSheet()
        }
        throw "Unexpected sheet name"
      }
    })
  }
})

function responseSheet() {
  return mock<Sheet>({
    getLastColumn(): Integer {
      return responseColumns.length
    },
    getLastRow(): Integer {
      return firstResponseRow
    },
    getRange(row: string | Integer, column?: Integer, numRows?: Integer, numColumns?: Integer): Range {

      const _isGetResponseRange = (row: Integer, col: Integer, nRows: Integer, nCols: Integer) =>
          row === firstResponseRow && col === 1 &&
          nRows === 1 && nCols === responseColumns.length;
      const _isGetHeaderRange = (row: Integer, col: Integer, nRows: Integer, nCols: Integer) =>
          row === 1 && col === 1 &&
          nRows === 1 && nCols === responseColumns.length;

      if (column && numRows && numColumns && numColumns && typeof row == "number") {
        if (_isGetHeaderRange(row, column, numRows, numColumns)) {
          return mock<Range>({
            getValues() {
              return [responseColumns]
            }
          })
        }
        if (_isGetResponseRange(row, column, numRows, numColumns)) {
          return mock<Range>({
            getValues() {
              return [mocks.responseValues]
            }
          })
        }
      }
      throw `Not a header or response range: ${row}, ${column}, ${numRows}, ${numColumns}`
    }
  })
}

function logSheet(): Sheet {
  return mock<Sheet>({
        getRange(row: string | Integer, col?): Range {

          const _isTimestampCheck = row === firstResponseRow && col === 1
          if (_isTimestampCheck) {
            return mocks.logTimestampRange
          }

          const _isIssueKeyCheck = row === firstResponseRow && col === 2
          if (_isIssueKeyCheck) {
            return mocks.logIssueKeyRange
          }

          const _isIssueLinkCheck = row === firstResponseRow && col === 3
          if (_isIssueLinkCheck) {
            return mocks.logIssueLinkRange
          }
          throw `Unexpected getRange call to the log sheet ${row}, ${col}}`
        }
      }
  )
}

const mockMailApp = mock<MailApp>()
global.MailApp = mockMailApp

type MailAppSendMail = Parameters<typeof MailApp.sendEmail>;

type GenericIterator<F extends File | Folder> = {
  getContinuationToken(): string,
  hasNext(): boolean,
  next(): F
}

// wrap value in fake iterator. Returns the same value over and over and over and over....
const iter = <F extends File | Folder>(value: F): GenericIterator<F> => ({
  next: () => value,
  hasNext: () => true,
  getContinuationToken: () => ""
})

const mockDriveApp = mock<DriveApp>({
  getRootFolder: () => mock<Folder>({
    getFoldersByName: (folderName: string) => mock<GoogleAppsScript.Drive.FolderIterator>(
        folderName !== "jira"
            ? mock<FolderIterator>() // todo: should probably throw exception here
            : iter<Folder>(mock<Folder>({
              getFilesByName: (fileName: string) => iter<File>(
                  mock<File>({
                    getBlob: () => mock<Blob>({
                      getDataAsString: () => fileName === "jira-basic-auth-token" ? mocks.jiraToken : "WRONG TOKEN"
                    })
                  })
              )
            }))
    )
  })
})
global.DriveApp = mockDriveApp

const mockUrlFetchApp = mock<UrlFetchApp>({
  fetch: jest.fn((url: string): HTTPResponse => {
    return mock<HTTPResponse>({
          getContentText() {
            return JSON.stringify({
              key: mocks.newJiraIssueKey,
              self: mocks.restUrlBase + mocks.newJiraIssueKey,
            })
          }
        }
    )
  })
})

// noinspection JSUnusedLocalSymbols
global.UrlFetchApp = mockUrlFetchApp

type TicketParts = {
  isUrgent: boolean,
  summary: string
}

type EmailSpec = {
  to: string,
  subject: string,
  bodyParts: BodyParts
}

type BodyParts = {
  recipientName: string,
  reasonForReceiving: string,
  isUrgent: boolean
}

interface EmailMatchers {
  someCallSendsEmail(e: EmailSpec): CustomMatcherResult,

  callSendsEmail(e: EmailSpec): CustomMatcherResult,

  toSendAllEmail(...emailSpecs: EmailSpec[]): CustomMatcherResult

  emailBodyContainsParts(bodyParts: BodyParts): CustomMatcherResult
}

interface TicketMatchers {
  filesJiraTicket(ticketParts: TicketParts): CustomMatcherResult,
}

declare global {
  namespace jest {
    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Matchers<R> extends EmailMatchers, TicketMatchers{
    }

    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Expect extends EmailMatchers{
    }
  }
}


expect.extend({
  filesJiraTicket(received, ticketParts: TicketParts) {
    const [url, options] = received
    const payload = JSON.parse(options.payload)
    const submittedBy = mocks.responseMap()[responseFieldLabels.reportedBy]
    const description = mocks.responseMap()[responseFieldLabels.description]

    expect(url).toEqual("https://lalliance.atlassian.net/rest/api/latest/issue")
    expect(options).toMatchObject({
      // todo: seems redundant to have multiple content type specs. retest.
      "contentType": "application/json",
      "method": "post",
      headers: {
        "contentType": "application/json",
        "Accept": "application/json",
        "authorization": "Basic " + mocks.jiraToken
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
  emailBodyContainsParts(received: string, bodyParts: BodyParts): CustomMatcherResult {
    const submittedBy = mocks.responseMap()[responseFieldLabels.reportedBy]
    const description = mocks.responseMap()[responseFieldLabels.description]

    if (bodyParts.isUrgent) {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted an URGENT maintenance report"))
    } else {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted a maintenance report"))
    }
    expect(received).toMatch(new RegExp("^Dear " + bodyParts.recipientName))
    expect(received).toMatch(new RegExp(mocks.summaryLine() + "\n" + description))
    expect(received).toMatch(new RegExp("You are receiving this email because " + bodyParts.reasonForReceiving))
    expect(received).toMatch(new RegExp(
        "Jira ticket "
        + "https://lalliance.atlassian.net/browse/" + mocks.newJiraIssueKey
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
  callSendsEmail(received: MailAppSendMail, emailSpec: EmailSpec): CustomMatcherResult {
    const emailObject = received[0]
    expect(emailObject).toMatchObject({
      to: emailSpec.to,
      subject: emailSpec.subject,
      body: expect.emailBodyContainsParts(emailSpec.bodyParts)
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
  someCallSendsEmail(received: MailAppSendMail[], emailSpec: EmailSpec): CustomMatcherResult {
    type ErrOrMatchResult = CustomMatcherResult | Error
    const requireError = (e: unknown): Error => {
      if (e instanceof Error)
        return e
      else
        throw Error(`${e} should be of type Error, but it was something else`)
    }

    const assertionErrorOrUndefined: ErrOrMatchResult[] = received.map(theCall => {
      try {
        return expect(theCall).callSendsEmail(emailSpec)
      } catch (assertionError: unknown) {
        return requireError(assertionError)
      }
    })

    const isSuccess = (e: any): boolean => typeof e == "undefined" // no error == success
    const atLeastOneMatch = assertionErrorOrUndefined.map(isSuccess).filter((i: boolean) => i).length > 0
    const getMessage = (e: ErrOrMatchResult) => {
      if (e instanceof Error) {
        return e.message
      } else {
        return e.message()
      }
    }

    const isFailure = (e: any): boolean => !isSuccess(e)
    const failures = assertionErrorOrUndefined.filter(isFailure);
    return {
      pass: atLeastOneMatch,
      message: () => {
        const matchFailures: string[] = failures.map(getMessage)
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

describe("intake logic", () => {
  test("End to end, urgent", () => {
    mocks.responseValues = urgentResponseValues
    const timestampLike = /....-..-..T..:..:..\....Z/;

    toJira(null);

    // verify log sheet updates
    expect(mocks.logIssueLinkRange.setValue.mock.calls[0][0]).toEqual(mocks.restUrlBase + mocks.newJiraIssueKey)
    expect(mocks.logIssueKeyRange.setValue.mock.calls[0][0]).toEqual(mocks.newJiraIssueKey)
    expect(mocks.logTimestampRange.setValue.mock.calls[0][0]).toMatch(timestampLike)

    // verify jira ticket
    expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
      isUrgent: true,
      summary: mocks.summaryLine()
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
    mocks.responseValues = nonUrgentResponseValues

    toJira(null);

    expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
      isUrgent: false,
      summary: mocks.summaryLine()
    })

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

  test("Test-mode", () => {
    mocks.responseValues = urgentResponseValues

    toJiraTestMode("");

    expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
      isUrgent: true,
      summary: "TEST - " + mocks.summaryLine()
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
})
