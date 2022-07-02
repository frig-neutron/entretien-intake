import {responseFieldLabels} from "../appscript/Code";
import {Responses} from "./intake.test";
import {mock} from "jest-mock-extended";
import UrlFetchApp = GoogleAppsScript.URL_Fetch.UrlFetchApp;
import HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;
import Folder = GoogleAppsScript.Drive.Folder;
import File = GoogleAppsScript.Drive.File;
import CustomMatcherResult = jest.CustomMatcherResult;
import DriveApp = GoogleAppsScript.Drive.DriveApp;
import FolderIterator = GoogleAppsScript.Drive.FolderIterator;
import Blob = GoogleAppsScript.Base.Blob;

declare var global: typeof globalThis; // can't use @types/node

interface TicketMatchers {
  filesJiraTicket(ticketParts: TicketParts): CustomMatcherResult,
}

declare global {
  namespace jest {
    // noinspection JSUnusedGlobalSymbols - need this to give expect matcher hints
    interface Matchers<R> extends TicketMatchers {
    }
  }
}

function extendJestWithJiraMatcher(resp: Responses, apiToken: string) {

  expect.extend({
    filesJiraTicket(received, ticketParts: TicketParts) {
      const [url, options] = received
      const payload = JSON.parse(options.payload)
      const submittedBy = resp.responseValue(responseFieldLabels.reportedBy)
      const description = resp.responseValue(responseFieldLabels.description)

      expect(url).toEqual("https://lalliance.atlassian.net/rest/api/latest/issue")
      expect(options).toMatchObject({
        // todo: seems redundant to have multiple content type specs. retest.
        "contentType": "application/json",
        "method": "post",
        headers: {
          "contentType": "application/json",
          "Accept": "application/json",
          "authorization": "Basic " + apiToken
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
    }
  })
}

export type TicketParts = {
  isUrgent: boolean,
  summary: string
}

function mockTheUrlFetchApp(issueKey: string, issueRestUrl: string) {
  return mock<UrlFetchApp>({
    fetch: jest.fn((): HTTPResponse => {

      return mock<HTTPResponse>({
            getContentText() {
              return JSON.stringify({
                key: issueKey,
                self: issueRestUrl,
              })
            }
          }
      )
    })
  });
}

function mockDriveApp(apiToken: string) {
  return  mock<DriveApp>({
    getRootFolder: () => mock<Folder>({
      getFoldersByName: (folderName: string) => mock<GoogleAppsScript.Drive.FolderIterator>(
          folderName !== "jira"
              ? mock<FolderIterator>() // todo: should probably throw exception here
              : iter<Folder>(mock<Folder>({
                getFilesByName: (fileName: string) => iter<File>(
                    mock<File>({
                      getBlob: () => mock<Blob>({
                        getDataAsString: () => fileName === "jira-basic-auth-token" ? apiToken : "WRONG TOKEN"
                      })
                    })
                )
              }))
      )
    })
  })
}

export function mockJira(resp: Responses) {
  const restUrlBase = "https://lalliance.atlassian.net/mockrest/";
  const issueKey = "ISSUE-" + Math.random()
  const issueRestUrl = restUrlBase + issueKey
  const urlFetchApp = mockTheUrlFetchApp(issueKey, issueRestUrl);
  const summaryLine = function () {
    const building = resp.responseValue(responseFieldLabels.building)
    const area = resp.responseValue(responseFieldLabels.area)
    const shortSummary = resp.responseValue(responseFieldLabels.element)

    return building + " " + area + ": " + shortSummary
  }()

  const someTicketParts: Partial<TicketParts> = {}
  let jira = {
    issueKey: issueKey,
    apiToken: "tok-" + Math.random(),
    issueRestUrl: issueRestUrl,
    summaryLine: summaryLine,
    assertTicketCreated(t: Partial<TicketParts>) {

      expect(urlFetchApp.fetch.mock.calls[0]).filesJiraTicket({
        isUrgent: t.isUrgent!,
        summary: summaryLine,
        ...t // override summary if provided in arg
      })
    },
    someTicketParts: someTicketParts
  };

  // noinspection JSUnusedLocalSymbols
  global.UrlFetchApp = urlFetchApp
  global.DriveApp = mockDriveApp(jira.apiToken)
  extendJestWithJiraMatcher(resp, jira.apiToken)
  return jira
}


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
