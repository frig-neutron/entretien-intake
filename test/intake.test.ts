import {responseFieldLabels, toJira, toJiraTestMode} from "../appscript/Code"
import {mock} from "jest-mock-extended";
import {mockJira, TicketParts} from "./jira-mock";
import MailApp = GoogleAppsScript.Mail.MailApp;
import SpreadsheetApp = GoogleAppsScript.Spreadsheet.SpreadsheetApp;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import CustomMatcherResult = jest.CustomMatcherResult;
import Integer = GoogleAppsScript.Integer;
import Range = GoogleAppsScript.Spreadsheet.Range;


declare var global: typeof globalThis; // can't use @types/node

const firstResponseRow = 2

const mockMailApp = mock<MailApp>()

let sheets: ReturnType<typeof mockSheets>;
let resp: Responses

export type Responses = ReturnType<typeof responses>
function responses(rowValues: string[]) {
  const responseColumns = ["Timestamp", "Description", "Bâtiment", "Zone", "Priorité", "Rapporté par", "Elément"]

  return {
    responseValue(column: string) {
      return Object.fromEntries(
          responseColumns.map((e, i) => [e, rowValues[i]])
      )[column]
    },
    nColumns: rowValues.length,
    headerRow: responseColumns,
    rowValues: rowValues
  }
}

