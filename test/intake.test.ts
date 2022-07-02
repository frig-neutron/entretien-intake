import {responseFieldLabels, toJira, toJiraTestMode} from "../appscript/Code"
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


declare var global: typeof globalThis; // can't use @types/node

const responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]

const firstResponseRow = 2

const responseSheet = {
  responseValues: [] as string[],
  responseMap() {
    return Object.fromEntries(
        responseColumns.map((e, i) => [e, responseSheet.responseValues[i]])
    )
  }
}

const logSheet = function () {
  const unprocessedRowTimestamp = ""
  const issueLinkRange = mock<Range>()
  const timestampRange = mock<Range>({
    getValue(): any {
      return unprocessedRowTimestamp
    }
  })
  const issueKeyRange = mock<Range>()

  return {
    mockSheet(): Sheet {
      return mock<Sheet>({
            getRange(row: string | Integer, col?): Range {

              const _isTimestampCheck = row === firstResponseRow && col === 1
              if (_isTimestampCheck) {
                return timestampRange
              }

              const _isIssueKeyCheck = row === firstResponseRow && col === 2
              if (_isIssueKeyCheck) {
                return issueKeyRange
              }

              const _isIssueLinkCheck = row === firstResponseRow && col === 3
              if (_isIssueLinkCheck) {
                return issueLinkRange
              }
              throw `Unexpected getRange call to the log sheet ${row}, ${col}}`
            }
          }
      )
    },
    assertJiraUrlSetTo(url: string) {
      expect(issueLinkRange.setValue.mock.calls[0][0]).toEqual(url)
    },
    assertJiraIssueKeySetTo(issueKey: string) {
      expect(issueKeyRange.setValue.mock.calls[0][0]).toEqual(issueKey)
    },
    assertProcessTimestampMatches(timestampLike: RegExp) {
      expect(timestampRange.setValue.mock.calls[0][0]).toMatch(timestampLike)
    }
  }
}()

function jiraMock() {
  const restUrlBase = "https://lalliance.atlassian.net/mockrest/";

  return {
    issueKey: "ISSUE-" + Math.random(),
    apiToken: "tok-" + Math.random(),
    issueRestUrl: function () {
      return restUrlBase + this.issueKey
    },
    summaryLine() {
      const building = responseSheet.responseMap()[responseFieldLabels.building]
      const area = responseSheet.responseMap()[responseFieldLabels.area]
      const shortSummary = responseSheet.responseMap()[responseFieldLabels.element]

      return building + " " + area + ": " + shortSummary
    },
    assertTicketCreated(t: Partial<TicketParts>) {

      expect(mockUrlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
        isUrgent: t.isUrgent!,
        summary: this.summaryLine(),
        ...t // override summary if provided in arg
      })
    }
  }
}

const jira = jiraMock();

global.SpreadsheetApp = mock<SpreadsheetApp>({
  getActive() {
    return mock<Spreadsheet>({
      getSheetByName(name: string) {
        switch (name) {
          case "Form responses 1":
            return mockResponseSheet()
          case "state-of-affairs":
            return logSheet.mockSheet()
        }
        throw "Unexpected sheet name"
      }
    })
  }
})

function mockResponseSheet() {
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
              return [responseSheet.responseValues]
            }
          })
        }
      }
      throw `Not a header or response range: ${row}, ${column}, ${numRows}, ${numColumns}`
    }
  })
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
                      getDataAsString: () => fileName === "jira-basic-auth-token" ? jira.apiToken : "WRONG TOKEN"
                    })
                  })
              )
            }))
    )
  })
})
global.DriveApp = mockDriveApp

const mockUrlFetchApp = mock<UrlFetchApp>({
  fetch: jest.fn((): HTTPResponse => {
    return mock<HTTPResponse>({
          getContentText() {
            return JSON.stringify({
              key: jira.issueKey,
              self: jira.issueRestUrl(),
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
    interface Matchers<R> extends EmailMatchers, TicketMatchers {
    }

    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Expect extends EmailMatchers {
    }
  }
}


expect.extend({
  filesJiraTicket(received, ticketParts: TicketParts) {
    const [url, options] = received
    const payload = JSON.parse(options.payload)
    const submittedBy = responseSheet.responseMap()[responseFieldLabels.reportedBy]
    const description = responseSheet.responseMap()[responseFieldLabels.description]

    expect(url).toEqual("https://lalliance.atlassian.net/rest/api/latest/issue")
    expect(options).toMatchObject({
      // todo: seems redundant to have multiple content type specs. retest.
      "contentType": "application/json",
      "method": "post",
      headers: {
        "contentType": "application/json",
        "Accept": "application/json",
        "authorization": "Basic " + jira.apiToken
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
    const submittedBy = responseSheet.responseMap()[responseFieldLabels.reportedBy]
    const description = responseSheet.responseMap()[responseFieldLabels.description]

    if (bodyParts.isUrgent) {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted an URGENT maintenance report"))
    } else {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted a maintenance report"))
    }
    expect(received).toMatch(new RegExp("^Dear " + bodyParts.recipientName))
    expect(received).toMatch(new RegExp(jira.summaryLine() + "\n" + description))
    expect(received).toMatch(new RegExp("You are receiving this email because " + bodyParts.reasonForReceiving))
    expect(received).toMatch(new RegExp(
        "Jira ticket "
        + "https://lalliance.atlassian.net/browse/" + jira.issueKey
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
  const urgentResponseValues = [
    "28/03/2021 16:01:17",
    "L'eau chaude ne marche pas",
    "3737",
    "Sous-sol",
    "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
    "Diego Briceño",
    "chauffe-eau"
  ]

  test("End to end, urgent", () => {
    responseSheet.responseValues = urgentResponseValues
    const timestampLike = /....-..-..T..:..:..\....Z/;

    toJira(null);

    logSheet.assertJiraUrlSetTo(jira.issueRestUrl())
    logSheet.assertJiraIssueKeySetTo(jira.issueKey)
    logSheet.assertProcessTimestampMatches(timestampLike)

    jira.assertTicketCreated({isUrgent: true})

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

  const nonUrgentResponseValues = [
    "28/03/2021 16:01:17",
    "L'eau chaude ne marche pas",
    "3737",
    "Sous-sol",
    "Régulier (ça peut être régler dans plus de 24 heures / can be solved in more that 24 hours)",
    "Diego Briceño",
    "chauffe-eau"
  ]
  test("End to end, non-urgent", () => {
    responseSheet.responseValues = nonUrgentResponseValues
    toJira(null);

    jira.assertTicketCreated({isUrgent: false})

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
    responseSheet.responseValues = urgentResponseValues

    toJiraTestMode("");

    jira.assertTicketCreated({
      isUrgent: true,
      summary: "TEST - " + jira.summaryLine()
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
