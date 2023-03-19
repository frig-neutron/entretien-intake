import URLFetchRequestOptions = GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;
import HttpHeaders = GoogleAppsScript.URL_Fetch.HttpHeaders;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;

let inTestMode = false
let testModePrefix = ""

let responsesSheet: Sheet
let logSheet: Sheet

let columnIndex: { [k: string]: number }
let jiraBasicAuthToken: string
let roleDirectory: { [role: string | number]: DirectoryEntry[] }
const jiraPriorityUrgent = "Urgent"
const jiraPriorityMedium = "Medium"
const responseFieldLabels: { [label: string]: string } = {
  building: "Bâtiment",
  element: "Elément",
  description: "Description",
  area: "Zone",
  reportedBy: "Rapporté par",
  priority: "Priorité"
}

/**
 * Delayed init or unit tests won't run b/c of missing symbols
 */
function init() {
  responsesSheet = requireSheetByName("Form responses 1")
  logSheet = requireSheetByName("state-of-affairs");
  columnIndex = indexResponseFields()
  jiraBasicAuthToken = loadJiraBasicAuthToken()
}

function requireSheetByName(name: string): Sheet {
  const requiredSheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!requiredSheet) {
    throw `Required sheet '${name}' not found`
  }
  return requiredSheet
}

class TicketContext {
  jiraTicket: object
  formData: FormData
  rowIndex: number
  sendResponse: HTTPResponse | null = null
  jiraTicketRestLink: any
  jiraTicketUserLink: any
  jiraTicketKey: any

  constructor(jiraTicket: object, formData: FormData) {
    this.jiraTicket = jiraTicket
    this.formData = formData
    this.rowIndex = formData.rowIndex
  }
}

class FormData {
  rowIndex: number
  building: string
  summary: string
  description: string
  area: string
  reporter: string
  priority: string

  constructor(rowData: string[], rowIndex: number) {
    function rowFieldValue(fieldName: string) {
      return rowData[columnIndex[fieldName]]
    }

    this.rowIndex = rowIndex
    this.building = rowFieldValue(responseFieldLabels.building)
    this.summary = rowFieldValue(responseFieldLabels.element)
    this.description = rowFieldValue(responseFieldLabels.description)
    this.area = rowFieldValue(responseFieldLabels.area)
    this.reporter = rowFieldValue(responseFieldLabels.reportedBy)
    this.priority = this.mapFormToJiraPriority(rowFieldValue(responseFieldLabels.priority)
    )
  }

  mapFormToJiraPriority(formPriorityValue: string) {
    if (formPriorityValue.startsWith("Urgent")) {
      return jiraPriorityUrgent
    } else {
      return jiraPriorityMedium
    }
  }
}

// ENTRY POINT
// noinspection JSUnusedLocalSymbols
function toJira(e: any) {
  inTestMode = false
  testModePrefix = ""
  roleDirectory = referenceRoleDirectory()
  run();
}

function run() {
  init()
  let numRows = responsesSheet.getLastRow();
  let dataRange = responsesSheet.getRange(2, 1, numRows - 1, responsesSheet.getLastColumn())

  const rowOffset: number = 2 // 1 for header & 1 for starting count from 1
  const tickets: TicketContext[] = dataRange.getValues().map((r, i) => new FormData(r, i + rowOffset)).map((f) => new TicketContext(asTicket(f), f))
  sendAll(tickets);
}

// ENTRY POINT FOR TEST MODE
// noinspection JSUnusedLocalSymbols
function toJiraTestMode(e: any) {
  inTestMode = true
  for (const role in roleDirectory) {
    const receivers = roleDirectory[role]
    for (const receiverIndex in receivers) {
      let email = receivers[receiverIndex].email
      let atIndex = email.indexOf('@');
      receivers[receiverIndex].email = "frig.neutron+" + email.substring(0, atIndex) + "@gmail.com"
    }
  }
  testModePrefix = "TEST - "
  run()
}

function indexResponseFields(): { [k: string]: number } {
  const headerValues: string[] = getHeaderValues()
  return indexFields(headerValues);
}

