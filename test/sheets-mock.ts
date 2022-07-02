import {mock} from "jest-mock-extended";
import {Responses} from "./intake.test";
import SpreadsheetApp = GoogleAppsScript.Spreadsheet.SpreadsheetApp;
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import Integer = GoogleAppsScript.Integer;
import Range = GoogleAppsScript.Spreadsheet.Range;

declare var global: typeof globalThis; // can't use @types/node


const firstResponseRow = 2

export function mockSheetsApp(responseValues: Responses) {
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
