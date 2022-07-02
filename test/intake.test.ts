import {toJira, toJiraTestMode} from "../appscript/Code"
import {mock} from "jest-mock-extended";
import {mockJira} from "./jira-mock";
import {mockMailApp} from "./mail-mock";
import SpreadsheetApp = GoogleAppsScript.Spreadsheet.SpreadsheetApp;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import Integer = GoogleAppsScript.Integer;
import Range = GoogleAppsScript.Spreadsheet.Range;


declare var global: typeof globalThis; // can't use @types/node

const firstResponseRow = 2

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
    const sheets = mockSheets(resp)
    const jira = mockJira(resp);
    const mailApp = mockMailApp(resp)

    const timestampLike = /....-..-..T..:..:..\....Z/;

    toJira(null);

    sheets.logSheet.assertJiraUrlSetTo(jira.issueRestUrl)
    sheets.logSheet.assertJiraIssueKeySetTo(jira.issueKey)
    sheets.logSheet.assertProcessTimestampMatches(timestampLike)

    jira.assertTicketCreated({isUrgent: true})
    mailApp.assertAllMailSent(
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
    const mailApp = mockMailApp(resp)

    toJira(null);

    jira.assertTicketCreated({isUrgent: false})

    mailApp.assertAllMailSent({
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
    mockSheets(resp)
    const jira = mockJira(resp);
    const mailApp = mockMailApp(resp)

    toJiraTestMode("");

    jira.assertTicketCreated({
      isUrgent: true,
      summary: "TEST - " + jira.summaryLine
    })

    mailApp.assertAllMailSent(
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