function getHeaderValues(): string[] {
  let nCols = responsesSheet.getLastColumn()
  let headerRange = responsesSheet.getRange(1, 1, 1, nCols)
  return headerRange.getValues()[0]
}

// return {fieldName: columnIndex} object
function indexFields(headerRow: string[]): { [k: string]: number } {
  const entries = new Map(headerRow.map((e, i) => [e, i]))
  return Object.fromEntries(entries)
}

// must deserialize to com.atlassian.jira.rest.v2.issue.IssueUpdateBean
// https://docs.atlassian.com/software/jira/docs/api/7.2.2/com/atlassian/jira/rest/v2/issue/IssueUpdateBean.html
function asTicket(formData: FormData): object {
  return {
    "fields": {
      "project": {
        "key": "TRIAG"
      },
      "summary": testModePrefix + summarize(formData),
      "description": createDescription(formData),
      // "customfield_10038": {"id": 10033}, // building
      // "Area": formData.area,
      "priority": {"name": formData.priority},
      "issuetype": {
        "name": "Intake"
      }
    }
  };
}

function summarize(formData: FormData) {
  return formData.building + " " + formData.area + ": " + formData.summary
}

function createDescription(formData: FormData) {
  return formData.description + "\n\n" +
      "Reported by " + formData.reporter;
}

// input is [TicketContext, ...]
function sendAll(tickets: TicketContext[]) {
  tickets.map(ticketContext => sendAndMark(ticketContext))
}

function sendAndMark(ticketContext: TicketContext) {
  if (notAlreadySent(ticketContext.rowIndex)) {
    ticketContext.sendResponse = sendOne(ticketContext)
    markSent(ticketContext)
    dispatch(ticketContext)
  }
}

function notAlreadySent(ticketRowIndex: number) {
  let timestampValue = logSheet.getRange(ticketRowIndex, 1).getValue();
  return timestampValue === "";
}

function sendOne(ticketContext: TicketContext): HTTPResponse {
  const payload: string = JSON.stringify(ticketContext.jiraTicket);
  const url = "https://lalliance.atlassian.net/rest/api/latest/issue"
  const headers: HttpHeaders = {
    "contentType": "application/json",
    "Accept": "application/json",
    "authorization": "Basic " + jiraBasicAuthToken
  };

  const options: URLFetchRequestOptions = {
    "contentType": "application/json",
    "method": "post",
    "headers": headers,
    "payload": payload
  };

  return UrlFetchApp.fetch(url, options);
}

function markSent(ticketContext: TicketContext) {
  let contentJson = JSON.parse(ticketContext.sendResponse ? ticketContext.sendResponse.getContentText() : "")
  let issueKey = contentJson.key
  let link = contentJson.self
  ticketContext.jiraTicketRestLink = link
  ticketContext.jiraTicketUserLink = "https://lalliance.atlassian.net/browse/" + issueKey
  ticketContext.jiraTicketKey = issueKey
  let ticketRowIndex = ticketContext.rowIndex
  mark(ticketRowIndex, 1, new Date().toISOString())
  mark(ticketRowIndex, 2, issueKey)
  mark(ticketRowIndex, 3, link)

}

function mark(ticketRowIndex: number, columnIndex: number, value: any) {
  logSheet.getRange(ticketRowIndex, columnIndex).setValue(value)
}

////////////////////////// DISPATCH ///////////////////////////
////////////////////////// DISPATCH ///////////////////////////
////////////////////////// DISPATCH ///////////////////////////

type DirectoryEntry = { name: string, email: string }