function mockSheets(responseValues: Responses) {
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
      mockLogSheet(): Sheet {
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

  const responseSheet = function () {
    return {
      mockResponseSheet() {
        return mock<Sheet>({
          getLastColumn(): Integer {
            return responseValues.nColumns
          },
          getLastRow(): Integer {
            return firstResponseRow
          },
          getRange(row: string | Integer, column?: Integer, numRows?: Integer, numColumns?: Integer): Range {

            const _isGetResponseRange = (row: Integer, col: Integer, nRows: Integer, nCols: Integer) =>
                row === firstResponseRow && col === 1 &&
                nRows === 1 && nCols === responseValues.nColumns;
            const _isGetHeaderRange = (row: Integer, col: Integer, nRows: Integer, nCols: Integer) =>
                row === 1 && col === 1 &&
                nRows === 1 && nCols === responseValues.nColumns;

            if (column && numRows && numColumns && numColumns && typeof row == "number") {
              if (_isGetHeaderRange(row, column, numRows, numColumns)) {
                return mock<Range>({
                  getValues() {
                    return [responseValues.headerRow]
                  }
                })
              }
              if (_isGetResponseRange(row, column, numRows, numColumns)) {
                return mock<Range>({
                  getValues() {
                    return [responseValues.rowValues]
                  }
                })
              }
            }
            throw `Not a header or response range: ${row}, ${column}, ${numRows}, ${numColumns}`
          }
        })
      }
    };
  }()

  global.SpreadsheetApp = mock<SpreadsheetApp>({
    getActive() {
      return mock<Spreadsheet>({
        getSheetByName(name: string) {
          switch (name) {
            case "Form responses 1":
              return responseSheet.mockResponseSheet()
            case "state-of-affairs":
              return logSheet.mockLogSheet()
          }
          throw "Unexpected sheet name"
        }
      })
    }
  })

  return {
    logSheet: logSheet,
    responseSheet: responseSheet
  }
}

global.MailApp = mockMailApp

type MailAppSendMail = Parameters<typeof MailApp.sendEmail>;


type EmailSpec = {
  to: string,
  subject: string,
  bodyParts: BodyParts
}

type BodyParts = {
  recipientName: string,
  reasonForReceiving: string,
  isUrgent: boolean,
  issueKey: string,
  summaryLine: string
}

interface EmailMatchers {
  someCallSendsEmail(e: EmailSpec): CustomMatcherResult,

  callSendsEmail(e: EmailSpec): CustomMatcherResult,

  toSendAllEmail(...emailSpecs: EmailSpec[]): CustomMatcherResult

  emailBodyContainsParts(bodyParts: BodyParts): CustomMatcherResult
}

declare global {
  namespace jest {
    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Matchers<R> extends EmailMatchers {
    }

    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Expect extends EmailMatchers {
    }
  }
}

expect.extend({
  emailBodyContainsParts(received: string, bodyParts: BodyParts): CustomMatcherResult {
    const submittedBy = resp.responseValue(responseFieldLabels.reportedBy)
    const description = resp.responseValue(responseFieldLabels.description)

    if (bodyParts.isUrgent) {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted an URGENT maintenance report"))
    } else {
      expect(received).toMatch(new RegExp(submittedBy + " has submitted a maintenance report"))
    }
    expect(received).toMatch(new RegExp("^Dear " + bodyParts.recipientName))
    expect(received).toMatch(new RegExp(bodyParts.summaryLine + "\n" + description))
    expect(received).toMatch(new RegExp("You are receiving this email because " + bodyParts.reasonForReceiving))
    expect(received).toMatch(new RegExp(
        "Jira ticket "
        + "https://lalliance.atlassian.net/browse/" + bodyParts.issueKey
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
  const urgentResponseValues = responses([
    "28/03/2021 16:01:17",
    "L'eau chaude ne marche pas",
    "3737",
    "Sous-sol",
    "Urgent (à régler dans les prochaines 24 heures / to be repaired in the next 24 hours)",
    "Diego Briceño",
    "chauffe-eau"
  ])

  test("End to end, urgent", () => {
    resp = urgentResponseValues
    sheets = mockSheets(resp)
    const jira = mockJira(resp);
    const timestampLike = /....-..-..T..:..:..\....Z/;

    toJira(null);

    sheets.logSheet.assertJiraUrlSetTo(jira.issueRestUrl)
    sheets.logSheet.assertJiraIssueKeySetTo(jira.issueKey)
    sheets.logSheet.assertProcessTimestampMatches(timestampLike)

    jira.assertTicketCreated({isUrgent: true})

    // verify sent notifications
    expect(mockMailApp.sendEmail.mock.calls).toSendAllEmail(
        {
          to: 'yassaoubangoura@yahoo.fr',
          subject: 'URGENT maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Moussa",
            reasonForReceiving: "you are a building representative for 3737",
            isUrgent: true,
            ...jira
          }
        },
        {
          to: 'mgutkowska2+intake@gmail.com',
          subject: 'URGENT maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Monica",
            reasonForReceiving: "you are an Urgence-level responder",
            isUrgent: true,
            ...jira
          }
        },
        {
          to: 'shkosi@hotmail.com',
          subject: 'URGENT maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Kosai",
            reasonForReceiving: "you are a triage responder",
            isUrgent: true,
            ...jira
          }
        }
    )
  })

  const nonUrgentResponseValues = responses([
    "28/03/2021 16:01:17",
    "L'eau chaude ne marche pas",
    "3737",
    "Sous-sol",
    "Régulier (ça peut être régler dans plus de 24 heures / can be solved in more that 24 hours)",
    "Diego Briceño",
    "chauffe-eau"
  ])
  test("End to end, non-urgent", () => {
    resp = nonUrgentResponseValues
    mockSheets(resp)
    const jira = mockJira(resp);
    toJira(null);

    jira.assertTicketCreated({isUrgent: false})

    expect(mockMailApp.sendEmail.mock.calls).toSendAllEmail({
          to: 'yassaoubangoura@yahoo.fr',
          subject: 'Maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Moussa",
            reasonForReceiving: "you are a building representative for 3737",
            isUrgent: false,
            ...jira
          }
        },
        {
          to: 'shkosi@hotmail.com',
          subject: 'Maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Kosai",
            reasonForReceiving: "you are a triage responder",
            isUrgent: false,
            ...jira
          }
        }
    )
  })

  test("Test-mode", () => {
    resp = urgentResponseValues
    sheets = mockSheets(resp)
    const jira = mockJira(resp);

    toJiraTestMode("");

    jira.assertTicketCreated({
      isUrgent: true,
      summary: "TEST - " + jira.summaryLine
    })

    expect(mockMailApp.sendEmail.mock.calls).toSendAllEmail(
        {
          to: 'frig.neutron+yassaoubangoura@gmail.com',
          subject: 'TEST - URGENT maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Moussa",
            reasonForReceiving: "you are a building representative for 3737",
            isUrgent: true,
            ...jira
          }
        }, {
          to: 'frig.neutron+mgutkowska2+intake@gmail.com',
          subject: 'TEST - URGENT maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Monica",
            reasonForReceiving: "you are an Urgence-level responder",
            isUrgent: true,
            ...jira
          }
        }, {
          to: 'frig.neutron+shkosi@gmail.com',
          subject: 'TEST - URGENT maintenance report from Diego Briceño',
          bodyParts: {
            recipientName: "Kosai",
            reasonForReceiving: "you are a triage responder",
            isUrgent: true,
            ...jira
          }
        })
  })
})