function referenceRoleDirectory(): { [role: string | number]: DirectoryEntry[] } {
  return {
    3735: [
      {"name": "Luis", "email": "luis.chepen+intake@gmail.com"},
    ],
    3737: [
      {"name": "Emmanuelle", "email": "emmanuelleraynauld+intake@gmail.com"},
      {"name": "Moussa", "email": "yassaoubangoura@yahoo.fr"},
    ],
    3739: [
    ],
    3743: [
      {"name": "Monika", "email": "mgutkowska2+intake@gmail.com"},
    ],
    3745: [
      {"name": "Diego A", "email": "diegoabellap+intake@gmail.com"},
    ],
    urgence: [
      {"name": "Monica", "email": "mgutkowska2+intake@gmail.com"},
    ],
    triage: [
      {"name": "Kosai", "email": "shkosi@hotmail.com"},
      {"name": "Kris", "email": "kris.onishi@mcgill.ca"},
      {"name": "Diego B", "email": "cuibafilms+intake@gmail.com"},
      {"name": "Entretien committee mailbox", "email": "entretienlalliance+intake@gmail.com"},
    ]
  }
}

function createNotificationEmail(ticketContext: TicketContext) {
  let building = ticketContext.formData.building
  let buildingReps = roleDirectory[ticketContext.formData.building]
  let buildingRepEmails = buildingReps.map(br => renderBuildingRepEmail(br, building, ticketContext))
  let urgenceEmails = renderUrgenceEmails(ticketContext)
  let triageEmails = roleDirectory.triage.map(triager => renderTriageEmail(triager, ticketContext))
  return buildingRepEmails.concat(triageEmails).concat(urgenceEmails);
}

function dispatch(ticketContext: TicketContext) {
  let emails = createNotificationEmail(ticketContext);
  emails.map(email => MailApp.sendEmail(email))
}

const emailBodyTemplate = (recipient: DirectoryEntry, ticketContext: TicketContext, sendReason: any) =>
    `Dear ${recipient.name}

  Please be informed that ${ticketContext.formData.reporter} has submitted ${
        isUrgent(ticketContext) ? "an URGENT" : "a"} maintenance report:
  ------------------
  ${renderTicketForEmail(ticketContext)}
  -----------------
  Jira ticket ${ticketContext.jiraTicketUserLink} has been assigned to this report.
  You are receiving this email because ${sendReason}. 
  
  `

function renderBuildingRepEmail(recipient: DirectoryEntry, building: string, ticketContext: TicketContext) {
  let emailBody = emailBodyTemplate(recipient, ticketContext,
      `you are a building representative for ${building}`)

  return {
    to: recipient.email,
    subject: renderSubjectForEmail(ticketContext),
    body: emailBody
  }
}

function renderTriageEmail(recipient: DirectoryEntry, ticketContext: TicketContext) {
  let emailBody = emailBodyTemplate(recipient, ticketContext, `you are a triage responder`)

  return {
    to: recipient.email,
    subject: renderSubjectForEmail(ticketContext),
    body: emailBody
  }
}

function renderUrgenceEmails(ticketContext: TicketContext) {
  function renderUrgenceEmail(recipient: DirectoryEntry) {
    let emailBody = emailBodyTemplate(recipient, ticketContext, `you are an Urgence-level responder`)

    return {
      to: recipient.email,
      subject: renderSubjectForEmail(ticketContext),
      body: emailBody
    }
  }

  if (isUrgent(ticketContext)) {
    return roleDirectory.urgence.map(ur => renderUrgenceEmail(ur))
  } else {
    return []
  }
}

function isUrgent(ticketContext: TicketContext) {
  return ticketContext.formData.priority === jiraPriorityUrgent;
}

function renderSubjectForEmail(ticketContext: TicketContext) {
  return testModePrefix + (
      isUrgent(ticketContext) ?
          "URGENT maintenance report from " + ticketContext.formData.reporter :
          "Maintenance report from " + ticketContext.formData.reporter
  )
}

function renderTicketForEmail(ticketContext: TicketContext) {
  return summarize(ticketContext.formData) + "\n" + ticketContext.formData.description
}

function loadJiraBasicAuthToken(): string {
  let rootFolder = DriveApp.getRootFolder()
  let jiraFolder = rootFolder.getFoldersByName("jira").next()
  let tokenFile = jiraFolder.getFilesByName("jira-basic-auth-token").next()
  let blob = tokenFile.getBlob();
  return blob.getDataAsString().trim();
}

export {toJira, toJiraTestMode, responseFieldLabels, roleDirectory}
